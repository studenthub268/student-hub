"use server";

import { db } from "@/lib/db";
import { resources, users } from "@/lib/db/schema";

import { auth } from "@/lib/auth";
import { z } from "zod";
import { revalidatePath, revalidateTag, unstable_cache } from "next/cache";
import { eq, desc, ilike, and, or } from "drizzle-orm";
import { deleteR2Object } from "@/lib/r2";
import { escapeLike } from "@/lib/utils";
import { ALLOWED_FILE_TYPES, MAX_FILE_SIZE } from "@/lib/uploads";

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
  if (!session?.user) {
    throw new Error("Authentication required");
  }

  const validatedData = resourceSchema.parse(formData);

  const [resource] = await db.insert(resources).values({
    title: validatedData.title,
    description: validatedData.description,
    type: validatedData.type,
    subject: validatedData.subject,
    professor: validatedData.professor,
    department: validatedData.department,
    fileUrl: validatedData.file_url,
    fileKey: validatedData.file_key,
    fileType: validatedData.file_type,
    fileSize: validatedData.file_size,
    uploaderId: session.user.id,
  }).returning();

  revalidatePath("/");
  revalidatePath("/browse");
  revalidateTag("recent-resources", "default");
  return resource;
}

export async function deleteResource(resourceId: string) {
  const session = await auth();
  if (!session?.user) {
    throw new Error("Authentication required");
  }

  const resource = await db.query.resources.findFirst({
    where: eq(resources.id, resourceId),
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
  await db.delete(resources).where(eq(resources.id, resourceId));

  revalidatePath("/");
  revalidatePath("/browse");
  revalidateTag("recent-resources", "default");
}

export async function checkDuplicateResources(title: string, subject: string) {
  try {
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
          eq(resources.subject, subject)
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

const fetchRecentResources = unstable_cache(
  async () => {
    try {
      const rows = await db
        .select({
          id: resources.id,
          title: resources.title,
          description: resources.description,
          type: resources.type,
          subject: resources.subject,
          fileUrl: resources.fileUrl,
          fileKey: resources.fileKey,
          fileType: resources.fileType,
          fileSize: resources.fileSize,
          uploaderId: resources.uploaderId,
          professor: resources.professor,
          department: resources.department,
          downloads: resources.downloads,
          likes: resources.likes,
          createdAt: resources.createdAt,
          uploader: {
            id: users.id,
            name: users.name,
            email: users.email,
          },
        })
        .from(resources)
        .leftJoin(users, eq(resources.uploaderId, users.id))
        .orderBy(desc(resources.createdAt))
        .limit(6);

      return rows.map((row) => ({
        ...row,
        uploader: row.uploader?.id ? row.uploader : null,
      }));
    } catch (error) {
      console.error("Failed to fetch recent resources:", error);
      return [];
    }
  },
  ["recent-resources"],
  { revalidate: 60, tags: ["recent-resources"] }
);

export async function getRecentResources() {
  return fetchRecentResources();
}
