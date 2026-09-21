"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { blockedIps, adminEmails, resources, messages, reports, users, accounts, emailEvents, suppressedEmails, pageViews } from "@/lib/db/schema";
import { auth } from "@/lib/auth";
import { eq, desc, sql, gte } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { deleteR2Object } from "@/lib/r2";
import { invalidateBlockedIpsCache } from "@/lib/ip-block";
import { isPermanentAdmin } from "@/lib/constants";
import { checkRateLimit } from "@/lib/actions/rate-limit";

async function isAdmin(email: string): Promise<boolean> {
  const admin = await db.query.adminEmails.findFirst({
    where: eq(adminEmails.email, email),
  });
  return !!admin;
}

/**
 * Admin actions are session-gated but still untrusted INPUT — a phished or
 * hijacked admin session (or a compromised client calling the exported
 * action directly) must not be able to spam the controls: blockIp rows feed
 * the middleware blocklist checked on EVERY request, and adminEmails rows
 * gate every admin action. Modest per-admin budgets, just enough for a
 * human running the panel.
 */
async function adminActionGuard(email: string, action: string, limit = 30, windowSeconds = 300): Promise<void> {
  if (!(await checkRateLimit(`admin:${email}:${action}`, limit, windowSeconds))) {
    throw new Error("Too many admin actions — slow down.");
  }
}

// Security best practice: admin actions feed the IP blocklist (checked on
// EVERY request) and the admin-email table (checked on EVERY admin action),
// so inputs are validated at the trust boundary — a malformed value here
// silently degrades both controls.
const adminEmailSchema = z.string().trim().toLowerCase().email().max(254);
// zod v4: IP formats moved to top-level schemas; accept v4 and v6.
const ipAddressSchema = z.union([z.ipv4(), z.ipv6()]);
// Mass-assignment guard: only these fields are ever writable via the admin
// resource editor, and each gets its own bound. (The upload path uses
// resources.ts's stricter create schema.)
const adminResourceUpdateSchema = z
  .object({
    title: z.string().min(3).max(100),
    description: z.string().max(500),
    subject: z.string().min(2).max(50),
    type: z.enum(["assignment", "quiz", "past-paper", "notes", "other"]),
    professor: z.string().max(50),
    department: z.string().max(50),
  })
  .partial()
  .refine((d) => Object.keys(d).length > 0, { message: "No fields to update" });

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

/**
 * Aggregated, privacy-safe traffic overview for the admin Traffic tab (see
 * /api/analytics — the collector). Reads only the page_views aggregate: one
 * row per (path, day, referrer-host). No IPs, no visitor identifiers exist
 * in this table, so nothing here can de-anonymize a visitor.
 */
export async function getTrafficData() {
  const session = await auth();
  if (!session?.user?.email) throw new Error("Not authenticated");
  if (!(await isAdmin(session.user.email))) throw new Error("Admin only");

  // `day` is UTC yyyy-mm-dd text — lexicographic compare == date compare.
  const utcDay = (offset: number) => {
    const t = new Date();
    t.setUTCDate(t.getUTCDate() - offset);
    return t.toISOString().slice(0, 10);
  };
  const today = utcDay(0);
  const d7 = utcDay(6); // inclusive 7-day window ending today
  const d30 = utcDay(29);

  const [totalsRow, daily, topPaths, topReferrers] = await Promise.all([
    db
      .select({
        today: sql<number>`coalesce(sum(${pageViews.views}) filter (where ${pageViews.day} >= ${today}), 0)::int`,
        last7: sql<number>`coalesce(sum(${pageViews.views}) filter (where ${pageViews.day} >= ${d7}), 0)::int`,
        last30: sql<number>`coalesce(sum(${pageViews.views}) filter (where ${pageViews.day} >= ${d30}), 0)::int`,
        allTime: sql<number>`coalesce(sum(${pageViews.views}), 0)::int`,
      })
      .from(pageViews),
    db
      .select({
        day: pageViews.day,
        views: sql<number>`sum(${pageViews.views})::int`,
      })
      .from(pageViews)
      .where(gte(pageViews.day, d30))
      .groupBy(pageViews.day)
      .orderBy(pageViews.day),
    db
      .select({
        path: pageViews.path,
        views: sql<number>`sum(${pageViews.views})::int`,
      })
      .from(pageViews)
      .groupBy(pageViews.path)
      .orderBy(desc(sql`sum(${pageViews.views})`))
      .limit(10),
    db
      .select({
        referrer: pageViews.referrer,
        views: sql<number>`sum(${pageViews.views})::int`,
      })
      .from(pageViews)
      .groupBy(pageViews.referrer)
      .orderBy(desc(sql`sum(${pageViews.views})`))
      .limit(8),
  ]);

  return {
    totals: totalsRow[0] ?? { today: 0, last7: 0, last30: 0, allTime: 0 },
    daily,
    topPaths,
    topReferrers,
  };
}

export async function addAdminEmail(email: string) {
  const session = await auth();
  if (!session?.user?.email) throw new Error("Not authenticated");

  const superAdmin = await isAdmin(session.user.email);
  if (!superAdmin) throw new Error("Only admins can add other admins");
  await adminActionGuard(session.user.email, "add-admin", 10, 3600);

  const parsed = adminEmailSchema.safeParse(email);
  if (!parsed.success) throw new Error("Invalid email address");

  await db.insert(adminEmails).values({ email: parsed.data });
  return { success: true };
}

export async function blockIp(ip: string, reason: string) {
  const session = await auth();
  if (!session?.user?.email) throw new Error("Not authenticated");

  const admin = await isAdmin(session.user.email);
  if (!admin) throw new Error("Only admins can block IPs");
  await adminActionGuard(session.user.email, "block-ip", 20, 300);

  const parsed = ipAddressSchema.safeParse(ip);
  if (!parsed.success) throw new Error("Invalid IP address");

  await db.insert(blockedIps).values({
    ip: parsed.data,
    reason: reason.slice(0, 200),
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

export async function removeAdminEmail(email: string) {
  const session = await auth();
  if (!session?.user?.email) throw new Error("Not authenticated");

  const superAdmin = await isAdmin(session.user.email);
  if (!superAdmin) throw new Error("Only admins can remove admins");
  await adminActionGuard(session.user.email, "remove-admin", 10, 3600);

  // Owner accounts are permanent — no one (including themselves via API)
  // can remove them, so the site can never lose its last real admin.
  if (isPermanentAdmin(email)) {
    throw new Error("This admin account is permanent and cannot be removed");
  }

  await db.delete(adminEmails).where(eq(adminEmails.email, email));
  return { success: true };
}

// ============ RESOURCES ============

export async function adminDeleteResource(resourceId: string) {
  const session = await auth();
  if (!session?.user?.email) throw new Error("Not authenticated");
  const admin = await isAdmin(session.user.email);
  if (!admin) throw new Error("Admin only");
  await adminActionGuard(session.user.email, "delete-resource", 30, 300);
  if (!z.string().uuid().safeParse(resourceId).success) throw new Error("Invalid resource id");

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

  if (!z.string().uuid().safeParse(resourceId).success) throw new Error("Invalid resource id");
  const validated = adminResourceUpdateSchema.parse(data); // strips unknown keys, bounds every value

  await db.update(resources).set(validated).where(eq(resources.id, resourceId));

  revalidatePath("/");
  revalidatePath("/browse");
  revalidatePath(`/resource/${resourceId}`);
  return { success: true };
}

// ============ MESSAGES ============

export async function deleteMessage(messageId: string) {
  const session = await auth();
  if (!session?.user?.email) throw new Error("Not authenticated");
  const admin = await isAdmin(session.user.email);
  if (!admin) throw new Error("Admin only");
  await adminActionGuard(session.user.email, "delete-message", 30, 300);
  if (!z.string().uuid().safeParse(messageId).success) throw new Error("Invalid message id");

  await db.delete(messages).where(eq(messages.id, messageId));
  return { success: true };
}

// ============ REPORTS ============

export async function deleteReport(reportId: string) {
  const session = await auth();
  if (!session?.user?.email) throw new Error("Not authenticated");
  const admin = await isAdmin(session.user.email);
  if (!admin) throw new Error("Admin only");
  await adminActionGuard(session.user.email, "delete-report", 30, 300);
  if (!z.string().uuid().safeParse(reportId).success) throw new Error("Invalid report id");

  await db.delete(reports).where(eq(reports.id, reportId));
  return { success: true };
}

export async function dismissReportAndDeleteResource(reportId: string, resourceId: string) {
  const session = await auth();
  if (!session?.user?.email) throw new Error("Not authenticated");
  const admin = await isAdmin(session.user.email);
  if (!admin) throw new Error("Admin only");
  await adminActionGuard(session.user.email, "dismiss-report", 30, 300);
  if (!z.string().uuid().safeParse(resourceId).success) throw new Error("Invalid resource id");

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
  await adminActionGuard(session.user.email, "delete-user", 10, 3600);
  if (!z.string().uuid().safeParse(userId).success) throw new Error("Invalid user id");

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
