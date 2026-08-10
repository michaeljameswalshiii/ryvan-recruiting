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
 * Parse a resume file using the server API (S3 direct upload path).
 */
export async function processResumeFile(file: File): Promise<ParsedResume> {
  const { parseResumeFile } = await import(
    '@/lib/candidates/resume-parse-client'
  );
  const { resume } = await parseResumeFile(file);
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
    technologies: Array.isArray(resume.skills)
      ? resume.skills
      : typeof resume.skills === 'string'
        ? resume.skills.split(',').map((s: string) => s.trim()).filter(Boolean)
        : [],
    education: (resume.education || []).map((e: any) => ({
      school: e.school || '',
      degree: e.degree || '',
      field: e.field || '',
      year: e.dates || e.year || '',
    })),
    rawText: '',
  };
}
