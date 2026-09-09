import Link from "next/link";
import { ArrowUpRight, MoveUpRight, Search } from "lucide-react";
import { ResourceCard } from "@/components/resources/ResourceCard";
import { LiveStats } from "@/components/ui/LiveStats";
import { QuoteCard } from "@/components/ui/QuoteCard";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { resources, users } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";

// Cache at CDN/edge for 60s, serve stale for up to 5min while revalidating
export const revalidate = 60;

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
        createdAt: resources.createdAt,
        uploader: { name: users.name },
      })
      .from(resources)
      .leftJoin(users, eq(resources.uploaderId, users.id))
      .orderBy(desc(resources.createdAt))
      .limit(3);
  } catch {
    return [];
  }
}

export default async function Home() {
  const [session, recentResources] = await Promise.all([auth(), getRecentResources()]);

  return (
    <div className="flex flex-col min-h-screen bg-white text-[#111] font-sans selection:bg-[#0D9488] selection:text-black">

      {/* Brutalist Bento Hero Section */}
      <section className="px-6 sm:px-6 lg:px-8 py-8 sm:py-10 max-w-[1400px] mx-auto w-full overflow-hidden">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 fade-up-stagger">

          {/* Top Left: Massive Headline */}
          <div className="lg:col-span-8 flex flex-col justify-center pb-6 lg:pb-0 relative">
            <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold leading-[0.88] tracking-[-0.035em] uppercase">
              STUDY SMARTER.<br/>
              <span className="text-[#0D9488]">SHARE MORE.</span>
            </h1>
          </div>

          {/* Top Right: Welcome Block (Button) */}
          <Link
            href="/browse"
            className="lg:col-span-4 bg-[#111] rounded-[2rem] p-6 sm:p-8 flex flex-col justify-between text-white shadow-xl relative overflow-hidden group min-h-[280px] hover:scale-[1.02] transition-all hover:shadow-2xl border-2 border-transparent hover:border-[#0D9488]"
          >
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-neutral-800/40 via-[#111] to-[#111] opacity-50"></div>
            <div className="relative z-10 flex justify-between items-start">
              <div className="border border-white/40 rounded-full px-4 py-1 text-xs font-light tracking-wide">Welcome</div>
              <Search className="text-[#0D9488] w-8 h-8 group-hover:scale-110 transition-transform" strokeWidth={2.5} />
            </div>
            <div className="relative z-10 mt-12">
              <p className="text-base sm:text-lg font-semibold text-white/90 leading-snug">
                Discover a new way of learning with our peer-powered sharing platform. Access top materials and succeed with us.
              </p>
            </div>
            <div className="relative z-10 mt-4 flex items-center gap-2 text-[#0D9488] font-bold tracking-wider text-xs opacity-0 group-hover:opacity-100 transition-opacity">
              Find Resources <ArrowUpRight size={16} />
            </div>
          </Link>

          {/* Bottom Left: Branding + Live Stats */}
          <div className="lg:col-span-4 flex flex-col gap-6 lg:gap-8">
            <QuoteCard />
            <LiveStats />
          </div>

          {/* Bottom Right: Large Lime Accent Block */}
          <div className="lg:col-span-8 bg-[#0D9488] rounded-[2rem] p-8 sm:p-10 flex flex-col justify-between relative group overflow-hidden shadow-sm border-2 border-black/5 hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
            <div className="flex flex-wrap gap-2 relative z-10">
              <Link href="/browse?type=notes" className="bg-black text-white px-4 py-1.5 rounded-full text-xs font-medium hover:bg-black/80 transition-colors">Study Materials</Link>
              <Link href="/browse?type=past-paper" className="border border-black px-4 py-1.5 rounded-full text-xs font-medium hover:bg-black hover:text-white transition-colors">Past Papers</Link>
              <Link href="/browse?type=notes" className="border border-black px-4 py-1.5 rounded-full text-xs font-medium hover:bg-black hover:text-white transition-colors">Notes</Link>
            </div>
            <div className="mt-12 sm:mt-16 relative z-10">
              <h2 className="text-3xl sm:text-5xl md:text-6xl lg:text-7xl font-normal tracking-tight mb-6">Accessible</h2>
              <div className="flex flex-col sm:flex-row justify-between items-end border-t border-black/20 pt-6 gap-6">
                <p className="max-w-md text-base font-medium text-black/80 leading-relaxed">
                  Our platform adapts to your academic needs and provides a library that helps you ace your exams. Experience the future of studying today.
                </p>
                <Link href="/browse" className="bg-transparent group-hover:scale-110 transition-transform duration-300">
                  <MoveUpRight className="w-16 h-16 sm:w-20 sm:h-20" strokeWidth={1.5} />
                </Link>
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* Recent Resources — server-rendered with the page */}
      <section className="px-4 sm:px-6 lg:px-8 py-12 max-w-[1400px] mx-auto w-full border-t border-gray-200 mt-6 fade-up">
        <div className="flex justify-between items-end mb-12">
          <div className="space-y-2">
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-medium tracking-tight">Recent Uploads</h2>
            <p className="text-black/60 font-medium">The latest materials shared by your community.</p>
          </div>
          <Link href="/browse" className="hidden sm:inline-flex items-center gap-2 font-bold tracking-wider text-xs hover:opacity-70 transition-opacity">
            Go to Browse <MoveUpRight className="w-4 h-4" />
          </Link>
        </div>

        {recentResources.length === 0 ? (
          <div className="text-center py-10 bg-gray-50 rounded-2xl border border-dashed border-black/10">
            <p className="text-black/40 font-medium text-sm">No resources found yet</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6 fade-up-stagger">
            {recentResources.map((resource) => (
              <div key={resource.id} className="h-full">
                <ResourceCard resource={resource} />
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Final CTA - Only show if not logged in */}
      {!session && (
        <section className="px-4 sm:px-6 lg:px-8 py-12 max-w-[1400px] mx-auto w-full below-fold">
          <div className="bg-[#111] text-white rounded-[2rem] sm:rounded-[3rem] p-8 sm:p-12 text-center relative overflow-hidden group">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-neutral-800/20 to-transparent opacity-50"></div>
            <div className="relative z-10">
              <h2 className="text-3xl sm:text-4xl md:text-6xl font-black tracking-tighter mb-6 italic uppercase">Ready to contribute?</h2>
              <p className="text-xl text-white/60 font-medium mb-10 max-w-2xl mx-auto italic">
                Join the thousands of students already sharing their knowledge.
              </p>
              <Link href="/upload" className="inline-flex items-center gap-2 sm:gap-3 bg-[#0D9488] text-black border-2 border-black px-6 sm:px-12 py-4 sm:py-5 rounded-full font-bold text-xs sm:text-sm tracking-wider hover:-translate-y-1 transition-all whitespace-nowrap">
                Upload a Resource <ArrowUpRight />
              </Link>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
