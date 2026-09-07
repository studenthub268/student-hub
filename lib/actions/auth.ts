"use server";

import { db } from "@/lib/db";
import { users, resources } from "@/lib/db/schema";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { eq, sql } from "drizzle-orm";
import { checkRateLimit } from "./rate-limit";
import { sendPasswordResetEmail, sendVerificationEmail, sendWelcomeEmail } from "@/lib/email";
import { validatePasswordStrength } from "@/lib/password";
import { POLICY_VERSION } from "@/lib/constants";
import { deleteR2Object } from "@/lib/r2";
import { auth, signOut } from "@/lib/auth";

function sanitizeInput(input: string): string {
  return input
    .replace(/[<>]/g, "")
    .trim()
    .slice(0, 500);
}

export async function signUp(formData: {
  email: string;
  password: string;
  name: string;
  acceptedPolicy?: boolean;
}) {
  try {
    const { email, password, name, acceptedPolicy } = formData;

    // Rate limit: 5 signups per hour per email
    const isAllowed = await checkRateLimit(`signup:${email}`, 5, 3600);
    if (!isAllowed) {
      return { error: "Too many attempts. Please try again later." };
    }

    // Validate inputs
    const passwordError = validatePasswordStrength(password);
    if (passwordError) {
      return { error: passwordError };
    }
    if (!email || !email.includes("@")) {
      return { error: "Invalid email address" };
    }
    if (name && name.length > 100) {
      return { error: "Name is too long" };
    }
    // Policy consent is required — do not trust the client form's `required`
    // attribute alone; validate the flag server-side too.
    if (!acceptedPolicy) {
      return { error: "You must accept the Terms & Privacy Policy to create an account." };
    }

    // Check if user exists
    const existingUser = await db.query.users.findFirst({
      where: (users, { eq }) => eq(users.email, email),
    });

    if (existingUser) {
      return { error: "Email already in use" };
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const displayName = name ? sanitizeInput(name) : null;
    const verificationToken = randomUUID();

    await db.insert(users).values({
      id: randomUUID(),
      email: sanitizeInput(email),
      name: displayName,
      passwordHash,
      verificationToken,
      acceptedTermsAt: new Date(),
      termsVersion: POLICY_VERSION,
    });

    // Send verification email (non-blocking — failure doesn't prevent signup)
    const emailResult = await sendVerificationEmail(sanitizeInput(email), verificationToken);
    if (!emailResult.success) {
      console.error(`Failed to send verification email to ${email}:`, emailResult.error);
    }

    return { success: true };
  } catch (error) {
    console.error("Signup error:", error);
    return { error: "Something went wrong during signup" };
  }
}

export async function requestPasswordReset(email: string) {
  try {
    // Rate limit: 3 requests per hour per email
    const isAllowed = await checkRateLimit(`reset:${email}`, 3, 3600);
    if (!isAllowed) {
      return { error: "Too many reset requests. Please try again later." };
    }

    const user = await db.query.users.findFirst({
      where: (users, { eq }) => eq(users.email, email),
    });

    // Return success even if user not found to prevent email enumeration
    if (!user) {
      return { success: true };
    }

    const token = randomUUID();
    const expiry = new Date();
    expiry.setHours(expiry.getHours() + 1);

    await db.update(users)
      .set({ resetToken: token, resetTokenExpiry: expiry })
      .where(eq(users.id, user.id));

    // Send reset email (non-blocking failure: return success regardless to
    // prevent email-enumeration, but log the error for observability).
    const emailResult = await sendPasswordResetEmail(user.email, token);
    if (!emailResult.success) {
      console.error(`Failed to send reset email to ${user.email}:`, emailResult.error);
    }

    return { success: true };
  } catch (error) {
    console.error("Password reset request error:", error);
    return { error: "Something went wrong" };
  }
}

export async function resetPassword(token: string, newPassword: string) {
  try {
    // Validate password strength
    const passwordError = validatePasswordStrength(newPassword);
    if (passwordError) {
      return { error: passwordError };
    }

    // Rate limit: 5 resets per hour (to prevent token brute-force)
    const isAllowed = await checkRateLimit(`reset-token:${token}`, 5, 3600);
    if (!isAllowed) {
      return { error: "Too many attempts. Please request a new reset link." };
    }

    const user = await db.query.users.findFirst({
      where: (users, { and, eq, gt }) =>
        and(
          eq(users.resetToken, token),
          gt(users.resetTokenExpiry, new Date())
        ),
    });

    if (!user) {
      return { error: "Invalid or expired token" };
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);

    await db.update(users)
      .set({
        passwordHash,
        resetToken: null,
        resetTokenExpiry: null
      })
      .where(eq(users.id, user.id));

    return { success: true };
  } catch (error) {
    console.error("Password reset error:", error);
    return { error: "Something went wrong" };
  }
}

/**
 * Delete the signed-in user's account and all personal data (GDPR/privacy-
 * policy "right to erasure").
 *
 * Order matters:
 *   1. Collect + delete the user's R2 files FIRST — the DB cascade would
 *      otherwise remove the rows that tell us which files to delete,
 *      orphaning them in storage forever.
 *   2. Fix denormalized counters on OTHER users' resources that this
 *      user's likes contributed to (the likes rows themselves cascade).
 *   3. Delete the user row — accounts, sessions, resources, likes, and
 *      reports all cascade via FK.
 *   4. Revoke the session server-side so the JWT is dead immediately.
 *
 * Re-auth (typed password) guards against session hijack wiping an account.
 */
export async function deleteMyAccount(password?: string) {
  try {
    const session = await auth();
    if (!session?.user?.id || !session.user.email) {
      return { error: "Not signed in" };
    }
    const userId = session.user.id;

    // Rate limit: 3 attempts per hour per account
    const allowed = await checkRateLimit(`delete-account:${userId}`, 3, 3600);
    if (!allowed) {
      return { error: "Too many attempts. Please try again later." };
    }

    // If the account has a password, require it to confirm intent.
    // OAuth-only accounts (no password set) skip this check.
    const user = await db.query.users.findFirst({
      where: (users, { eq }) => eq(users.id, userId),
    });
    if (!user) return { error: "Account not found" };

    if (user.passwordHash) {
      if (!password) {
        return { error: "Enter your password to confirm deletion." };
      }
      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) {
        return { error: "Incorrect password — account not deleted." };
      }
    }

    // 1. Delete this user's uploaded files from R2 before the cascade.
    try {
      const uploads = await db
        .select({ fileKey: resources.fileKey })
        .from(resources)
        .where(eq(resources.uploaderId, userId));
      await Promise.all(
        uploads
          .filter((u) => u.fileKey)
          .map((u) => deleteR2Object(u.fileKey))
      );
    } catch (e) {
      console.error("Failed to delete user files from R2:", e);
      return { error: "Could not remove your files. Please try again or contact support." };
    }

    // 2. Decrement like-counters on other users' resources that this user liked.
    try {
      await db.execute(sql`
        update resources r
        set likes = greatest(r.likes - sub.n, 0)
        from (
          select resource_id, count(*)::int as n
          from likes
          where user_id = ${userId}
          group by resource_id
        ) sub
        where r.id = sub.resource_id
      `);
    } catch (e) {
      console.error("Failed to adjust like counters during account deletion:", e);
      // Non-fatal: counters self-heal via unique-index integrity on future likes
    }

    // 3. Delete the user — everything else cascades (accounts, sessions,
    //    resources, likes, reports).
    await db.delete(users).where(eq(users.id, userId));

    // 4. Kill the session immediately (JWTs are otherwise valid until expiry).
    await signOut({ redirect: false });

    return { success: true };
  } catch (error) {
    console.error("Account deletion error:", error);
    return { error: "Something went wrong while deleting your account. Please try again or contact support." };
  }
}

export async function isEmailVerified(
  email: string
): Promise<{ verified: boolean; exists: boolean }> {
  try {
    const user = await db.query.users.findFirst({
      where: (users, { eq }) => eq(users.email, email),
    });

    if (!user) return { verified: false, exists: false };
    return { verified: !!user.emailVerified, exists: true };
  } catch {
    return { verified: false, exists: false };
  }
}

/**
 * Re-send the verification email for the SIGNED-IN user's address. The
 * session (not a client-supplied email) identifies the target, so there is
 * no enumeration risk. Rate limited per email; a no-op when already
 * verified.
 */
export async function resendVerificationEmail(): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return { success: false, error: "Please sign in first" };
    }
    const email = session.user.email;

    // Rate limit: 3 resend emails per hour per address
    const isAllowed = await checkRateLimit(`resend-verification:${email}`, 3, 3600);
    if (!isAllowed) {
      return { success: false, error: "Too many requests. Please try again later." };
    }

    const user = await db.query.users.findFirst({
      where: (users, { eq }) => eq(users.email, email),
    });
    if (!user) {
      return { success: false, error: "Account not found" };
    }
    if (user.emailVerified) {
      return { success: false, error: "Your email is already verified" };
    }

    // Reuse the pending token when one exists (signup always creates one);
    // otherwise issue a fresh token so the link works.
    let token = user.verificationToken;
    if (!token) {
      token = randomUUID();
      await db.update(users).set({ verificationToken: token }).where(eq(users.id, user.id));
    }

    const emailResult = await sendVerificationEmail(user.email, token);
    if (!emailResult.success) {
      return { success: false, error: "Failed to send the email. Please try again later." };
    }
    return { success: true };
  } catch (error) {
    console.error("Resend verification error:", error);
    return { success: false, error: "Something went wrong. Please try again." };
  }
}

export async function verifyEmail(token: string) {
  try {
    const user = await db.query.users.findFirst({
      where: (users, { eq }) => eq(users.verificationToken, token),
    });

    if (!user) {
      return { error: "Invalid verification link" };
    }

    if (user.emailVerified) {
      return { success: true }; // Already verified
    }

    await db.update(users)
      .set({
        emailVerified: new Date(),
        verificationToken: null,
      })
      .where(eq(users.id, user.id));

    // First-activation moment: introduce Student Hub. Best-effort — a
    // welcome failure must never fail verification.
    try {
      const welcome = await sendWelcomeEmail(user.email, user.name);
      if (!welcome.success) {
        console.warn(`Welcome email not sent to ${user.email}: ${welcome.error}`);
      }
    } catch (e) {
      console.error("Welcome email failed:", e);
    }

    return { success: true };
  } catch (error) {
    console.error("Email verification error:", error);
    return { error: "Something went wrong" };
  }
}
