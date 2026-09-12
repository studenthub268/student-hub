import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { resources } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import ProfileContent from "./ProfileContent";
import { DeleteAccount } from "./DeleteAccount";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/sign-in?redirectedFrom=/profile");
  }

  let userResources: Awaited<ReturnType<typeof getResources>> = [];
  let totalLikes = 0;
  let profile = null;

  try {
    userResources = await getResources(session.user.id);
    totalLikes = userResources.reduce((sum, r) => sum + (r.likes || 0), 0);
    profile = await db.query.users.findFirst({
      where: (users, { eq }) => eq(users.id, session.user.id),
    });
  } catch (e) {
    console.error("Failed to load profile data:", e);
  }

  return (
    <div className="space-y-12 pb-12">
      <ProfileContent
        profile={profile || null}
        resources={userResources}
        totalLikes={totalLikes}
      />
      {/* Privacy-policy right-to-erasure (see /terms, Section 14) */}
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-[1400px]">
        <DeleteAccount />
      </div>
    </div>
  );
}

async function getResources(userId: string) {
  return await db.query.resources.findMany({
    where: eq(resources.uploaderId, userId),
    orderBy: [desc(resources.createdAt)],
  });
}
