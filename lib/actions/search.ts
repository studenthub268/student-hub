"use server";

import { db } from "@/lib/db";
import { resources } from "@/lib/db/schema";
import { ilike, or, eq } from "drizzle-orm";
import { escapeLike } from "@/lib/utils";
import { checkRateLimit } from "@/lib/actions/rate-limit";
import { auth } from "@/lib/auth";

export async function searchResourceSuggestions(query: string) {
  if (!query) return [];

  // Guest-reachable and fired on every keystroke debounce — rate limit per
  // user (or shared guest bucket) to blunt scraping. Same guard as
  // checkDuplicateResources. Silently empty on limit: a typeahead showing
  // nothing must never error.
  const session = await auth();
  const key = session?.user?.id ?? "guest-search";
  if (!(await checkRateLimit(`search-suggest:${key}`, 30, 60))) return [];

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
