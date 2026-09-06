import { db } from "@/lib/db";
import { emailEvents, adminEmails } from "@/lib/db/schema";
import { sql } from "drizzle-orm";
import { Resend } from "resend";

// ---------------------------------------------------------------------------
// Configuration (all overridable via env)
// ---------------------------------------------------------------------------
const BOUNCE_RATE_THRESHOLD = Number(process.env.BOUNCE_RATE_THRESHOLD) || 10; // percent
const ROLLING_WINDOW_HOURS = Number(process.env.BOUNCE_RATE_WINDOW_HOURS) || 24;
const MIN_EVENTS_FOR_ALERT = Number(process.env.BOUNCE_RATE_MIN_EVENTS) || 20;
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL || "";
const ALERT_COOLDOWN_MS = 60 * 60 * 1000; // at most one alert per hour

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let lastAlertSent = 0;
let lastBlockAlertAt = 0;
const BLOCK_ALERT_COOLDOWN_MS = 15 * 60 * 1000; // at most one block-alert per 15 min

// ---------------------------------------------------------------------------
// Core check
// ---------------------------------------------------------------------------

/**
 * Calculates the bounce rate over a rolling window and fires an alert if the
 * threshold is exceeded. Runs lazily from the proxy — at most once per hour.
 */
export async function checkBounceRateAlert(): Promise<void> {
  const now = Date.now();
  if (now - lastAlertSent < ALERT_COOLDOWN_MS) return;

  try {
    const windowStart = new Date(now - ROLLING_WINDOW_HOURS * 60 * 60 * 1000);

    // Single query: total sent + total bounced in the window
    const [row] = await db
      .select({
        total: sql<number>`count(*)::int`,
        bounced: sql<number>`count(*) filter (where ${emailEvents.eventType} = 'email.bounced')::int`,
      })
      .from(emailEvents)
      .where(sql`${emailEvents.createdAt} >= ${windowStart}`);

    const total = row?.total ?? 0;
    const bounced = row?.bounced ?? 0;

    // Don't alert if too few events to be meaningful
    if (total < MIN_EVENTS_FOR_ALERT) return;

    const bounceRate = (bounced / total) * 100;
    if (bounceRate < BOUNCE_RATE_THRESHOLD) return;

    // ---- Threshold exceeded — fire alerts ----
    lastAlertSent = now;

    const subject = `⚠️ High bounce rate: ${bounceRate.toFixed(1)}% (${bounced}/${total})`;
    const body = [
      `Bounce rate alert for Student Hub`,
      ``,
      `Threshold: ${BOUNCE_RATE_THRESHOLD}%`,
      `Current:   ${bounceRate.toFixed(1)}%`,
      `Window:    ${ROLLING_WINDOW_HOURS}h`,
      `Bounced:   ${bounced}`,
      `Total:     ${total}`,
      ``,
      `Action: check your Resend dashboard for delivery issues.`,
    ].join("\n");

    // 1. Slack (if configured)
    if (SLACK_WEBHOOK_URL) {
      await sendSlackAlert(subject, body);
    }

    // 2. Email to all admins
    await sendAdminEmailAlert(subject, body);

    console.warn(`[Alert] ${subject}`);
  } catch (e) {
    // Non-critical — never crash the request
    console.error("[Alert] Failed to check bounce rate:", e);
  }
}

/**
 * Fires when the proxy auto-blocks an IP for detected attack behavior.
 * (VPN/proxy use is never blockable on its own — see proxy.ts.) Logs
 * prominently (server logs), and notifies Slack/admin email if configured —
 * rate-limited to one notification per 15 minutes so an attacker hammering
 * the site can't flood the admin inbox. The full block list always lives in
 * the admin panel's Security tab.
 */
export async function notifyAutoBlock(
  ip: string,
  reason: string
): Promise<void> {
  const title = `🚨 IP auto-blocked: ${ip}`;
  const body = [
    `An IP was automatically blocked by the proxy for attack behavior.`,
    ``,
    `IP:      ${ip}`,`    Reason:  ${reason}`,`    Time:    ${new Date().toISOString()}`,
    ``,
    `If this is a false positive (e.g. a shared campus NAT), unblock it in`,
    `Admin → Security. Repeated lockouts from one campus = revisit the heuristic.`,
  ].join("\n");

  // Always visible in server logs — even with no Slack/email configured.
  console.warn(`[AutoBlock] ${title}\n${body}`);

  const now = Date.now();
  if (now - lastBlockAlertAt < BLOCK_ALERT_COOLDOWN_MS) return;
  lastBlockAlertAt = now;

  try {
    if (SLACK_WEBHOOK_URL) {
      await sendSlackAlert(title, body);
    }
    await sendAdminEmailAlert(title, body);
  } catch (e) {
    console.error("[AutoBlock] notification delivery failed:", e);
  }
}

// ---------------------------------------------------------------------------
// Delivery helpers
// ---------------------------------------------------------------------------

async function sendSlackAlert(title: string, body: string): Promise<void> {
  try {
    await fetch(SLACK_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: title,
        blocks: [
          {
            type: "section",
            text: { type: "mrkdwn", text: `*${title}*\n\`\`\`${body}\`\`\`` },
          },
        ],
      }),
    });
  } catch (e) {
    console.error("[Alert] Slack delivery failed:", e);
  }
}

async function sendAdminEmailAlert(subject: string, body: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;

  try {
    // Fetch admin emails from DB
    const admins = await db
      .select({ email: adminEmails.email })
      .from(adminEmails);

    if (admins.length === 0) return;

    const resend = new Resend(apiKey);
    const from = process.env.EMAIL_FROM || "Student Hub <noreply@studenthub.dev>";

    await resend.emails.send({
      from,
      to: admins.map((a) => a.email),
      subject,
      text: body,
    });
  } catch (e) {
    console.error("[Alert] Admin email delivery failed:", e);
  }
}
