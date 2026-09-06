import BrowseContent from "./BrowseContent";
import { Suspense } from "react";
import { db } from "@/lib/db";
import { resources, users } from "@/lib/db/schema";
import { desc, eq, and, or, ilike, sql } from "drizzle-orm";
import { escapeLike } from "@/lib/utils";

// Cached at the CDN and revalidated in the background; searchParams make each
// query variant its own cache entry. Mutations (upload/delete/admin) call
// revalidatePath("/browse") so new data appears within seconds.
export const revalidate = 120;

const CARD_COLUMNS = {
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
  uploader: { name: users.name },
};

/** Build the WHERE predicate shared by the results and count queries. */
function searchPredicate(q?: string) {
  if (!q?.trim()) return undefined;
  const pattern = `%${escapeLike(q.trim())}%`;
  return or(
    ilike(resources.title, pattern),
    ilike(resources.description, pattern),
    ilike(resources.professor, pattern),
    ilike(resources.subject, pattern),
  );
}

export type FacetCounts = {
  typeCounts: Record<string, number>;
  subjectCounts: Record<string, number>;
  total: number;
};

/**
 * Faceted counts — each facet is aggregated with the search query applied
 * but the OTHER facet ignored, so pills always advertise reachable results.
 */
async function getFacetCounts(q?: string): Promise<FacetCounts> {
  const empty = { typeCounts: {}, subjectCounts: {}, total: 0 };
  try {
    const where = searchPredicate(q);

    const [typeRows, subjectRows, totalRows] = await Promise.all([
      db
        .select({ value: resources.type, count: sql<number>`count(*)::int` })
        .from(resources)
        .where(where)
        .groupBy(resources.type),
      db
        .select({ value: resources.subject, count: sql<number>`count(*)::int` })
        .from(resources)
        .where(where)
        .groupBy(resources.subject),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(resources)
        .where(where),
    ]);

    const typeCounts: Record<string, number> = {};
    for (const row of typeRows) typeCounts[row.value] = row.count;
    const subjectCounts: Record<string, number> = {};
    for (const row of subjectRows) subjectCounts[row.value] = row.count;

    return { typeCounts, subjectCounts, total: totalRows[0]?.count ?? 0 };
  } catch (e) {
    console.error("Failed to load facet counts:", e);
    return empty;
  }
}

/**
 * Single source of truth for filtering: the database. All three filters
 * (q, type, subject) are applied in SQL; the client only renders.
 */
async function getResources(q?: string, type?: string, subject?: string) {
  try {
    const conditions = [];

    const search = searchPredicate(q);
    if (search) conditions.push(search);
    if (type && type !== "all") conditions.push(eq(resources.type, type));
    if (subject && subject !== "all") conditions.push(eq(resources.subject, subject));

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    return await db
      .select(CARD_COLUMNS)
      .from(resources)
      .leftJoin(users, eq(resources.uploaderId, users.id))
      .where(where)
      .orderBy(desc(resources.createdAt))
      .limit(200);
  } catch (e) {
    console.error("Failed to load browse resources:", e);
    return [];
  }
}

export default async function BrowsePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string; subject?: string }>;
}) {
  const { q, type, subject } = await searchParams;
  const [data, facets] = await Promise.all([getResources(q, type, subject), getFacetCounts(q)]);

  return (
    <Suspense fallback={<div className="container mx-auto p-12 text-center">Loading resources...</div>}>
      <BrowseContent
        resources={data}
        typeCounts={facets.typeCounts}
        subjectCounts={facets.subjectCounts}
        total={facets.total}
      />
    </Suspense>
  );
}
