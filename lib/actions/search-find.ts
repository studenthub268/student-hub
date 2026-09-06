"use server";

import { db } from "@/lib/db";
import { resources } from "@/lib/db/schema";
import { or, ilike } from "drizzle-orm";
import { escapeLike } from "@/lib/utils";

export async function findResources(query: string) {
  const q = escapeLike(query);
  return await db.query.resources.findMany({
    where: or(
      ilike(resources.title, `%${q}%`),
      ilike(resources.subject, `%${q}%`),
      ilike(resources.professor, `%${q}%`),
    ),
    limit: 10,
    with: {
      uploader: true,
    },
  });
}
