import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { resources, users, likes } from "@/lib/db/schema";
import { eq, and, ne, desc } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { unstable_cache } from "next/cache";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { getTypeConfig } from "@/lib/constants";
import { ResourceCard } from "@/components/resources/ResourceCard";
import ResourcePreview from "./ResourcePreview";
import ResourceActions from "./ResourceActions";

// The page still runs per request (auth() reads cookies for the like state),
// but the resource payload is cached across requests and invalidated by the
// revalidatePath(`/resource/${id}`) calls in like/edit/delete actions.
const queryResourceCached = (id: string) =>
  unstable_cache(
    async () =>
      db
        .select({
          id: resources.id, title: resources.title, description: resources.description,
          type: resources.type, subject: resources.subject, fileUrl: resources.fileUrl,
          fileKey: resources.fileKey, fileType: resources.fileType, fileSize: resources.fileSize,
          uploaderId: resources.uploaderId, professor: resources.professor,
          department: resources.department,
          downloads: resources.downloads, likes: resources.likes, createdAt: resources.createdAt,
          uploader: { name: users.name },
        })
        .from(resources)
        .leftJoin(users, eq(resources.uploaderId, users.id))
        .where(eq(resources.id, id))
        .limit(1),
    [`resource-${id}`],
    { revalidate: 300 }
  );

async function queryResource(id: string) {
  return queryResourceCached(id)();
}

/**
 * "More like this" — same subject, newest first, current item excluded.
 * Cached on its own key (and invalidated by the same revalidatePath calls as
 * the main payload), so the extra section costs one cached query.
 */
const queryRelatedCached = (id: string, subject: string) =>
  unstable_cache(
    async () =>
      db
        .select({
          id: resources.id, title: resources.title, description: resources.description,
          type: resources.type, subject: resources.subject, fileUrl: resources.fileUrl,
          fileKey: resources.fileKey, fileType: resources.fileType, fileSize: resources.fileSize,
          uploaderId: resources.uploaderId, professor: resources.professor,
          department: resources.department, downloads: resources.downloads, likes: resources.likes,
          uploadKey: resources.uploadKey, createdAt: resources.createdAt,
          uploader: { name: users.name },
        })
        .from(resources)
        .leftJoin(users, eq(resources.uploaderId, users.id))
        .where(and(eq(resources.subject, subject), ne(resources.id, id)))
        .orderBy(desc(resources.createdAt))
        .limit(3),
    [`related-${id}`],
    { revalidate: 300 }
  );

async function queryRelated(id: string, subject: string) {
  try {
    return await queryRelatedCached(id, subject)();
  } catch {
    // Decoration, not content: a failed related query must never take the
    // whole page down with it.
    return [];
  }
}

// 404s must be decided before the response streams: the loading.tsx boundary
// flushes a 200 shell as soon as the page awaits, so a notFound() after the
// DB query can only render a soft-404 page with status 200. generateMetadata
// resolves before that first flush, so its notFound() sets a real 404.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const rows = await queryResource(id);
  if (!rows[0]) notFound();
  const r = rows[0];
  const desc =
    r.description?.slice(0, 155) ||
    `Free ${r.subject} ${String(r.type).toLowerCase()} shared by students on Student Hub — download instantly, no account needed.`;
  return {
    title: r.title,
    description: desc,
    alternates: { canonical: `/resource/${id}` },
    openGraph: {
      title: r.title,
      description: desc,
      url: `/resource/${id}`,
      images: [{ url: "/og-image.png", width: 1200, height: 630, alt: r.title }],
    },
  };
}

export default async function ResourceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // Reject malformed ids before hitting Postgres (a non-uuid comparison
  // throws, which used to land in the catch below as log noise).
  if (!UUID_RE.test(id)) notFound();

  let resource: Awaited<ReturnType<typeof queryResource>>[number] | null = null;

  try {
    const rows = await queryResource(id);
    resource = rows[0] ?? null;
  } catch (e) {
    console.error("Failed to load resource:", e);
    notFound();
  }

  if (!resource) notFound();

  const session = await auth();
  let hasLikedInitially = false;
  if (session?.user) {
    try {
      const [like] = await db
        .select({ id: likes.id })
        .from(likes)
        .where(and(eq(likes.resourceId, id), eq(likes.userId, session.user.id)))
        .limit(1);
      if (like) hasLikedInitially = true;
    } catch (e) {
      console.error("Failed to check like status:", e);
    }
  }

  const typeConfig = getTypeConfig(resource.type);
  const related = await queryRelated(id, resource.subject);

  const uploaderName = resource.uploader?.name || "Unknown";
  const isOwner = Boolean(session?.user?.id) && session!.user!.id === resource.uploaderId;

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 pt-6 pb-14 sm:px-6 lg:px-8 lg:pb-12">
      {/* Breadcrumb — always rendered, so phones keep a path back to the list. */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider">
        <Link
          href="/browse"
          className="inline-flex items-center gap-1.5 text-foreground/70 transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={2.5} aria-hidden />
          Back to Browse
        </Link>
        <span className="text-foreground/40" aria-hidden>/</span>
        <span className="truncate text-foreground/70">{typeConfig.label}</span>
      </nav>

      {/* Bold header: heavy title and ink-bordered chips match the site's
          brutalist identity. */}
      <header className="mt-5 sm:mt-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center rounded-full border-2 border-ink bg-accent px-3.5 py-1 text-xs font-bold tracking-wider text-accent-contrast shadow-hard-sm">
            {typeConfig.label}
          </span>
          <span className="rounded-full border-2 border-ink bg-surface px-3.5 py-1 text-xs font-bold tracking-wider">
            {resource.subject}
          </span>
          {resource.department && (
            <span className="rounded-full border-2 border-ink bg-surface px-3.5 py-1 text-xs font-bold tracking-wider">
              {resource.department}
            </span>
          )}
        </div>

        <h1 className="mt-4 max-w-4xl text-3xl leading-tight font-bold tracking-tight text-foreground sm:text-4xl lg:text-5xl">
          {resource.title}
        </h1>

        {resource.description && (
          <p className="mt-3.5 max-w-3xl text-base leading-relaxed text-foreground/70 sm:text-lg">
            {resource.description}
          </p>
        )}
      </header>

      {/* Workspace: large preview left, details-and-actions rail right.
          On mobile the DOM order is header → preview → rail, so the document
          leads and the actions follow it. */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:mt-7 lg:grid-cols-12 lg:gap-7">
        <div className="min-w-0 lg:col-span-8">
          <ResourcePreview
            title={resource.title}
            fileUrl={resource.fileUrl}
            fileType={resource.fileType}
            fileSize={resource.fileSize}
          />
        </div>

        <aside className="lg:col-span-4">
          <div className="lg:sticky lg:top-24">
            <ResourceActions
              resourceId={resource.id}
              title={resource.title}
              fileUrl={resource.fileUrl}
              fileType={resource.fileType}
              fileSize={resource.fileSize}
              initialLikes={resource.likes || 0}
              hasLikedInitially={hasLikedInitially}
              uploadedAt={new Date(resource.createdAt).toISOString()}
              uploader={uploaderName}
              professor={resource.professor}
              isOwner={isOwner}
              isSignedIn={Boolean(session?.user)}
            />
          </div>
        </aside>
      </div>

      {related.length > 0 && (
        <section className="mt-14 border-t-2 border-ink pt-10">
          <div className="mb-7 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
            <div>
              <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
                More {resource.subject} resources
              </h2>
              <p className="mt-2 text-base font-medium text-foreground/60">
                Other materials shared for this subject.
              </p>
            </div>
            <Link
              href={`/browse?q=${encodeURIComponent(resource.subject)}`}
              className="inline-flex items-center gap-1.5 text-sm font-bold text-foreground transition-colors hover:text-accent"
            >
              Browse all <ArrowUpRight className="h-4 w-4" strokeWidth={2.5} aria-hidden />
            </Link>
          </div>

          <div
            className={
              related.length === 1
                ? "mx-auto w-full max-w-md"
                : "grid grid-cols-1 gap-4 sm:gap-5 md:grid-cols-2 xl:grid-cols-3"
            }
          >
            {related.map((item) => (
              <div key={item.id} className="h-full">
                <ResourceCard resource={item} />
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
