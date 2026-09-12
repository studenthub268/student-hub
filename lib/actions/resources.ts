"use server";

import { db } from "@/lib/db";
import { resources, users } from "@/lib/db/schema";

import { auth } from "@/lib/auth";
import { z } from "zod";
import { revalidatePath, revalidateTag } from "next/cache";
import { eq, desc, ilike, and, or, isNull, sql } from "drizzle-orm";
import { deleteR2Object } from "@/lib/r2";
import { escapeLike } from "@/lib/utils";
import { ALLOWED_FILE_TYPES, MAX_FILE_SIZE } from "@/lib/uploads";
import { checkRateLimit } from "./rate-limit";
import { runAsUser } from "@/lib/db/scoped";

const resourceSchema = z.object({
  title: z.string().min(3).max(100),
  description: z.string().max(500).optional(),
  type: z.enum(["assignment", "quiz", "past-paper", "notes", "other"]),
  subject: z.string().min(2).max(50),
  professor: z.string().max(50).optional(),
  department: z.string().max(50).optional(),
  file_url: z.string().url(),
  file_key: z.string().min(1).max(500),
  file_type: z.string().refine((val) => ALLOWED_FILE_TYPES.has(val), {
    message: "File type not allowed",
  }),
  file_size: z.number().min(1).max(MAX_FILE_SIZE),
});

export async function uploadResource(formData: {
  title: string;
  description?: string;
  type: string;
  subject: string;
  professor?: string;
  department?: string;
  file_url: string;
  file_key: string;
  file_type: string;
  file_size: number;
}) {
  const session = await auth();
  const uploaderEmail = session?.user?.email;
  if (!session?.user || !uploaderEmail) {
    throw new Error("Authentication required");
  }

  // Verified email required to upload: unverified users can sign in and
  // browse (nagged by the banner), but can't contribute content until they
  // prove ownership of their address.
  const [uploader] = await db
    .select({ emailVerified: users.emailVerified })
    .from(users)
    .where(eq(users.email, uploaderEmail));
  if (!uploader?.emailVerified) {
    throw new Error(
      "Verify your email address before uploading — check your inbox for the verification link, or use 'Resend verification email' at the top of the page."
    );
  }

  // Rate limit uploads per user (10/hour) — storage is the expensive,
  // abusable resource here.
  if (!(await checkRateLimit(`upload:${session.user.id}`, 10, 3600))) {
    throw new Error("Upload limit reached for this hour. Please try again later.");
  }

  const validatedData = resourceSchema.parse(formData);

  // RLS-scoped insert: the database itself rejects a row whose uploader_id
  // isn't the verified session user, even if the code path regresses.
  const results = await runAsUser(session.user.id, (sql) => [
    sql`insert into resources (title, description, type, subject, professor, department, file_url, file_key, file_type, file_size, uploader_id)
        values (${validatedData.title}, ${validatedData.description ?? null}, ${validatedData.type}, ${validatedData.subject},
                ${validatedData.professor ?? null}, ${validatedData.department ?? null}, ${validatedData.file_url},
                ${validatedData.file_key}, ${validatedData.file_type}, ${validatedData.file_size}, ${session.user.id})
        returning id`,
  ]);
  // Batch results: [role-switch rows, identity rows, insert rows].
  const created = (results[2] as { id: string }[] | undefined)?.[0];

  revalidatePath("/");
  revalidatePath("/browse");
  revalidateTag("recent-resources", "default");
  return { id: created?.id };
}

export async function deleteResource(resourceId: string) {
  const parsed = z.string().uuid().safeParse(resourceId);
  if (!parsed.success) throw new Error("Invalid resource id");

  const session = await auth();
  if (!session?.user) {
    throw new Error("Authentication required");
  }

  const resource = await db.query.resources.findFirst({
    where: eq(resources.id, parsed.data),
  });

  if (!resource) {
    throw new Error("Resource not found");
  }

  if (resource.uploaderId !== session.user.id) {
    throw new Error("Unauthorized to delete this resource");
  }

  // Delete from R2
  if (resource.fileKey) {
    await deleteR2Object(resource.fileKey);
  }

  // Delete from DB
  await db.delete(resources).where(eq(resources.id, parsed.data));

  revalidatePath("/");
  revalidatePath("/browse");
  revalidateTag("recent-resources", "default");
}

export async function checkDuplicateResources(
  title: string,
  subject: string,
  department?: string
) {
  try {
    // Guest-reachable and fired on every title keystroke debounce — rate
    // limit per user (or IP for the pre-login flow) to blunt scraping.
    const session = await auth();
    const key = session?.user?.id ?? "guest";
    if (!(await checkRateLimit(`dupcheck:${key}`, 30, 60))) return [];

    // A same-title resource only counts as a duplicate when it belongs to the
    // SAME department (compared case-insensitively). A different department
    // means it is that department's own material — a genuinely new resource.
    // Both sides missing a department counts as the same; a department on one
    // side only counts as different.
    const normalizedDepartment = department?.trim().toLowerCase() || null;
    const departmentFilter = normalizedDepartment
      ? sql`lower(${resources.department}) = ${normalizedDepartment}`
      : isNull(resources.department);

    const duplicates = await db
      .select({
        id: resources.id,
        title: resources.title,
        subject: resources.subject,
        type: resources.type,
        department: resources.department,
        createdAt: resources.createdAt,
        uploader: { name: users.name },
      })
      .from(resources)
      .leftJoin(users, eq(resources.uploaderId, users.id))
      .where(
        and(
          or(
            ilike(resources.title, `%${escapeLike(title)}%`),
            ilike(resources.title, escapeLike(title))
          ),
          eq(resources.subject, subject),
          departmentFilter
        )
      )
      .orderBy(desc(resources.createdAt))
      .limit(5);

    return duplicates;
  } catch (error) {
    console.error("Failed to check duplicates:", error);
    return [];
  }
}
