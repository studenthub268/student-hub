export const ALLOWED_FILE_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

const ALLOWED_FILE_EXTENSIONS = new Set(["pdf", "png", "jpg", "jpeg", "docx"]);

/**
 * Hard ceiling for one uploaded file: 4 MB.
 *
 * This is the PLATFORM limit, not a product preference. The file travels
 * browser → /api/upload (a Vercel Function) → R2, and Vercel caps a Function's
 * request body at 4.5 MB — anything larger is rejected at the edge with 413
 * FUNCTION_PAYLOAD_TOO_LARGE before the handler runs, which is what made large
 * uploads fail with a bare "Upload failed". 4 MB leaves headroom for the
 * multipart envelope (boundaries + the metadata fields) under that 4.5 MB cap.
 *
 * The same cap applies to RESPONSES, so /api/download cannot stream a file
 * bigger than this either — keeping one number for both directions is the
 * point: every file that can be uploaded can also be downloaded.
 *
 * Raising it requires taking the bytes off the Function path entirely:
 * presigned direct-to-R2 uploads (plus a bucket CORS rule) for upload, and a
 * redirect to the public object URL for download. Until then this constant is
 * the honest maximum, and both the UI copy and the validators read it.
 */
export const MAX_FILE_SIZE = 4 * 1024 * 1024; // 4MB
export const MAX_FILE_SIZE_MB = Math.round(MAX_FILE_SIZE / (1024 * 1024));

export function validateFile(file: {
  name: string;
  type: string;
  size: number;
}): string | null {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";

  if (!ALLOWED_FILE_TYPES.has(file.type) || !ALLOWED_FILE_EXTENSIONS.has(ext)) {
    return "File type not allowed. Upload PDF, PNG, JPG, or DOCX only.";
  }

  if (file.size <= 0) {
    return "File is empty.";
  }

  if (file.size > MAX_FILE_SIZE) {
    return `File too large. Maximum size is ${MAX_FILE_SIZE_MB}MB.`;
  }

  return null;
}