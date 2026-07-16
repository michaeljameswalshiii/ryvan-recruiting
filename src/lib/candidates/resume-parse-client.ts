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

function formatExperienceNotes(
  experience: ParsedResumeFields['experience']
): string {
  if (!experience?.length) return '';
  const lines = experience.slice(0, 8).map((e) => {
    const head = [e.title, e.company].filter(Boolean).join(' @ ');
    const dates = e.dates ? ` (${e.dates})` : '';
    const desc = e.description
      ? `\n  ${e.description.split('\n').slice(0, 3).join('\n  ')}`
      : '';
    return `• ${head || 'Role'}${dates}${desc}`;
  });
  return `Experience:\n${lines.join('\n')}`;
}

function formatEducationNotes(
  education: ParsedResumeFields['education']
): string {
  if (!education?.length) return '';
  const lines = education.slice(0, 5).map((e) => {
    const head = [e.degree, e.field, e.school].filter(Boolean).join(' — ');
    const dates = e.dates ? ` (${e.dates})` : '';
    return `• ${head || 'Education'}${dates}`;
  });
  return `Education:\n${lines.join('\n')}`;
}

/**
 * Map API parse-resume result into candidate create/edit form fields.
 * Prefer structured profile fields; put a readable digest in notes.
 */
export function mapParsedResumeToForm(
  parsed: any,
  extras?: { resumeUrl?: string; fileName?: string }
) {
  const skills = skillsToString(parsed?.skills);
  const summary =
    typeof parsed?.summary === 'string'
      ? parsed.summary
      : typeof parsed?.professionalSummary === 'string'
        ? parsed.professionalSummary
        : '';

  const experience = Array.isArray(parsed?.experience) ? parsed.experience : [];
  const education = Array.isArray(parsed?.education) ? parsed.education : [];
  const certifications = Array.isArray(parsed?.certifications)
    ? parsed.certifications.map(String).filter(Boolean)
    : [];

  const notesParts = [
    summary ? `Summary:\n${summary}` : '',
    skills ? `Skills: ${skills}` : '',
    formatExperienceNotes(experience),
    formatEducationNotes(education),
    certifications.length ? `Certifications: ${certifications.join(', ')}` : '',
  ].filter(Boolean);

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
    notes: notesParts.join('\n\n').slice(0, 2000),
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
    notes: pick('notes'),
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
