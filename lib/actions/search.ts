"use server";

import { db } from "@/lib/db";
import { resources } from "@/lib/db/schema";
import { ilike, or, eq } from "drizzle-orm";
import { escapeLike } from "@/lib/utils";

export async function searchResourceSuggestions(query: string) {
  if (!query) return [];

  const q = escapeLike(query);
  const results = await db.select({
    id: resources.id,
    title: resources.title,
    subject: resources.subject,
    professor: resources.professor,
  })
  .from(resources)
  .where(
    or(
      ilike(resources.title, `%${q}%`),
      ilike(resources.professor, `%${q}%`)
    )
  )
  .limit(10);

  return results;
}

/** Fetch a single resource by its ID */
export async function getResourceById(id: string) {
  const [resource] = await db.select({
    id: resources.id,
    title: resources.title,
    subject: resources.subject,
    professor: resources.professor,
  })
  .from(resources)
  .where(eq(resources.id, id))
  .limit(1);

  return resource || null;
}
