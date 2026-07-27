/**
 * Client-side helpers for resume parse → candidate form autofill
 */

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

const ATS_SUMMARY_MAX_WORDS = 20;

function wordCount(s: string): number {
  return (s || '').trim().split(/\s+/).filter(Boolean).length;
}

function ensureSentenceEnd(s: string): string {
  const t = (s || '').trim().replace(/[,;:\-–—]\s*$/, '');
  if (!t) return '';
  if (/[.!?]$/.test(t)) return t;
  return `${t}.`;
}

/**
 * Build a short ATS-friendly professional summary (target ≤20 words).
 * Prefer objective/summary text; otherwise title + top skills.
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

  const title = (
    parsed.title ||
    parsed.experience?.[0]?.title ||
    ''
  ).trim();

  const skillsArr = Array.isArray(parsed.skills)
    ? parsed.skills.map(String).filter(Boolean)
    : skillsToString(parsed.skills)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

  // Already short enough — keep as-is
  if (raw && wordCount(raw) <= ATS_SUMMARY_MAX_WORDS) {
    return ensureSentenceEnd(raw);
  }

  // First sentence, capped at 20 words
  if (raw) {
    const first = (raw.split(/(?<=[.!?])\s+/)[0] || raw).replace(/[.!?]+$/, '');
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
  if (years && title) {
    parts.push(`${years} as ${title}`);
  } else if (title) {
    parts.push(title);
  } else if (years) {
    parts.push(`${years} professional experience`);
  }

  if (skillBits.length) {
    parts.push(
      parts.length
        ? `with expertise in ${skillBits.join(', ')}`
        : skillBits.join(', ')
    );
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
 * Summary is kept short (ATS-friendly, ~20 words). Notes are not filled.
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

  return {
    name,
    title: parsed?.title || '',
    email: parsed?.email || '',
    phone: parsed?.phone || '',
    location: parsed?.location || parsed?.fullAddress || '',
    linkedin_url: linkedin,
    summary,
    skills,
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
    phone: pick('phone'),
    location: pick('location'),
    linkedin_url: pick('linkedin_url'),
    summary: pick('summary'),
    skills: pick('skills'),
    // Keep prior notes only if user already typed something; never force resume dump
    notes: prev.notes || '',
    salary_requirements: pick('salary_requirements'),
    resume_url: pick('resume_url') || prev.resume_url,
    source: mapped.source || prev.source || 'resume',
  };
}

/**
 * Parse a resume file via /api/parse-resume (no candidateId required).
 */
export async function parseResumeFile(file: File): Promise<{
  resume: ParsedResumeFields & Record<string, any>;
  resumeUrl?: string | null;
  fileKey?: string | null;
}> {
  const formData = new FormData();
  formData.append('resume', file);

  const res = await fetch('/api/parse-resume', {
    method: 'POST',
    body: formData,
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok || data.error) {
    throw new Error(data.error || `Failed to parse resume (${res.status})`);
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
