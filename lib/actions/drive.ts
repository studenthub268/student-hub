"use server";

import { z } from "zod";
import { auth } from "@/lib/auth";
import { checkRateLimit } from "@/lib/actions/rate-limit";
import {
  isDriveLink,
  isEditableDocsLink,
  parseDriveLink,
  checkDriveLinkProblem,
  driveMetaFromResponse,
  driveDirectDownloadUrl,
  resolveDriveFileType,
} from "@/lib/drive";

/**
 * Validate a pasted Google Drive link and probe it live.
 *
 * Called from the upload form as the uploader types (debounced) so a
 * private or malformed link is flagged while they can still fix it — the
 * resource creation path re-verifies server-side, so this is UX, not the
 * security boundary.
 *
 * Returns the direct-download URL for the client plus best-effort
 * filename/size harvested from response headers (the form pre-fills the
 * size chip from it), or a user-facing error string.
 */
export async function probeDriveLink(url: string): Promise<
  | {
      ok: true;
      directUrl: string;
      fileName: string | null;
      fileSize: number | null;
      fileType: string | null;
    }
  | { ok: false; error: string }
> {
  const parsedInput = z.string().url().max(2000).safeParse(url);
  if (!parsedInput.success) {
    return { ok: false, error: "That doesn't look like a valid URL." };
  }

  const session = await auth();
  // The upload page requires sign-in; key the throttle on the user, not IP,
  // so NAT'd classmates don't share (or exhaust) one bucket.
  if (session?.user?.id) {
    if (!(await checkRateLimit(`drive-probe:${session.user.id}`, 20, 60))) {
      return { ok: false, error: "Too many checks — wait a minute and try again." };
    }
  } else {
    return { ok: false, error: "Sign in to upload resources." };
  }

  if (!isDriveLink(parsedInput.data)) {
    return { ok: false, error: "Paste a link from drive.google.com." };
  }
  if (isEditableDocsLink(parsedInput.data)) {
    return {
      ok: false,
      error:
        "Google Docs/Sheets/Slides links can't be downloaded. Use File → Download → PDF in Docs, then share the PDF file.",
    };
  }
  const parsed = parseDriveLink(parsedInput.data);
  if (!parsed) {
    return {
      ok: false,
      error:
        "Couldn't find a file in that link. In Drive use Share → Copy link, then paste it here.",
    };
  }

  const problem = await checkDriveLinkProblem(parsed.fileId);
  if (problem) return { ok: false, error: problem };

  // Second fetch for metadata: the probe used a 1-byte Range request and
  // returned nothing reusable; a HEAD is cheap and yields the headers.
  try {
    const res = await fetch(driveDirectDownloadUrl(parsed.fileId), {
      method: "GET",
      redirect: "follow",
      headers: { Range: "bytes=0-0" },
    });
    const { fileName, fileSize, mimeType } = driveMetaFromResponse(res);
    return {
      ok: true,
      directUrl: driveDirectDownloadUrl(parsed.fileId),
      fileName,
      fileSize,
      fileType: resolveDriveFileType(mimeType, fileName),
    };
  } catch {
    // Link verified fine above; metadata is optional — return without it.
    return {
      ok: true,
      directUrl: driveDirectDownloadUrl(parsed.fileId),
      fileName: null,
      fileSize: null,
      fileType: null,
    };
  }
}
