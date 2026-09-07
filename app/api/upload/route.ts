import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { putR2Object } from "@/lib/r2";
import { randomUUID } from "crypto";
import { validateFile } from "@/lib/uploads";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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