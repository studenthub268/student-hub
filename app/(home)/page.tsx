import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, MoveUpRight, Search } from "lucide-react";
import { ResourceCard } from "@/components/resources/ResourceCard";
import { LiveStats } from "@/components/ui/LiveStats";
import { QuoteCard } from "@/components/ui/QuoteCard";
import { ContributeCta } from "@/components/ui/ContributeCta";
import { db } from "@/lib/db";
import { resources, users } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";

// Cache at CDN/edge for 60s, serve stale for up to 5min while revalidating
export const revalidate = 60;

export const metadata: Metadata = {
  title: "Student Hub — Free Study Notes & Past Papers by Students",
  description:
    "Download free university notes, past papers and study resources shared by students. Peer-powered, always free, searchable by subject and type — built for UET students.",
  alternates: { canonical: "/" },
};
/** Recent uploads — rendered ON the server with the page (no client fetch
    waterfall). The page's `revalidate = 60` caches the whole result. */
async function getRecentResources() {
  try {
    return await db
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
        uploadKey: resources.uploadKey,
        createdAt: resources.createdAt,
        uploader: { name: users.name },
      })
      .from(resources)
      .leftJoin(users, eq(resources.uploaderId, users.id))
      .orderBy(desc(resources.createdAt))
      // Three: the home section is a teaser, not a feed — Browse owns the
      // full list. Also matches the three-column desktop grid exactly.
      .limit(3);
  } catch {
    return [];
  }
}

export default async function Home() {
  // No auth() here: it forced dynamic rendering, so every request re-ran the
  // DB query and streamed the whole document late (Lighthouse Speed Index 40
  // on desktop). Static + revalidate=60 serves the page from the CDN edge;
  // the final CTA renders for guests in the static HTML — ContributeCta hides
  // it client-side for signed-in users without making the page dynamic.
  const recentResources = await getRecentResources();

  // JSON-LD: WebSite + SearchAction lets Google show a search box directly in
  // sitelinks for the brand query.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Student Hub",
    url: process.env.APP_URL || "https://student-hub-uet.vercel.app",
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${process.env.APP_URL || "https://student-hub-uet.vercel.app"}/browse?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className="flex flex-col min-h-screen bg-surface text-foreground font-sans selection:bg-accent selection:text-accent-contrast">

      {/* Brutalist Bento Hero Section */}
      <section className="px-6 sm:px-6 lg:px-8 py-8 sm:py-10 max-w-[1400px] mx-auto w-full overflow-hidden">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8">

          {/* Top Left: Massive Headline.
              justify-start (not center): the Welcome card's min-height made
              the row taller than the headline block, so centring pushed the
              H1 below the card's top edge and the card read as the page's
              first element. Top-aligned, the value proposition leads. */}
          <div className="lg:col-span-8 flex flex-col justify-start pb-6 lg:pb-0 relative">
            <h1 className="text-4xl sm:text-6xl lg:text-7xl font-bold leading-[0.88] tracking-[-0.035em] uppercase">
              STUDY SMARTER.<br/>
              <span className="text-accent">SHARE MORE.</span>
            </h1>
          </div>

          {/* Top Right: Welcome Block (Button) */}
          <Link
            href="/browse"
            className="lg:col-span-4 bg-ink on-ink rounded-[2rem] p-6 sm:p-8 flex flex-col justify-between shadow-xl relative overflow-hidden group min-h-[240px] hover:scale-[1.02] transition-all hover:shadow-2xl border-2 border-transparent hover:border-accent"
          >
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-neutral-800/40 via-ink to-ink opacity-50"></div>
            <div className="relative z-10 flex justify-between items-start">
              <div className="border border-foreground/40 rounded-full px-4 py-1 text-xs font-light tracking-wide">Welcome</div>
              <Search className="text-accent w-8 h-8 group-hover:scale-110 transition-transform" strokeWidth={2.5} />
            </div>
            <div className="relative z-10 mt-12">
              <p className="text-base sm:text-lg font-semibold opacity-90 leading-snug">
                Discover a new way of learning with our peer-powered sharing platform. Access top materials and succeed with us.
              </p>
            </div>
            <div className="relative z-10 mt-4 flex items-center gap-2 text-accent font-bold tracking-wider text-xs opacity-0 group-hover:opacity-100 transition-opacity">
              Find Resources <ArrowUpRight size={16} />
            </div>
          </Link>

          {/* Bottom Left: Branding + Live Stats.
              Both children stretch to an equal share of the column height, so
              this stack's top and bottom edges line up with the teal block
              beside it instead of leaving a ragged, short column. */}
          <div className="lg:col-span-4 flex flex-col gap-6 lg:gap-8">
            <div className="flex-1 min-h-36"><QuoteCard /></div>
            <div className="flex-1 min-h-36"><LiveStats /></div>
          </div>

          {/* Bottom Right: Large Lime Accent Block */}
          <div className="lg:col-span-8 bg-accent text-accent-contrast rounded-[2rem] p-8 sm:p-10 flex flex-col justify-between relative group overflow-hidden shadow-sm border-2 border-line hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
            <div className="flex flex-wrap gap-2 relative z-10">
              {/* prefetch={false}: App Router eagerly prefetches every in-view
                  /browse variant, so three filter links became six RSC
                  requests (~600ms each on throttled mobile) competing with
                  the LCP resource. The plain /browse links still prefetch. */}
              <Link prefetch={false} href="/browse?type=notes" className="bg-ink on-ink px-4 py-1.5 rounded-full text-xs font-medium hover:bg-ink/80 transition-colors">Study Materials</Link>
              <Link prefetch={false} href="/browse?type=past-paper" className="border border-accent-contrast/40 text-accent-contrast px-4 py-1.5 rounded-full text-xs font-medium hover:bg-accent-contrast hover:text-accent transition-colors">Past Papers</Link>
              <Link prefetch={false} href="/browse?type=quiz" className="border border-accent-contrast/40 text-accent-contrast px-4 py-1.5 rounded-full text-xs font-medium hover:bg-accent-contrast hover:text-accent transition-colors">Quizzes</Link>
            </div>
            <div className="mt-12 sm:mt-16 relative z-10">
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-normal tracking-tight mb-6">Accessible</h2>
              <div className="flex flex-col sm:flex-row justify-between items-end border-t border-line pt-6 gap-6">
                <p className="max-w-md text-base font-medium text-accent-contrast/90 leading-relaxed">
                  Our platform adapts to your academic needs and provides a library that helps you ace your exams. Experience the future of studying today.
                </p>
                <Link
                  href="/browse"
                  aria-label="Browse all resources"
                  className="bg-transparent group-hover:scale-110 transition-transform duration-300"
                >
                  <MoveUpRight className="w-16 h-16 sm:w-20 sm:h-20" strokeWidth={1.5} aria-hidden />
                </Link>
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* Recent Resources — server-rendered with the page */}
      <section className="px-4 sm:px-6 lg:px-8 py-12 max-w-[1400px] mx-auto w-full border-t border-line mt-6">
        {/* Heading left, action right. The two are tied together by sharing
            this row (and by the link aligning to the heading block's baseline),
            rather than by sitting next to each other. Always rendered — the
            old `hidden sm:` meant phones had no path to Browse at all — and it
            wraps under the heading on narrow widths instead of squeezing it. */}
        <div className="mb-12 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div>
            <h2 className="text-3xl sm:text-4xl font-medium tracking-tight">Recent Uploads</h2>
            <p className="mt-3 text-foreground/60 font-medium">The latest materials shared by your community.</p>
          </div>
          <Link href="/browse" className="inline-flex items-center gap-2 font-bold tracking-wider text-xs hover:opacity-70 transition-opacity">
            Go to Browse <MoveUpRight className="w-4 h-4" />
          </Link>
        </div>

        {recentResources.length === 0 ? (
          <div className="text-center py-10 bg-surface-muted rounded-2xl border border-dashed border-line">
            <p className="text-foreground/60 font-medium text-sm">No resources found yet</p>
          </div>
        ) : (
          // One or two uploads: centre the row at a comfortable width instead
          // of pinning cards to the left edge of a three-column grid.
          <div className={
            recentResources.length === 1
              ? "mx-auto w-full max-w-md"
              : recentResources.length === 2
                ? "mx-auto grid w-full max-w-2xl grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6"
                : "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6"
          }>

            {recentResources.map((resource) => (
              <div key={resource.id} className="h-full">
                <ResourceCard resource={resource} />
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Final CTA — hidden client-side for signed-in users (keeps the page static) */}
      <ContributeCta />
      </div>
    </>
  );
}
