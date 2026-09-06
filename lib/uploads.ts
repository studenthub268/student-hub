export const ALLOWED_FILE_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

export const ALLOWED_FILE_EXTENSIONS = new Set(["pdf", "png", "jpg", "jpeg", "docx"]);

export const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

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
    return "File too large. Maximum size is 50MB.";
  }

  return null;
}