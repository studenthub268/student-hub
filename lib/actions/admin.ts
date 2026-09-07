"use server";

import { db } from "@/lib/db";
import { blockedIps, adminEmails, resources, messages, reports, users, accounts, emailEvents, suppressedEmails } from "@/lib/db/schema";
import { auth } from "@/lib/auth";
import { eq, desc, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { deleteR2Object } from "@/lib/r2";
import { invalidateBlockedIpsCache } from "@/lib/ip-block";
import { isPermanentAdmin } from "@/lib/constants";

async function isAdmin(email: string): Promise<boolean> {
  const admin = await db.query.adminEmails.findFirst({
    where: eq(adminEmails.email, email),
  });
  return !!admin;
}

/**
 * One-shot loader for the admin panel: a single auth check and all panel
 * queries in parallel. The panel previously fired 7 server actions per load,
 * each re-running auth() + an admin lookup — 14+ sequential round-trips of
 * latency before anything rendered. Refresh after mutations re-uses this.
 */
export async function getAdminPanelData() {
  const session = await auth();
  if (!session?.user?.email) throw new Error("Not authenticated");
  if (!(await isAdmin(session.user.email))) throw new Error("Admin only");

  const [blockedIpsList, admins, resourcesList, messagesList, reportList, emailData, recentAutoBlocks, usersRows, accountsRows, resourceCounts] = await Promise.all([
    db.query.blockedIps.findMany({ orderBy: [desc(blockedIps.blockedAt)] }),
    db.query.adminEmails.findMany(),
    db
      .select({
        id: resources.id,
        title: resources.title,
        description: resources.description,
        type: resources.type,
        subject: resources.subject,
        department: resources.department,
        professor: resources.professor,
        likes: resources.likes,
        createdAt: resources.createdAt,
        uploader: { name: users.name, email: users.email },
      })
      .from(resources)
      .leftJoin(users, eq(resources.uploaderId, users.id))
      .orderBy(desc(resources.createdAt)),
    db.query.messages.findMany({ orderBy: [desc(messages.createdAt)] }),
    db
      .select({
        id: reports.id,
        reason: reports.reason,
        description: reports.description,
        createdAt: reports.createdAt,
        resource: { id: resources.id, title: resources.title },
        reporter: { name: users.name, email: users.email },
      })
      .from(reports)
      .leftJoin(resources, eq(reports.resourceId, resources.id))
      .leftJoin(users, eq(reports.reporterId, users.id))
      .orderBy(desc(reports.createdAt)),
    getEmailHealthStatsInternal().catch(() => null),
    db
      .select({
        id: blockedIps.id,
        ip: blockedIps.ip,
        reason: blockedIps.reason,
        type: blockedIps.type,
        blockedAt: blockedIps.blockedAt,
      })
      .from(blockedIps)
      .where(sql`${blockedIps.blockedBy} = 'system' and ${blockedIps.blockedAt} >= ${new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)}`)
      .orderBy(desc(blockedIps.blockedAt))
      .limit(20),
    db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        image: users.image,
        emailVerified: users.emailVerified,
        createdAt: users.createdAt,
      })
      .from(users)
      .orderBy(desc(users.createdAt)),
    db
      .select({ userId: accounts.userId, provider: accounts.provider })
      .from(accounts),
    db
      .select({ uploaderId: resources.uploaderId, count: sql<number>`count(*)::int` })
      .from(resources)
      .groupBy(resources.uploaderId),
  ]);

  // Merge sign-in providers + upload counts onto each user for the Users tab.
  const usersWithMeta = usersRows.map((u) => ({
    ...u,
    providers: accountsRows.filter((a) => a.userId === u.id).map((a) => a.provider),
    resourceCount: resourceCounts.find((rc) => rc.uploaderId === u.id)?.count ?? 0,
  }));

  return {
    blockedIps: blockedIpsList,
    admins,
    resources: resourcesList,
    messages: messagesList,
    reports: reportList,
    emailStats: emailData,
    autoBlocks: recentAutoBlocks,
    users: usersWithMeta,
  };
}

export async function addAdminEmail(email: string) {
  const session = await auth();
  if (!session?.user?.email) throw new Error("Not authenticated");

  const superAdmin = await isAdmin(session.user.email);
  if (!superAdmin) throw new Error("Only admins can add other admins");

  await db.insert(adminEmails).values({ email });
  return { success: true };
}

export async function blockIp(ip: string, reason: string) {
  const session = await auth();
  if (!session?.user?.email) throw new Error("Not authenticated");

  const admin = await isAdmin(session.user.email);
  if (!admin) throw new Error("Only admins can block IPs");

  await db.insert(blockedIps).values({
    ip,
    reason,
    blockedBy: session.user.email,
  });
  invalidateBlockedIpsCache();

  return { success: true };
}

export async function unblockIp(ip: string) {
  const session = await auth();
  if (!session?.user?.email) throw new Error("Not authenticated");

  const admin = await isAdmin(session.user.email);
  if (!admin) throw new Error("Only admins can unblock IPs");

  await db.delete(blockedIps).where(eq(blockedIps.ip, ip));
  invalidateBlockedIpsCache();
  return { success: true };
}

/**
 * Recent system auto-blocks (last 7 days) — surfaced in the admin Security tab
 * as a banner so silent lockouts (attack-pattern detections) become visible.
 */
export async function getRecentAutoBlocks() {
  const session = await auth();
  if (!session?.user?.email) throw new Error("Not authenticated");
  const admin = await isAdmin(session.user.email);
  if (!admin) throw new Error("Only admins can view auto-blocks");

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  return db
    .select({
      id: blockedIps.id,
      ip: blockedIps.ip,
      reason: blockedIps.reason,
      type: blockedIps.type,
      blockedAt: blockedIps.blockedAt,
    })
    .from(blockedIps)
    .where(sql`${blockedIps.blockedBy} = 'system' and ${blockedIps.blockedAt} >= ${weekAgo}`)
    .orderBy(desc(blockedIps.blockedAt))
    .limit(20);
}

export async function getBlockedIps() {
  const session = await auth();
  if (!session?.user?.email) throw new Error("Not authenticated");

  const admin = await isAdmin(session.user.email);
  if (!admin) throw new Error("Only admins can view blocked IPs");

  return await db.query.blockedIps.findMany({
    orderBy: [desc(blockedIps.blockedAt)],
  });
}

export async function getAdminEmails() {
  const session = await auth();
  if (!session?.user?.email) throw new Error("Not authenticated");

  const admin = await isAdmin(session.user.email);
  if (!admin) throw new Error("Only admins can view admin list");

  return await db.query.adminEmails.findMany();
}

export async function removeAdminEmail(email: string) {
  const session = await auth();
  if (!session?.user?.email) throw new Error("Not authenticated");

  const superAdmin = await isAdmin(session.user.email);
  if (!superAdmin) throw new Error("Only admins can remove admins");

  // Owner accounts are permanent — no one (including themselves via API)
  // can remove them, so the site can never lose its last real admin.
  if (isPermanentAdmin(email)) {
    throw new Error("This admin account is permanent and cannot be removed");
  }

  await db.delete(adminEmails).where(eq(adminEmails.email, email));
  return { success: true };
}

// ============ RESOURCES ============

export async function getAllResources() {
  const session = await auth();
  if (!session?.user?.email) throw new Error("Not authenticated");
  const admin = await isAdmin(session.user.email);
  if (!admin) throw new Error("Admin only");

  return await db
    .select({
      id: resources.id,
      title: resources.title,
      description: resources.description,
      type: resources.type,
      subject: resources.subject,
      department: resources.department,
      professor: resources.professor,
      downloads: resources.downloads,
      likes: resources.likes,
      createdAt: resources.createdAt,
      uploader: { name: users.name, email: users.email },
    })
    .from(resources)
    .leftJoin(users, eq(resources.uploaderId, users.id))
    .orderBy(desc(resources.createdAt));
}

export async function adminDeleteResource(resourceId: string) {
  const session = await auth();
  if (!session?.user?.email) throw new Error("Not authenticated");
  const admin = await isAdmin(session.user.email);
  if (!admin) throw new Error("Admin only");

  const resource = await db.query.resources.findFirst({
    where: eq(resources.id, resourceId),
  });
  if (!resource) throw new Error("Resource not found");

  if (resource.fileKey) {
    await deleteR2Object(resource.fileKey);
  }
  await db.delete(resources).where(eq(resources.id, resourceId));

  revalidatePath("/");
  revalidatePath("/browse");
  return { success: true };
}

export async function adminUpdateResource(
  resourceId: string,
  data: { title?: string; description?: string; subject?: string; type?: string; professor?: string; department?: string }
) {
  const session = await auth();
  if (!session?.user?.email) throw new Error("Not authenticated");
  const admin = await isAdmin(session.user.email);
  if (!admin) throw new Error("Admin only");

  await db.update(resources).set(data).where(eq(resources.id, resourceId));

  revalidatePath("/");
  revalidatePath("/browse");
  revalidatePath(`/resource/${resourceId}`);
  return { success: true };
}

// ============ MESSAGES ============

export async function getAllMessages() {
  const session = await auth();
  if (!session?.user?.email) throw new Error("Not authenticated");
  const admin = await isAdmin(session.user.email);
  if (!admin) throw new Error("Admin only");

  return await db.query.messages.findMany({
    orderBy: [desc(messages.createdAt)],
  });
}

export async function deleteMessage(messageId: string) {
  const session = await auth();
  if (!session?.user?.email) throw new Error("Not authenticated");
  const admin = await isAdmin(session.user.email);
  if (!admin) throw new Error("Admin only");

  await db.delete(messages).where(eq(messages.id, messageId));
  return { success: true };
}

// ============ REPORTS ============

export async function getAllReports() {
  const session = await auth();
  if (!session?.user?.email) throw new Error("Not authenticated");
  const admin = await isAdmin(session.user.email);
  if (!admin) throw new Error("Admin only");

  return await db
    .select({
      id: reports.id,
      reason: reports.reason,
      description: reports.description,
      createdAt: reports.createdAt,
      resource: { id: resources.id, title: resources.title },
      reporter: { name: users.name, email: users.email },
    })
    .from(reports)
    .leftJoin(resources, eq(reports.resourceId, resources.id))
    .leftJoin(users, eq(reports.reporterId, users.id))
    .orderBy(desc(reports.createdAt));
}

export async function deleteReport(reportId: string) {
  const session = await auth();
  if (!session?.user?.email) throw new Error("Not authenticated");
  const admin = await isAdmin(session.user.email);
  if (!admin) throw new Error("Admin only");

  await db.delete(reports).where(eq(reports.id, reportId));
  return { success: true };
}

export async function dismissReportAndDeleteResource(reportId: string, resourceId: string) {
  const session = await auth();
  if (!session?.user?.email) throw new Error("Not authenticated");
  const admin = await isAdmin(session.user.email);
  if (!admin) throw new Error("Admin only");

  // Delete the resource
  const resource = await db.query.resources.findFirst({
    where: eq(resources.id, resourceId),
  });
  if (resource?.fileKey) {
    await deleteR2Object(resource.fileKey);
  }
  await db.delete(resources).where(eq(resources.id, resourceId));

  // Delete all reports for this resource
  await db.delete(reports).where(eq(reports.resourceId, resourceId));

  revalidatePath("/");
  revalidatePath("/browse");
  return { success: true };
}

// ============ USERS ============

/**
 * Delete a user account and everything they own. DB rows cascade via FKs
 * (accounts, sessions, resources, likes, reports); their uploaded R2 files
 * are removed explicitly first so storage doesn't keep orphans.
 */
export async function adminDeleteUser(userId: string) {
  const session = await auth();
  if (!session?.user?.email) throw new Error("Not authenticated");
  const admin = await isAdmin(session.user.email);
  if (!admin) throw new Error("Admin only");

  const target = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!target) throw new Error("User not found");
  if (target.email === session.user.email) {
    throw new Error("You cannot delete your own account");
  }
  if (isPermanentAdmin(target.email)) {
    throw new Error("This account is a permanent admin and cannot be deleted");
  }

  const uploaded = await db
    .select({ fileKey: resources.fileKey })
    .from(resources)
    .where(eq(resources.uploaderId, userId));
  for (const row of uploaded) {
    if (row.fileKey) {
      await deleteR2Object(row.fileKey);
    }
  }
  await db.delete(users).where(eq(users.id, userId));

  revalidatePath("/");
  revalidatePath("/browse");
  return { success: true };
}

// ============ EMAIL HEALTH ============

async function getEmailHealthStatsInternal() {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Counts by event type (last 30 days)
  const eventCounts = await db
    .select({
      eventType: emailEvents.eventType,
      count: sql<number>`count(*)::int`,
    })
    .from(emailEvents)
    .where(sql`${emailEvents.createdAt} >= ${thirtyDaysAgo}`)
    .groupBy(emailEvents.eventType);

  // Recent failures (last 50 bounced/complained events)
  const recentFailures = await db
    .select({
      id: emailEvents.id,
      eventType: emailEvents.eventType,
      to: emailEvents.to,
      subject: emailEvents.subject,
      createdAt: emailEvents.createdAt,
    })
    .from(emailEvents)
    .where(sql`${emailEvents.eventType} IN ('email.bounced', 'email.complained') AND ${emailEvents.createdAt} >= ${thirtyDaysAgo}`)
    .orderBy(desc(emailEvents.createdAt))
    .limit(50);

  // Suppressed email count
  const suppressedCount = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(suppressedEmails);

  // Recent suppressions
  const recentSuppressions = await db
    .select({
      id: suppressedEmails.id,
      email: suppressedEmails.email,
      reason: suppressedEmails.reason,
      suppressedAt: suppressedEmails.suppressedAt,
    })
    .from(suppressedEmails)
    .orderBy(desc(suppressedEmails.suppressedAt))
    .limit(20);

  // Build a map of counts
  const counts: Record<string, number> = {};
  for (const row of eventCounts) {
    counts[row.eventType] = row.count;
  }

  const sent = (counts["email.sent"] || 0) + (counts["email.delivered"] || 0);
  const delivered = counts["email.delivered"] || 0;
  const bounced = counts["email.bounced"] || 0;
  const complained = counts["email.complained"] || 0;
  const opened = counts["email.opened"] || 0;
  const clicked = counts["email.clicked"] || 0;

  return {
    totals: {
      sent,
      delivered,
      bounced,
      complained,
      opened,
      clicked,
      deliveryRate: sent > 0 ? ((delivered / sent) * 100).toFixed(1) : "0",
      bounceRate: sent > 0 ? ((bounced / sent) * 100).toFixed(1) : "0",
      openRate: delivered > 0 ? ((opened / delivered) * 100).toFixed(1) : "0",
    },
    recentFailures,
    suppressedCount: suppressedCount[0]?.count || 0,
    recentSuppressions,
  };
}

/** Public wrapper kept for any standalone email-stats use. */
export async function getEmailHealthStats() {
  const session = await auth();
  if (!session?.user?.email) throw new Error("Not authenticated");
  if (!(await isAdmin(session.user.email))) throw new Error("Admin only");
  return getEmailHealthStatsInternal();
}
