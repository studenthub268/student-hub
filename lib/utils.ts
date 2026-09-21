/** Escape HTML special characters (used in error bodies and email HTML). */
export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Escape characters that are wildcards in SQL LIKE patterns (% and _)
 * so they are matched literally. PostgreSQL uses backslash as the default
 * LIKE escape character.
 */
export function escapeLike(input: string): string {
  return input.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * User-facing error text. Server action messages like "Authentication
 * required" / "Invalid resource id" / "Upload limit reached…" are written
 * for end users and are safe to show verbatim. But an UNEXPECTED error
 * (stack text, Postgres internals, file paths) must never leak — anything
 * that isn't a plain Error message from our own actions collapses to the
 * fallback. Length-capped so a pathological message can't blow out a toast.
 */
const SAFE_MESSAGE_MAX_LENGTH = 200;

export function getErrorMessage(error: unknown, fallback = "Something went wrong"): string {
  let message: string | null = null;
  if (error instanceof Error && typeof error.message === "string") {
    message = error.message;
  } else if (typeof error === "string") {
    message = error;
  }
  if (!message || message.length > SAFE_MESSAGE_MAX_LENGTH) return fallback;
  // Digest-style internal errors (Next.js server actions) carry hashes.
  if (/^[a-f0-9]{16,}$/i.test(message.trim())) return fallback;
  return message;
}