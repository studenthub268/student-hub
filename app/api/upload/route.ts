import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { putR2Object } from "@/lib/r2";
import { randomUUID } from "crypto";
import { validateFile } from "@/lib/uploads";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { checkRateLimit } from "@/lib/actions/rate-limit";

export async function POST(request: NextRequest) {
  try {
    // CSRF defense-in-depth: Route Handlers don't get the automatic Origin
    // check that Server Actions do. SameSite=Lax cookies already block most
    // cross-site POSTs; this rejects the rest (Lax-bypassing browsers, old
    // clients, subdomain involvement) before any session work happens.
    const origin = request.headers.get("origin");
    if (origin) {
      const host = request.headers.get("host");
      let originHost: string | null = null;
      try {
        originHost = new URL(origin).host;
      } catch {}
      if (!host || originHost !== host) {
        return NextResponse.json({ error: "Cross-origin request rejected" }, { status: 403 });
      }
    }

    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Same shared budget as uploadResource's action-side limit (10/hour per
    // user): the file PUT and the resource row are one logical upload, so
    // both paths draw from the same bucket — storage is the abusable resource.
    if (!(await checkRateLimit(`upload:${session.user.id}`, 10, 3600))) {
      return NextResponse.json({ error: "Upload limit reached for this hour. Please try again later." }, { status: 429 });
    }

    // Verified email required to push files to storage — matches the
    // uploadResource gate, so unverified users can't consume storage for
    // resources they aren't allowed to publish.
    const uploaderEmail = session.user.email;
    if (!uploaderEmail) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const [uploader] = await db
      .select({ emailVerified: users.emailVerified })
      .from(users)
      .where(eq(users.email, uploaderEmail));
    if (!uploader?.emailVerified) {
      return NextResponse.json(
        { error: "Verify your email address before uploading — check your inbox for the verification link, or use 'Resend verification email' at the top of the page." },
        { status: 403 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const validationError = validateFile(file);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const ext = file.name.split(".").pop()?.toLowerCase();
    const key = `${session.user.id}/${randomUUID()}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    await putR2Object(key, buffer, file.type);

    const publicUrl = `${process.env.R2_PUBLIC_URL}/${key}`;

    return NextResponse.json({ key, publicUrl });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { error: "Upload failed" },
      { status: 500 }
    );
  }
}