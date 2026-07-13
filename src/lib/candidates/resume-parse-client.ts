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

export function mapParsedResumeToForm(parsed: any, extras?: { resumeUrl?: string; fileName?: string }) {
  const skills = skillsToString(parsed?.skills);
  const summary = typeof parsed?.summary === 'string' ? parsed.summary : '';
  const notesParts = [
    summary ? `Summary:\n${summary}` : '',
    skills ? `Skills: ${skills}` : '',
  ].filter(Boolean);

  return {
    name: parsed?.name || '',
    title: parsed?.title || '',
    email: parsed?.email || '',
    phone: parsed?.phone || '',
    location: parsed?.location || parsed?.fullAddress || '',
    linkedin_url: parsed?.linkedin || parsed?.linkedin_url || '',
    summary,
    skills,
    notes: notesParts.join('\n\n'),
    resume_url: extras?.resumeUrl || parsed?._resumeUrl || parsed?._fileKey || '',
    resume_file_name: extras?.fileName || '',
    source: 'resume',
  };
}

/**
 * Parse a resume file via /api/parse-resume (no candidateId required).
 */
export async function parseResumeFile(file: File): Promise<{
  resume: ParsedResumeFields;
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
