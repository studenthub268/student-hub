import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { db } from "@/lib/db";
import { emailEvents, suppressedEmails } from "@/lib/db/schema";

function getResend() {
  return new Resend(process.env.RESEND_API_KEY!);
}

// Resend webhook event types we care about
const TRACKED_EVENTS = new Set([
  "email.sent",
  "email.delivered",
  "email.delivery_delayed",
  "email.bounced",
  "email.complained",
  "email.opened",
  "email.clicked",
]);

interface WebhookPayload {
  type?: string;
  created_at?: number;
  data?: {
    email_id?: string;
    from?: string;
    to?: string[];
    subject?: string;
    bounce?: { type?: string; message?: string };
    [key: string]: unknown;
  };
}

export async function POST(req: NextRequest) {
  // 1. Read raw body (must be the original string, not re-serialised JSON)
  const payload = await req.text();

  // 2. Verify signature via Resend SDK (throws on invalid)
  let event: WebhookPayload;
  try {
    event = getResend().webhooks.verify({
      payload,
      headers: {
        id: req.headers.get("svix-id") ?? "",
        timestamp: req.headers.get("svix-timestamp") ?? "",
        signature: req.headers.get("svix-signature") ?? "",
      },
      webhookSecret: process.env.RESEND_WEBHOOK_SECRET!,
    }) as unknown as WebhookPayload;
  } catch {
    return NextResponse.json(
      { error: "Invalid webhook signature" },
      { status: 401 }
    );
  }

  // 3. Extract common fields
  const eventType = event.type ?? "unknown";
  const data = event.data ?? {};
  const resendId = req.headers.get("svix-id") ?? undefined;

  // 4. Only persist events we track
  if (TRACKED_EVENTS.has(eventType)) {
    try {
      await db.insert(emailEvents).values({
        resendId,
        eventType,
        emailId: data.email_id ?? null,
        from: data.from ?? null,
        to: data.to?.[0] ?? null,
        subject: data.subject ?? null,
        eventData: JSON.stringify(data),
      });
    } catch (e) {
      // Log but don't fail the webhook — Resend will retry on non-2xx
      console.error("Failed to store email event:", e);
    }
  }

  // 5. Auto-suppress recipients who bounce or complain
  if (eventType === "email.bounced" || eventType === "email.complained") {
    const recipient = data.to?.[0];
    if (recipient) {
      const reason = eventType === "email.bounced" ? "bounced" : "complained";
      try {
        await db.insert(suppressedEmails).values({
          email: recipient,
          reason,
          sourceEmailId: data.email_id ?? null,
        }).onConflictDoNothing(); // idempotent — ignore if already suppressed
      } catch (e) {
        console.error(`Failed to suppress ${recipient}:`, e);
      }
      console.warn(
        `[Webhook] Suppressed ${recipient} — ${reason}` +
        (reason === "bounced" ? ` (${data.bounce?.type}: ${data.bounce?.message})` : "")
      );
    }
  }

  return NextResponse.json({ received: true }, { status: 200 });
}

// Resend only POSTs to webhook endpoints
export async function GET() {
  return NextResponse.json({ status: "ok" });
}
