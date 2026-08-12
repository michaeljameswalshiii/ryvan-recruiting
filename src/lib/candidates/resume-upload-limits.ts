/**
 * Shared resume upload limits and user-facing error copy.
 * Safe for client + server imports (no Node-only deps).
 */

/** Absolute max for resume files (S3 direct upload path). */
export const MAX_RESUME_BYTES = 25 * 1024 * 1024; // 25MB

/**
 * Soft guide: serverless multipart bodies often fail around 4.5MB on Vercel.
 * We bypass that via presigned S3; this is only for messaging / legacy path.
 */
export const RESUME_MULTIPART_SOFT_LIMIT_BYTES = 4 * 1024 * 1024; // 4MB

export const RESUME_ALLOWED_EXTENSIONS = [".pdf", ".doc", ".docx"] as const;

export const RESUME_ALLOWED_MIME = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const;

export function maxResumeMbLabel(): string {
  return `${Math.round(MAX_RESUME_BYTES / (1024 * 1024))}MB`;
}

export function isAllowedResumeFileName(fileName: string): boolean {
  const lower = (fileName || "").toLowerCase();
  return RESUME_ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export function isAllowedResumeMime(contentType?: string | null): boolean {
  if (!contentType) return false;
  const t = contentType.toLowerCase();
  if ((RESUME_ALLOWED_MIME as readonly string[]).includes(t)) return true;
  return t.includes("pdf") || t.includes("word") || t.includes("officedocument");
}

export function resumeFileTooLargeMessage(sizeBytes?: number): string {
  const max = maxResumeMbLabel();
  if (sizeBytes && sizeBytes > 0) {
    const mb = (sizeBytes / (1024 * 1024)).toFixed(1);
    return `Resume is too large (${mb}MB). Maximum size is ${max}. Compress the PDF or export a text-based resume.`;
  }
  return `Resume is too large. Maximum size is ${max}. Compress the PDF or export a text-based resume.`;
}

export function resumeUnsupportedTypeMessage(): string {
  return "Unsupported file type. Please upload a PDF or Word resume (.pdf, .doc, .docx).";
}

/**
 * Shown when PDF/DOCX has no usable text (scanned image, LinkedIn profile printout, etc.).
 */
export function resumeNoExtractableTextMessage(fileName?: string): string {
  const name = fileName ? ` (“${fileName}”)` : "";
  return (
    `We couldn’t read any text from this resume${name}, even after OCR. ` +
    `The scan may be too faint or low-resolution. ` +
    `Try a clearer scan, or a text-based PDF / Word (.docx) file — or enter details manually.`
  );
}

/** True when parse produced essentially nothing useful beyond a filename-derived name. */
export function isSparseParsedResume(input: {
  rawText?: string;
  name?: string;
  email?: string;
  phone?: string;
  title?: string;
  skills?: unknown[];
  experience?: unknown[];
  education?: unknown[];
  fileName?: string;
}): boolean {
  const text = (input.rawText || "").replace(/\s+/g, " ").trim();
  const hasEmail = Boolean(input.email && String(input.email).includes("@"));
  const hasPhone = Boolean(input.phone && String(input.phone).replace(/\D/g, "").length >= 10);
  const skills = Array.isArray(input.skills) ? input.skills.length : 0;
  const exp = Array.isArray(input.experience) ? input.experience.length : 0;
  const edu = Array.isArray(input.education) ? input.education.length : 0;
  const hasStructure = skills + exp + edu > 0;
  const hasContact = hasEmail || hasPhone;
  const hasTitle = Boolean(input.title && String(input.title).trim().length > 1);

  // Plenty of text or real structure/contact → not sparse
  if (text.length >= 80 && (hasContact || hasStructure || hasTitle)) return false;
  if (hasContact && (hasStructure || hasTitle || text.length >= 40)) return false;
  if (hasStructure && text.length >= 40) return false;

  // Empty / near-empty extraction
  if (text.length < 40 && !hasContact && !hasStructure) return true;

  // Name alone (often from filename like Amy-Vigil-profile.pdf) is not enough
  if (!hasContact && !hasStructure && !hasTitle && text.length < 80) return true;

  return false;
}

export type ResumeClientValidation =
  | { ok: true }
  | { ok: false; error: string; code: "TOO_LARGE" | "UNSUPPORTED_TYPE" };

export function validateResumeFileClient(file: {
  name: string;
  size: number;
  type?: string;
}): ResumeClientValidation {
  const nameOk = isAllowedResumeFileName(file.name);
  const mimeOk = isAllowedResumeMime(file.type);
  if (!nameOk && !mimeOk) {
    return { ok: false, error: resumeUnsupportedTypeMessage(), code: "UNSUPPORTED_TYPE" };
  }
  if (file.size > MAX_RESUME_BYTES) {
    return {
      ok: false,
      error: resumeFileTooLargeMessage(file.size),
      code: "TOO_LARGE",
    };
  }
  if (file.size <= 0) {
    return {
      ok: false,
      error: "This file appears empty. Choose a different resume.",
      code: "UNSUPPORTED_TYPE",
    };
  }
  return { ok: true };
}
