import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { db } from "@/lib/db";
import { resources, users, likes } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { unstable_cache } from "next/cache";
import { ArrowLeft, User, Calendar, FileText, FileImage, File } from "lucide-react";
import { getTypeConfig } from "@/lib/constants";
import { formatFileSize } from "@/lib/utils";
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
  return { title: rows[0].title };
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
  let hasLikedInitially = false;

  try {
    const rows = await queryResource(id);
    resource = rows[0] ?? null;
  } catch (e) {
    console.error("Failed to load resource:", e);
    notFound();
  }

  if (!resource) notFound();

  const session = await auth();
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

  const getFileIcon = (fileType: string | null) => {
    if (!fileType) return <File size={48} className="text-black/40" strokeWidth={1} />;
    if (fileType.includes("pdf")) return <FileText size={48} className="text-black" strokeWidth={1} />;
    if (fileType.includes("image")) return <FileImage size={48} className="text-black" strokeWidth={1} />;
    return <File size={48} className="text-black/40" strokeWidth={1} />;
  };

  const isPDF = resource.fileType?.includes("pdf");
  const isImage = resource.fileType?.includes("image");

  return (
    <div className="container mx-auto px-4 py-8 sm:px-6 lg:px-8 max-w-[1400px]">
      <Link 
        href="/browse" 
        className="hidden md:inline-flex items-center text-sm font-medium text-black hover:opacity-70 mb-8 tracking-wider transition-opacity"
      >
        <ArrowLeft className="mr-2 h-4 w-4" strokeWidth={2} />
        Back to Browse
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Details */}
        <div className="lg:col-span-1 space-y-8">
          <div className="rounded-[2rem] border-2 border-black bg-white p-8 shadow-[4px_4px_0px_0px_#111]">
            <div className="inline-flex items-center rounded-full border border-black px-4 py-1.5 text-xs font-semibold tracking-wider mb-6 bg-[#0D9488]">
              {typeConfig.label}
            </div>
            
            <h1 className="text-4xl font-normal tracking-tight text-black mb-4 leading-tight">{resource.title}</h1>
            <p className="inline-block bg-gray-100 rounded-full px-4 py-1 text-sm font-medium text-black mb-6 border border-black/10">{resource.subject}</p>
            
            {resource.description && (
              <div className="prose prose-sm text-black/70 mb-8 border-t-2 border-black/10 pt-6 font-medium leading-relaxed">
                <p>{resource.description}</p>
              </div>
            )}
            
            <div className="flex flex-col gap-4 border-t-2 border-black/10 pt-6 text-sm text-black font-medium">
              <div className="flex items-center gap-3">
                <div className="p-2 border border-black rounded-full bg-gray-50"><User size={16} strokeWidth={2} /></div>
                <span>Uploaded by <span className="font-bold">{resource.uploader?.name || "Unknown"}</span></span>
              </div>
              <div className="flex items-center gap-3">
                <div className="p-2 border border-black rounded-full bg-gray-50"><Calendar size={16} strokeWidth={2} /></div>
                <span>{new Date(resource.createdAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</span>
              </div>
              {resource.professor && (
                <div className="flex items-center gap-3">
                  <div className="p-2 border border-black rounded-full bg-gray-50"><FileText size={16} strokeWidth={2} /></div>
                  <span>Professor: <span className="font-bold">{resource.professor}</span></span>
                </div>
              )}
            </div>

            <div className="mt-8 border-t-2 border-black/10 pt-6">
              <ResourceActions 
                resourceId={resource.id}
                initialLikes={resource.likes || 0}
                fileUrl={resource.fileUrl}
                fileName={resource.title}
                hasLikedInitially={hasLikedInitially}
                uploaderId={resource.uploaderId}
              />
            </div>
          </div>

          <div className="rounded-[2rem] border-2 border-black bg-white p-8 shadow-[4px_4px_0px_0px_#111]">
            <h3 className="text-xl font-normal text-black mb-6 tracking-tight">File Information</h3>
            <div className="flex items-center gap-6">
              <div className="flex h-20 w-20 items-center justify-center rounded-[1rem] border-2 border-black bg-[#0D9488]">
                {getFileIcon(resource.fileType)}
              </div>
              <div>
                <div className="font-bold text-black text-2xl tracking-tighter">
                  {resource.fileType?.split('/')[1]?.toUpperCase() || "FILE"}
                </div>
                <div className="text-base text-black/60 font-medium tracking-wider mt-1">
                  {resource.fileSize ? formatFileSize(resource.fileSize) : "Unknown size"}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Preview */}
        <div className="lg:col-span-2">
          <div className="rounded-[2rem] border-2 border-black bg-white shadow-[4px_4px_0px_0px_#111] overflow-hidden h-[60vh] sm:h-[70vh] lg:h-full lg:min-h-[800px] flex flex-col">
            <div className="bg-[#111] border-b-2 border-black p-4 px-6 flex justify-between items-center">
              <span className="text-sm font-medium text-white tracking-wider">Document Preview</span>
              <div className="flex gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500"></div>
                <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                <div className="w-3 h-3 rounded-full bg-green-500"></div>
              </div>
            </div>
            
            <div className="flex-1 bg-gray-100 relative p-4 sm:p-8">
              <div className="w-full h-full border-2 border-black border-dashed rounded-2xl bg-white overflow-hidden relative shadow-inner">
                {isPDF ? (
                  <iframe 
                    src={`${resource.fileUrl}#toolbar=0`} 
                    className="w-full h-full border-0 absolute inset-0"
                    title={`Preview of ${resource.title}`}
                  />
                ) : isImage ? (
                  <div className="w-full h-full flex items-center justify-center p-8">
                    <Image
                      src={resource.fileUrl}
                      alt={resource.title}
                      width={1200}
                      height={900}
                      className="max-w-full max-h-full object-contain drop-shadow-[4px_4px_0px_rgba(0,0,0,1)] border-2 border-black"
                    />
                  </div>
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-black">
                    {getFileIcon(resource.fileType)}
                    <p className="mt-6 text-xl font-medium tracking-tight">Preview not available</p>
                    <p className="text-base mt-2 text-black/60 font-medium">Please download the file to view it.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
