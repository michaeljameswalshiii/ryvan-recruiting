/**
 * Resume Parser - client helpers
 * Use /api/parse-resume for PDF/DOCX parsing
 */

export interface ResumeExperience {
  company: string;
  title: string;
  location: string;
  dates: string;
  bullets: string[];
}

export interface ResumeEducation {
  school: string;
  degree: string;
  field: string;
  year: string;
}

export interface ParsedResume {
  fullName: string;
  title: string;
  location: string;
  phone: string;
  email: string;
  linkedin: string;
  professionalSummary: string;
  experience: ResumeExperience[];
  technologies: string[];
  education: ResumeEducation[];
  rawText: string;
}

/**
 * Parse a resume file using the server API
 */
export async function processResumeFile(file: File): Promise<ParsedResume> {
  const formData = new FormData();
  formData.append('resume', file);

  const response = await fetch('/api/parse-resume', {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Upload failed' }));
    throw new Error(error.error || 'Failed to parse resume');
  }

  const data = await response.json();

  if (!data.success) {
    throw new Error(data.error || 'Failed to parse resume');
  }

  const resume = data.resume;
  return {
    fullName: resume.name || '',
    title: resume.title || '',
    location: resume.location || '',
    phone: resume.phone || '',
    email: resume.email || '',
    linkedin: resume.linkedin || '',
    professionalSummary: resume.summary || '',
    experience: (resume.experience || []).map((e: any) => ({
      company: e.company || '',
      title: e.title || '',
      location: e.location || '',
      dates: e.dates || '',
      bullets: e.description
        ? String(e.description)
            .split('\n')
            .map((b: string) => b.trim())
            .filter(Boolean)
        : [],
    })),
    technologies: resume.skills || [],
    education: (resume.education || []).map((e: any) => ({
      school: e.school || '',
      degree: e.degree || '',
      field: e.field || '',
      year: e.dates || e.year || '',
    })),
    rawText: data.rawText || '',
  };
}
