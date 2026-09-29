/**
 * Google Drive link support for resources.
 *
 * Big files (lecture recordings, full course packs) don't fit the 4 MB
 * serverless upload path — or the R2 storage budget. Instead a student can
 * upload the file to their own Google Drive, set it to "Anyone with the
 * link", and paste the share URL here. Storage costs the uploader's Drive
 * quota, not the platform's.
 *
 * The flow:
 *  - `parseDriveLink` extracts the file id from any of Drive's URL shapes.
 *  - `driveDirectDownloadUrl` builds the uc?export=download&id=… endpoint,
 *    which streams the file straight from Drive (browser follows the
 *    redirect; no bytes ever touch the server).
 *  - `probeDriveLink` (server-only) HEADs that endpoint to verify the link
 *    is public at upload time — the #1 failure mode is a link that only
 *    works for the owner, and catching it in the form beats a broken
 *    download on the resource page forever after.
 */

/**
 * file_type marker for Drive-hosted resources. Not a real MIME type — a
 * synthetic scheme that:
 *  - `formatFileType` renders as "DRIVE" on cards and the resource page,
 *  - `ResourcePreview`'s `isPDF`/`isImage` checks naturally miss, so no
 *    inline viewer is attempted for a cross-origin Drive file,
 *  - is rejected by the R2-upload validators (ALLOWED_FILE_TYPES), so it
 *    can never be attached to a stored file.
 */
export const DRIVE_FILE_TYPE = "external/drive";

/**
 * file_type marker for Drive FOLDER resources. A folder can't be downloaded
 * as a file — it's a collection — so the resource page embeds Drive's own
 * read-only folder listing and the download route redirects to the folder.
 */
export const DRIVE_FOLDER_TYPE = "external/drive-folder";

/** Drive file URLs: /file/d/<id>/…, open?id=<id>, uc?id=<id> */
const DRIVE_FILE_RE =
  /(?:\/file\/d\/|\/open\?id=|\/uc\?(?:export=download&)?id=)([\w-]{20,})/;

/** Google Docs/Sheets/Slides share links — not downloadable as-is. */
const DRIVE_EDITABLE_RE = /\/(document|spreadsheets|presentation)\/d\//;

/** Drive folder URLs: /drive/folders/<id> (also /drive/u/0/folders/<id>). */
const DRIVE_FOLDER_RE = /\/drive\/(?:u\/\d+\/)?folders\/([\w-]{20,})/;

/** Any drive.google.com or docs.google.com URL (for the "is this Drive?" check). */
const DRIVE_HOST_RE = /^https:\/\/(drive|docs)\.google\.com\//;

export interface ParsedDriveLink {
  fileId: string;
  url: string;
}

export function isDriveLink(url: string): boolean {
  return DRIVE_HOST_RE.test(url);
}

/**
 * Is this resource hosted on Drive? True for both file_type shapes: the
 * synthetic DRIVE_FILE_TYPE marker (type unknown at upload) and real MIME
 * types harvested from the probe (application/pdf, video/mp4, …). The URL
 * is the ground truth — Drive resources always store a drive.google.com
 * direct-download URL in file_url.
 */
export function isDriveHosted(fileType: string | null | undefined, fileUrl: string): boolean {
  return fileType === DRIVE_FILE_TYPE || DRIVE_HOST_RE.test(fileUrl);
}

/**
 * Extract the Drive file id from a share URL, or null if the URL doesn't
 * match any known Drive file shape.
 */
export function parseDriveLink(url: string): ParsedDriveLink | null {
  if (!DRIVE_HOST_RE.test(url)) return null;
  const match = url.match(DRIVE_FILE_RE);
  if (!match?.[1]) return null;
  return { fileId: match[1], url };
}

/**
 * Links to editable Docs/Sheets/Slides can't be downloaded as a file —
 * they render as web pages. Warn uploaders to convert them to a
 * downloadable format (File → Download → e.g. PDF) and link that.
 */
export function isEditableDocsLink(url: string): boolean {
  return DRIVE_EDITABLE_RE.test(url);
}

/** Is this a Drive folder share link? */
export function isDriveFolderLink(url: string): boolean {
  return DRIVE_HOST_RE.test(url) && DRIVE_FOLDER_RE.test(url);
}

/**
 * Extract the folder id from a Drive folder share URL, or null.
 */
export function parseDriveFolderLink(url: string): ParsedDriveLink | null {
  if (!DRIVE_HOST_RE.test(url)) return null;
  const match = url.match(DRIVE_FOLDER_RE);
  if (!match?.[1]) return null;
  return { fileId: match[1], url };
}

/**
 * Drive's embeddable read-only folder listing. Works for any
 * "Anyone with the link" folder, no API key needed — it's the same view
 * Drive generates for its own "Embed folder" feature. Rendered in an
 * iframe on the resource page as the folder preview.
 */
export function driveEmbeddedFolderUrl(folderId: string): string {
  return `https://drive.google.com/embeddedfolderview?id=${folderId}#list`;
}

/**
 * Endpoint that streams the file's bytes for ANYONE-WITH-LINK files.
 * Drive may serve an interstitial HTML page instead of bytes when the
 * file is large or the link isn't public — probeDriveLink detects that.
 */
export function driveDirectDownloadUrl(fileId: string): string {
  return `https://drive.google.com/uc?export=download&id=${fileId}`;
}

/**
 * Drive's usercontent endpoint — the same bytes as uc?export=download but
 * WITHOUT the virus-scan interstitial for large files: `confirm=t` skips
 * the "can't scan this file" HTML wall, so a 30 MB lecture PDF streams
 * instead of failing. This is the endpoint the byte proxy uses; the plain
 * uc endpoint above stays for probes (it answers Range/HEAD cheaply).
 */
export function driveUserContentDownloadUrl(fileId: string): string {
  return `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t`;
}

/**
 * Drive's HTML confirmation page (the "can't scan this file for viruses"
 * interstitial) — served in place of bytes when the file is large. Its
 * title makes it unmistakable without parsing the rest of the page.
 */
const DRIVE_INTERSTITIAL_MARK = "<title>Google Drive - Virus scan warning</title>";

/**
 * Server-side check that a link is live and public. Returns a short,
 * user-facing problem string, or null when the link is good.
 *
 * Runs at upload time (and optionally on the resource page) so a
 * restricted link is caught while the uploader can still fix it.
 * Deliberately tolerant: Drive's headers vary by file type/size, so this
 * fails only on what is certainly broken — a private link (200 HTML
 * interstitial or 401/403) or a dead one (404).
 */
export async function checkDriveLinkProblem(
  fileId: string,
  fetchFn: typeof fetch = fetch
): Promise<string | null> {
  let res: Response;
  try {
    res = await fetchFn(driveDirectDownloadUrl(fileId), {
      method: "GET",
      redirect: "follow",
      headers: { Range: "bytes=0-0" }, // probe 1 byte, not the whole file
    });
  } catch {
    return "Couldn't reach Google Drive — check the link and try again.";
  }

  if (res.status === 404) {
    return "That Drive file doesn't exist (or the link is malformed).";
  }
  if (res.status === 401 || res.status === 403) {
    return "This link isn't public. In Drive, set sharing to “Anyone with the link”.";
  }

  // A private/derestricted file often still answers 200 — with Drive's
  // HTML sign-in/interstitial page instead of bytes. Sniff the start of
  // the body (Range keeps this tiny).
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("text/html")) {
    const head = (await res.text()).slice(0, 2000);
    if (head.includes(DRIVE_INTERSTITIAL_MARK) || head.includes("accounts.google.com")) {
      return "This link isn't public. In Drive, set sharing to “Anyone with the link”.";
    }
  }

  return null;
}

/**
 * Server-side check that a FOLDER link is live and public. Folders have no
 * download endpoint, so this GETs the folder page itself: 404 = dead link,
 * 401/403 = not shared publicly. Resolves to the folder's display name when
 * the page is reachable (parsed from the <title>), or null when it can't
 * be read — the name is a convenience, the status is the gate.
 */
export async function checkDriveFolder(
  folderId: string,
  fetchFn: typeof fetch = fetch
): Promise<{ problem: string | null; folderName: string | null }> {
  let res: Response;
  try {
    res = await fetchFn(`https://drive.google.com/drive/folders/${folderId}`, {
      method: "GET",
      redirect: "follow",
    });
  } catch {
    return { problem: "Couldn't reach Google Drive — check the link and try again.", folderName: null };
  }

  if (res.status === 404) {
    return { problem: "That Drive folder doesn't exist (or the link is malformed).", folderName: null };
  }
  if (res.status === 401 || res.status === 403) {
    return {
      problem: "This folder isn't public. In Drive, set sharing to “Anyone with the link”.",
      folderName: null,
    };
  }
  if (!res.ok) {
    return { problem: "Google Drive wouldn't open that folder — double-check the link.", folderName: null };
  }

  // 200 can still be a sign-in page for a non-public folder. The folder
  // page's <title> is "Name - Google Drive" for a public one.
  const contentType = res.headers.get("content-type") ?? "";
  let folderName: string | null = null;
  if (contentType.includes("text/html")) {
    const head = (await res.text()).slice(0, 20000);
    if (head.includes("accounts.google.com") && !head.includes("<title>")) {
      return {
        problem: "This folder isn't public. In Drive, set sharing to “Anyone with the link”.",
        folderName: null,
      };
    }
    const titleMatch = head.match(/<title>([\s\S]*?)<\/title>/i);
    if (titleMatch?.[1]) {
      const name = titleMatch[1].replace(/\s*-\s*Google Drive\s*$/i, "").trim();
      if (name && !/^google drive$/i.test(name)) folderName = name.slice(0, 100);
    }
  }

  return { problem: null, folderName };
}

/**
 * Best-effort metadata harvest from the probe response headers: filename
 * (from Content-Disposition), size (from Content-Range total, since Range
 * probes answer 206 with `bytes 0-0/TOTAL`), and MIME type straight from
 * Content-Type. All three are optional — the form falls back to what the
 * uploader typed / generic labels when Drive omits them.
 */
export function driveMetaFromResponse(res: Response): {
  fileName: string | null;
  fileSize: number | null;
  mimeType: string | null;
} {
  const cd = res.headers.get("content-disposition") ?? "";
  const nameMatch =
    cd.match(/filename\*=UTF-8''([^;]+)/i)?.[1] ??
    cd.match(/filename="?([^";]+)"?/i)?.[1];
  let fileName: string | null = null;
  if (nameMatch) {
    try {
      fileName = decodeURIComponent(nameMatch.trim());
    } catch {
      fileName = nameMatch.trim();
    }
  }

  // Content-Type: Drive serves the real file MIME for public downloads
  // (application/pdf, video/mp4, …). Anything generic (octet-stream) or
  // Drive's own HTML pages is discarded — a wrong label is worse than none.
  let mimeType: string | null = null;
  const rawType = res.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ?? "";
  if (
    rawType &&
    rawType !== "application/octet-stream" &&
    rawType !== "text/html" &&
    /^([\w.+-]+)\/([\w.+-]+)$/.test(rawType)
  ) {
    mimeType = rawType;
  }

  // Range probe → "bytes 0-0/1234567" (206); full file → Content-Length.
  let fileSize: number | null = null;
  const contentRange = res.headers.get("content-range");
  if (contentRange) {
    const total = Number(contentRange.split("/").pop());
    if (Number.isFinite(total) && total > 0) fileSize = total;
  } else {
    const len = Number(res.headers.get("content-length"));
    if (Number.isFinite(len) && len > 0) fileSize = len;
  }

  return { fileName, fileSize, mimeType };
}

/**
 * Extension → MIME mapping for the file-type chip on Drive resources.
 * Drive's Content-Type header is the primary signal, but it's not always
 * present (or is octet-stream), so the filename extension is the fallback.
 * Only types students actually share are mapped — unknown extensions get a
 * clean uppercased label rather than a wrong MIME guess.
 */
const EXT_MIME: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  zip: "application/zip",
  rar: "application/vnd.rar",
  txt: "text/plain",
  csv: "text/csv",
  mp4: "video/mp4",
  mov: "video/quicktime",
  mkv: "video/x-matroska",
  webm: "video/webm",
  avi: "video/x-msvideo",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  // Folders aren't files — the extension fallback must never resolve one
  // to a MIME type. (Listed so the mapping documents itself; the folder
  // path never reaches resolveDriveFileType.)
};

/**
 * Resolve the best file_type for a Drive resource from the probe results:
 * Content-Type wins (it's authoritative), the filename extension is the
 * fallback, and null means "unknown — show the generic DRIVE chip".
 */
export function resolveDriveFileType(
  mimeType: string | null,
  fileName: string | null
): string | null {
  if (mimeType) return mimeType;
  const ext = fileName?.split(".").pop()?.toLowerCase();
  if (ext && EXT_MIME[ext]) return EXT_MIME[ext];
  return null;
}
