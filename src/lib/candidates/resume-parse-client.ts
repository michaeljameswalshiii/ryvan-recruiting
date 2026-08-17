/**
 * Client-side helpers for resume parse → candidate form autofill
 */

import {
  resumeFileTooLargeMessage,
  validateResumeFileClient,
} from '@/lib/candidates/resume-upload-limits';
import {
  inferCandidateTags,
  sanitizeCandidateLocation,
  sanitizeCandidatePhone,
} from '@/lib/candidates/resume-text-parser';

export type ParsedResumeFields = {
  name?: string;
  title?: string;
  email?: string;
  phone?: string;
  location?: string;
  fullAddress?: string;
  linkedin?: string;
  linkedin_url?: string;
  summary?: string;
  skills?: string[] | string;
  tags?: string[] | string;
  notes?: string;
  resume_url?: string;
  resume_file_name?: string;
  salary_requirements?: string;
  experience?: Array<{
    company?: string;
    title?: string;
    dates?: string;
    description?: string;
  }>;
  education?: Array<{
    school?: string;
    degree?: string;
    dates?: string;
    field?: string;
  }>;
  certifications?: string[];
  source?: string;
};

export const RESUME_DRAFT_KEY = 'turnkey.candidateResumeDraft';

export type ResumeDraft = {
  form: ParsedResumeFields;
  fileName?: string;
  savedAt: string;
};

export function skillsToString(skills: unknown): string {
  if (!skills) return '';
  if (Array.isArray(skills)) return skills.filter(Boolean).map(String).join(', ');
  if (typeof skills === 'string') return skills;
  return '';
}

const ATS_SUMMARY_MAX_WORDS = 40;

function wordCount(s: string): number {
  return (s || '').trim().split(/\s+/).filter(Boolean).length;
}

function ensureSentenceEnd(s: string): string {
  const t = (s || '').trim().replace(/[,;:\-–—]\s*$/, '');
  if (!t) return '';
  if (/[.!?]$/.test(t)) return t;
  return `${t}.`;
}

function titleCaseIfShouting(s: string): string {
  const t = (s || '').trim();
  if (!t || t.length < 4) return t;
  const letters = t.replace(/[^A-Za-z]/g, '');
  if (!letters || letters !== letters.toUpperCase()) return t;
  return t
    .toLowerCase()
    .replace(/\b[a-z]/g, (ch) => ch.toUpperCase());
}

function isUsefulSummarySkill(skill: string): boolean {
  const key = skill.trim().toLowerCase();
  if (key.length < 3 || key.length > 40) return false;
  if (
    /^(spring|summer|fall|autumn|winter|go|rust|rails|spark|rest|express|less|node|api|git)$/i.test(
      key
    )
  ) {
    return false;
  }
  return true;
}

/**
 * Build a short ATS-friendly professional summary.
 * Prefer objective/summary prose; otherwise title + real skills — never a lone
 * false-positive keyword like "spring".
 */
export function buildAtsFriendlySummary(parsed: {
  summary?: string;
  professionalSummary?: string;
  title?: string;
  skills?: string[] | string;
  experience?: Array<{ title?: string; company?: string; description?: string }>;
}): string {
  const raw = (
    (typeof parsed.summary === 'string' && parsed.summary) ||
    (typeof parsed.professionalSummary === 'string' &&
      parsed.professionalSummary) ||
    ''
  )
    .replace(/\s+/g, ' ')
    .trim();

  const title = titleCaseIfShouting(
    (
      parsed.title ||
      parsed.experience?.[0]?.title ||
      ''
    ).trim()
  );

  const skillsArr = (
    Array.isArray(parsed.skills)
      ? parsed.skills.map(String).filter(Boolean)
      : skillsToString(parsed.skills)
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
  ).filter(isUsefulSummarySkill);

  // Already short enough — keep as-is
  if (raw && wordCount(raw) <= ATS_SUMMARY_MAX_WORDS) {
    return ensureSentenceEnd(raw);
  }

  // First 1–2 sentences, capped
  if (raw) {
    const sentences = raw.split(/(?<=[.!?])\s+/).filter(Boolean);
    const first = (sentences.slice(0, 2).join(' ') || raw).replace(/[.!?]+$/, '');
    const words = first.split(/\s+/).filter(Boolean);
    if (words.length > 0) {
      const clipped = words.slice(0, ATS_SUMMARY_MAX_WORDS).join(' ');
      return ensureSentenceEnd(clipped);
    }
  }

  // Synthesize from title + skills (ATS keyword style)
  const yearsMatch =
    raw.match(/(\d+)\+?\s*years?/i) ||
    (parsed.experience || [])
      .map((e) => e.description || '')
      .join(' ')
      .match(/(\d+)\+?\s*years?/i);
  const years = yearsMatch ? yearsMatch[0].replace(/\s+/g, ' ') : '';

  const skillBits = skillsArr
    .slice(0, 4)
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter((s) => s.length >= 2 && s.length <= 32);

  const parts: string[] = [];
  if (years && title && skillBits.length) {
    parts.push(
      `${title} with ${years} of experience in ${skillBits.join(', ')}`
    );
  } else if (years && title) {
    parts.push(`${title} with ${years} of experience`);
  } else if (title && skillBits.length) {
    parts.push(`${title} with experience in ${skillBits.join(', ')}`);
  } else if (title) {
    parts.push(title);
  } else if (years) {
    parts.push(`${years} professional experience`);
  } else if (skillBits.length) {
    parts.push(skillBits.join(', '));
  }

  let built = parts.join(' ').replace(/\s+/g, ' ').trim();
  if (!built) return '';

  const words = built.split(/\s+/);
  if (words.length > ATS_SUMMARY_MAX_WORDS) {
    built = words.slice(0, ATS_SUMMARY_MAX_WORDS).join(' ');
  }
  return ensureSentenceEnd(built);
}

/**
 * Map API parse-resume result into candidate create/edit form fields.
 * Summary is kept short (ATS-friendly). Notes are not filled.
 */
export function mapParsedResumeToForm(
  parsed: any,
  extras?: { resumeUrl?: string; fileName?: string }
) {
  const skills = skillsToString(parsed?.skills);
  const experience = Array.isArray(parsed?.experience) ? parsed.experience : [];
  const education = Array.isArray(parsed?.education) ? parsed.education : [];
  const certifications = Array.isArray(parsed?.certifications)
    ? parsed.certifications.map(String).filter(Boolean)
    : [];

  const summary = buildAtsFriendlySummary({
    summary:
      typeof parsed?.summary === 'string'
        ? parsed.summary
        : typeof parsed?.professionalSummary === 'string'
          ? parsed.professionalSummary
          : '',
    title: parsed?.title || '',
    skills: parsed?.skills || skills,
    experience,
  });

  const name = parsed?.name || parsed?.fullName || '';
  const linkedin =
    parsed?.linkedin || parsed?.linkedin_url || parsed?.linkedinUrl || '';
  const parsedTags = Array.isArray(parsed?.tags)
    ? parsed.tags.map(String).filter(Boolean)
    : typeof parsed?.tags === 'string'
      ? parsed.tags.split(',').map((t: string) => t.trim()).filter(Boolean)
      : [];
  const tags = (
    parsedTags.length
      ? parsedTags
      : inferCandidateTags({
          title: parsed?.title || '',
          summary,
          skills: skills
            .split(/[,;\n]/)
            .map((s) => s.trim())
            .filter(Boolean),
          experience,
        })
  ).join(', ');

  // Robust title: headline field, then most recent / current experience role
  let title = String(parsed?.title || parsed?.currentTitle || '').trim();
  if (!title && experience.length) {
    const current = experience.find(
      (e: any) => /present|current|now/i.test(String(e?.dates || ''))
    );
    title = String(current?.title || experience[0]?.title || '').trim();
  }

  // Robust location: profile location only. Never keep "Company - City, ST".
  let location = sanitizeCandidateLocation(
    parsed?.location || parsed?.fullAddress || parsed?.full_address || '',
    name
  );
  if (!location && experience.length) {
    const withLoc = experience.find((e: any) =>
      sanitizeCandidateLocation(e?.location)
    );
    location = sanitizeCandidateLocation(withLoc?.location || '');
  }

  return {
    name,
    title,
    email: parsed?.email || '',
    phone: sanitizeCandidatePhone(parsed?.phone),
    location,
    linkedin_url: linkedin,
    summary,
    skills,
    tags,
    // Do not auto-fill notes from resume dump
    notes: '',
    salary_requirements:
      parsed?.salaryRequirements || parsed?.salary_requirements || '',
    experience,
    education,
    certifications,
    resume_url: extras?.resumeUrl || parsed?._resumeUrl || parsed?._fileKey || '',
    resume_file_name: extras?.fileName || '',
    source: 'resume',
  };
}

/**
 * Prefer parsed values when present; keep prior form values when parse is empty.
 */
export function mergeFormWithParsed(
  prev: Record<string, any>,
  mapped: Record<string, any>
): Record<string, any> {
  const pick = (key: string) => {
    const next = mapped[key];
    if (next === undefined || next === null || next === '') return prev[key];
    if (Array.isArray(next) && next.length === 0) return prev[key];
    return next;
  };

  return {
    ...prev,
    ...mapped,
    name: pick('name'),
    title: pick('title'),
    email: pick('email'),
    phone: sanitizeCandidatePhone(pick('phone')),
    location:
      sanitizeCandidateLocation(pick('location'), pick('name')) || prev.location,
    linkedin_url: pick('linkedin_url'),
    summary: pick('summary'),
    skills: pick('skills'),
    tags: pick('tags'),
    // Keep prior notes only if user already typed something; never force resume dump
    notes: prev.notes || '',
    salary_requirements: pick('salary_requirements'),
    resume_url: pick('resume_url') || prev.resume_url,
    source: mapped.source || prev.source || 'resume',
  };
}

export type ParseResumeResult = {
  resume: ParsedResumeFields & Record<string, any>;
  resumeUrl?: string | null;
  fileKey?: string | null;
  code?: string;
};

function partialParseResult(data: any, fallbackKey?: string): ParseResumeResult | null {
  if (data?.code !== 'NO_EXTRACTABLE_TEXT' || !data?.resume) return null;
  return {
    resume: data.resume,
    resumeUrl: data.resumeUrl || null,
    fileKey: data.fileKey || fallbackKey || null,
    code: data.code,
  };
}

/**
 * Upload resume directly to S3 (presigned PUT), then parse from the S3 key.
 * Bypasses serverless request body limits for large PDFs.
 */
export async function uploadResumeToS3(
  file: File,
  opts?: { candidateId?: string; onProgress?: (label: string) => void }
): Promise<{ s3Key: string; contentType: string }> {
  const validation = validateResumeFileClient(file);
  if (!validation.ok) {
    throw new Error(validation.error);
  }

  opts?.onProgress?.('Preparing secure upload…');
  const presignRes = await fetch('/api/parse-resume/presign', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fileName: file.name,
      contentType: file.type || undefined,
      sizeBytes: file.size,
      candidateId: opts?.candidateId || undefined,
    }),
  });
  const presign = await presignRes.json().catch(() => ({}));
  if (!presignRes.ok || !presign.uploadUrl || !presign.s3Key) {
    const err = new Error(
      presign.error ||
        `Could not prepare resume upload (${presignRes.status})`
    ) as Error & { code?: string };
    err.code = presign.code || 'PRESIGN_FAILED';
    throw err;
  }

  const contentType =
    presign.contentType ||
    file.type ||
    'application/octet-stream';

  opts?.onProgress?.('Uploading resume…');
  let putRes: Response;
  try {
    putRes = await fetch(presign.uploadUrl, {
      method: 'PUT',
      body: file,
      headers: {
        'Content-Type': contentType,
      },
    });
  } catch (err) {
    // Typical when S3 bucket CORS is missing for the app origin
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      /failed to fetch|networkerror|cors/i.test(msg)
        ? 'Direct upload to storage failed (network/CORS). Ask an admin to allow PUT from this app on the resume S3 bucket, or try a smaller text-based PDF.'
        : `Upload failed: ${msg}`
    );
  }

  if (!putRes.ok) {
    if (putRes.status === 403 || putRes.status === 400) {
      throw new Error(
        'Storage rejected the upload. The file may be too large, the wrong type, or S3 CORS may block browser uploads.'
      );
    }
    throw new Error(
      `Storage upload failed (${putRes.status}). Try a smaller text-based resume.`
    );
  }

  return { s3Key: presign.s3Key as string, contentType };
}

/**
 * Parse a resume file via presigned S3 upload + /api/parse-resume.
 * Falls back to multipart only for small files if presign fails with S3 not configured.
 */
export async function parseResumeFile(
  file: File,
  opts?: { candidateId?: string; onProgress?: (label: string) => void }
): Promise<ParseResumeResult> {
  const validation = validateResumeFileClient(file);
  if (!validation.ok) {
    throw new Error(validation.error);
  }

  // Prefer direct-to-S3 for all sizes so prod never hits body limits
  try {
    const { s3Key, contentType } = await uploadResumeToS3(file, opts);
    opts?.onProgress?.('Reading resume — scanned pages use OCR…');
    const res = await fetch('/api/parse-resume', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        s3Key,
        fileName: file.name,
        contentType,
        candidateId: opts?.candidateId || undefined,
      }),
    });
    const data = await res.json().catch(() => ({}));

    const partial = partialParseResult(data, s3Key);
    if (partial) return partial;

    if (!res.ok || data.error) {
      const err = new Error(
        data.error || `Failed to parse resume (${res.status})`
      ) as Error & { code?: string; fileKey?: string };
      err.code = data.code;
      err.fileKey = data.fileKey;
      throw err;
    }

    if (!data.success || !data.resume) {
      throw new Error(
        data.error || 'No candidate data extracted from resume'
      );
    }

    return {
      resume: data.resume,
      resumeUrl: data.resumeUrl,
      fileKey: data.fileKey || s3Key,
      code: data.code,
    };
  } catch (err: any) {
    // If S3 isn't configured, fall back to multipart for small files only
    const msg = String(err?.message || '');
    const code = err?.code || '';
    if (
      code === 'S3_NOT_CONFIGURED' ||
      /S3_NOT_CONFIGURED|not configured|AWS_S3_BUCKET/i.test(msg)
    ) {
      if (file.size > 4 * 1024 * 1024) {
        throw new Error(
          resumeFileTooLargeMessage(file.size) +
            ' Resume storage is not configured for large uploads.'
        );
      }
      return parseResumeFileMultipart(file, opts?.candidateId);
    }
    // Re-throw parse/size/empty-text errors as-is
    throw err;
  }
}

/** Legacy multipart path (small files / no S3). */
async function parseResumeFileMultipart(
  file: File,
  candidateId?: string
): Promise<ParseResumeResult> {
  const formData = new FormData();
  formData.append('resume', file);
  if (candidateId) formData.append('candidateId', candidateId);

  const res = await fetch('/api/parse-resume', {
    method: 'POST',
    credentials: 'include',
    body: formData,
  });

  const data = await res.json().catch(() => ({}));

  const partial = partialParseResult(data);
  if (partial) return partial;

  if (!res.ok || data.error) {
    const err = new Error(
      data.error || `Failed to parse resume (${res.status})`
    ) as Error & { code?: string; fileKey?: string };
    err.code = data.code;
    err.fileKey = data.fileKey;
    throw err;
  }

  if (!data.success || !data.resume) {
    throw new Error(data.error || 'No candidate data extracted from resume');
  }

  return {
    resume: data.resume,
    resumeUrl: data.resumeUrl,
    fileKey: data.fileKey,
  };
}

export function saveResumeDraft(draft: ResumeDraft) {
  try {
    sessionStorage.setItem(RESUME_DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // ignore storage failures
  }
}

export function loadResumeDraft(): ResumeDraft | null {
  try {
    const raw = sessionStorage.getItem(RESUME_DRAFT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ResumeDraft;
  } catch {
    return null;
  }
}

export function clearResumeDraft() {
  try {
    sessionStorage.removeItem(RESUME_DRAFT_KEY);
  } catch {
    // ignore
  }
}
