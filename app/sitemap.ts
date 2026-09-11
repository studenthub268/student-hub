import type { MetadataRoute } from "next";
import { db } from "@/lib/db";
import { resources } from "@/lib/db/schema";
import { desc } from "drizzle-orm";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.APP_URL || "https://student-hub-uet.vercel.app";

  const staticPages: MetadataRoute.Sitemap = [
    { url: baseUrl, changeFrequency: "weekly", priority: 1.0 },
    { url: `${baseUrl}/browse`, changeFrequency: "daily", priority: 0.9 },
    { url: `${baseUrl}/contact`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${baseUrl}/terms`, changeFrequency: "monthly", priority: 0.3 },
  ];

  // The resource pages are the rankable content — every one goes in the map,
  // with its upload date as lastmod. ponytail: capped at 5000 (Google's
  // per-sitemap ceiling is 50k; revisit only when this ever gets near it).
  try {
    const rows = await db
      .select({ id: resources.id, createdAt: resources.createdAt })
      .from(resources)
      .orderBy(desc(resources.createdAt))
      .limit(5000);

    return [
      ...staticPages,
      ...rows.map((r) => ({
        url: `${baseUrl}/resource/${r.id}`,
        lastModified: r.createdAt,
        changeFrequency: "monthly" as const,
        priority: 0.7,
      })),
    ];
  } catch (e) {
    console.error("Sitemap: failed to load resources:", e);
    return staticPages;
  }
}
