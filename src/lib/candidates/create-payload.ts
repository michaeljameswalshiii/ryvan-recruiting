/**
 * Shared sanitizer for creating a candidate from the add-candidate form.
 */

export type CandidateCreateFields = {
  name: string;
  email: string;
  phone: string;
  location: string;
  title: string;
  status: string;
  source: string;
  notes: string;
  linkedin_url: string;
  resume_url: string;
  resume_file_name: string;
  summary: string;
  skills: string[];
  experience: unknown[];
  education: unknown[];
  certifications: string[];
  salary_requirements: string;
  tags: string[];
  allowDuplicate?: boolean;
};

function asStringList(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) {
    if (typeof value === "string" && value.trim()) {
      return value
        .split(/[,;\n]/)
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, max);
    }
    return [];
  }
  return value
    .map((item) => String(item).trim())
    .filter(Boolean)
    .slice(0, max);
}

export function sanitizeCandidateCreateBody(
  body: Record<string, unknown>
): CandidateCreateFields {
  return {
    name: String(body.name || "").trim(),
    email: String(body.email || "").trim(),
    phone: String(body.phone || "").trim(),
    location: String(body.location || "").trim(),
    title: String(body.title || "").trim(),
    status: String(body.status || "identification"),
    source: String(body.source || "manual"),
    notes: String(body.notes || "").trim(),
    linkedin_url: String(body.linkedin_url || "").trim(),
    resume_url: String(body.resume_url || "").trim(),
    resume_file_name: String(body.resume_file_name || "").trim(),
    summary: String(body.summary || "").trim(),
    skills: asStringList(body.skills, 100),
    experience: Array.isArray(body.experience) ? body.experience.slice(0, 30) : [],
    education: Array.isArray(body.education) ? body.education.slice(0, 20) : [],
    certifications: asStringList(body.certifications, 50),
    salary_requirements: String(body.salary_requirements || "").trim(),
    tags: Array.from(new Set(asStringList(body.tags, 25))),
    allowDuplicate: body.allowDuplicate === true,
  };
}

export function incomingFromCreateFields(fields: CandidateCreateFields) {
  return {
    name: fields.name,
    email: fields.email,
    phone: fields.phone,
    title: fields.title,
    location: fields.location,
    linkedin_url: fields.linkedin_url,
    resume_file_name: fields.resume_file_name,
    source: fields.source,
    experience: fields.experience as Array<Record<string, unknown>>,
    education: fields.education as Array<Record<string, unknown>>,
  };
}
