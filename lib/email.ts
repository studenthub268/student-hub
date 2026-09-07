import { Resend } from "resend";
import { checkRateLimit } from "@/lib/actions/rate-limit";
import { db } from "@/lib/db";
import { suppressedEmails } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/**
 * Lazily construct the Resend client. `new Resend(undefined)` THROWS at
 * construction, so building it at module top-level makes every module import
 * fail (e.g. CI without RESEND_API_KEY) — the signup server action would 500
 * on first use. Instead, resolve on first send and return null when the key
 * is not configured; callers treat null as "email skipped".
 */
function getResendClient(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
}

const FROM_ADDRESS = process.env.EMAIL_FROM || "Student Hub <noreply@studenthub.dev>";

// Per-recipient daily send limits.
// Window = 86 400 s (24 h). Adjust via env if needed.
const EMAIL_DAILY_LIMIT = Number(process.env.EMAIL_DAILY_LIMIT) || 10;
const EMAIL_WINDOW_SECONDS = 86_400;

/**
 * Check whether a recipient has exceeded their daily email quota.
 * Returns `{ allowed: true }` or `{ allowed: false, error }`.
 */
async function checkEmailSendLimit(
  to: string
): Promise<{ allowed: true } | { allowed: false; error: string }> {
  // 1. Check suppression list first — hard block
  try {
    const suppressed = await db.query.suppressedEmails.findFirst({
      where: eq(suppressedEmails.email, to),
    });
    if (suppressed) {
      return {
        allowed: false,
        error: `This email address has been suppressed (${suppressed.reason}). Contact support to request removal.`,
      };
    }
  } catch {
    // If the table doesn't exist yet (pre-migration), skip the check
  }

  // 2. Check daily rate limit
  const isAllowed = await checkRateLimit(
    `email:${to}`,
    EMAIL_DAILY_LIMIT,
    EMAIL_WINDOW_SECONDS
  );
  if (!isAllowed) {
    return {
      allowed: false,
      error: `Daily email limit reached (${EMAIL_DAILY_LIMIT}/day). Please try again tomorrow.`,
    };
  }
  return { allowed: true };
}

export async function sendPasswordResetEmail(
  to: string,
  token: string
): Promise<{ success: boolean; error?: string }> {
  const limit = await checkEmailSendLimit(to);
  if (!limit.allowed) return { success: false, error: limit.error };

  const appUrl = process.env.APP_URL || "http://localhost:3000";
  const resetUrl = `${appUrl}/auth/reset-password?token=${token}`;

  try {
    const resend = getResendClient();
    if (!resend) {
      console.warn("RESEND_API_KEY not set — skipping password reset email (token still issued)");
      return { success: false, error: "Email service not configured" };
    }
    await resend.emails.send({
      from: FROM_ADDRESS,
      to,
      subject: "Reset your Student Hub password",
      html: resetEmailHtml(resetUrl),
      text: resetEmailText(resetUrl),
    });
    return { success: true };
  } catch (err) {
    console.error("Failed to send password reset email:", err);
    return { success: false, error: "Failed to send email" };
  }
}

/* ------------------------------------------------------------------ */
/*  Email templates                                                    */
/* ------------------------------------------------------------------ */

function resetEmailHtml(resetUrl: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:40px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background-color:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">

          <!-- Header -->
          <tr>
            <td style="background-color:#0d9488;padding:32px 40px;text-align:center;">
              <h1 style="margin:0;font-size:24px;font-weight:700;color:#111111;letter-spacing:-0.02em;">
                Student Hub
              </h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              <h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#111111;">
                Reset your password
              </h2>
              <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#374151;">
                We received a request to reset the password for your Student Hub account.
                Click the button below to choose a new password. This link expires in <strong>1 hour</strong>.
              </p>

              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
                <tr>
                  <td style="background-color:#0d9488;border-radius:9999px;">
                    <a href="${resetUrl}"
                       style="display:inline-block;padding:14px 40px;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;letter-spacing:0.02em;">
                      Reset Password
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 8px;font-size:13px;color:#6b7280;">
                If the button doesn't work, copy and paste this link into your browser:
              </p>
              <p style="margin:0;font-size:13px;color:#0d9488;word-break:break-all;">
                <a href="${resetUrl}" style="color:#0d9488;">${resetUrl}</a>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px 40px;border-top:1px solid #e5e7eb;">
              <p style="margin:0;font-size:12px;line-height:1.6;color:#9ca3af;text-align:center;">
                If you didn't request a password reset, you can safely ignore this email.
                Your password will not be changed.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export async function sendVerificationEmail(
  to: string,
  token: string
): Promise<{ success: boolean; error?: string }> {
  const limit = await checkEmailSendLimit(to);
  if (!limit.allowed) return { success: false, error: limit.error };

  const appUrl = process.env.APP_URL || "http://localhost:3000";
  const verifyUrl = `${appUrl}/auth/verify-email?token=${token}`;

  try {
    const resend = getResendClient();
    if (!resend) {
      console.warn("RESEND_API_KEY not set — skipping verification email (token still issued)");
      return { success: false, error: "Email service not configured" };
    }
    await resend.emails.send({
      from: FROM_ADDRESS,
      to,
      subject: "Verify your Student Hub email",
      html: verifyEmailHtml(verifyUrl),
      text: verifyEmailText(verifyUrl),
    });
    return { success: true };
  } catch (err) {
    console.error("Failed to send verification email:", err);
    return { success: false, error: "Failed to send email" };
  }
}

function resetEmailText(resetUrl: string): string {
  return [
    "Student Hub — Reset your password",
    "",
    "We received a request to reset the password for your Student Hub account.",
    `Follow this link to choose a new password (expires in 1 hour):`,
    "",
    resetUrl,
    "",
    "If you didn't request a password reset, you can safely ignore this email.",
  ].join("\n");
}

/* ------------------------------------------------------------------ */
/*  Welcome email                                                      */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/*  Verification email                                                  */
/* ------------------------------------------------------------------ */

function verifyEmailHtml(verifyUrl: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:40px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background-color:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">

          <!-- Header -->
          <tr>
            <td style="background-color:#0d9488;padding:32px 40px;text-align:center;">
              <h1 style="margin:0;font-size:24px;font-weight:700;color:#111111;letter-spacing:-0.02em;">
                Student Hub
              </h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              <h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#111111;">
                Verify your email address
              </h2>
              <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#374151;">
                Thanks for signing up! Click the button below to verify your email and activate your account.
                This link expires in <strong>24 hours</strong>.
              </p>

              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
                <tr>
                  <td style="background-color:#0d9488;border-radius:9999px;">
                    <a href="${verifyUrl}"
                       style="display:inline-block;padding:14px 40px;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;letter-spacing:0.02em;">
                      Verify Email
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 8px;font-size:13px;color:#6b7280;">
                If the button doesn't work, copy and paste this link into your browser:
              </p>
              <p style="margin:0;font-size:13px;color:#0d9488;word-break:break-all;">
                <a href="${verifyUrl}" style="color:#0d9488;">${verifyUrl}</a>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px 40px;border-top:1px solid #e5e7eb;">
              <p style="margin:0;font-size:12px;line-height:1.6;color:#9ca3af;text-align:center;">
                If you didn't create a Student Hub account, you can safely ignore this email.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function verifyEmailText(verifyUrl: string): string {
  return [
    "Student Hub — Verify your email",
    "",
    "Thanks for signing up! Follow this link to verify your email and activate your account (expires in 24 hours):",
    "",
    verifyUrl,
    "",
    "If you didn't create a Student Hub account, you can safely ignore this email.",
  ].join("\n");
}
