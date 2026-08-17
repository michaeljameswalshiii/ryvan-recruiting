/**
 * Detect possible duplicate candidates from name, contact, work history,
 * and education. Pure functions — safe to unit-test without DynamoDB.
 */

export type ExperienceLike = {
  company?: string;
  employer?: string;
  companyName?: string;
  organization?: string;
  title?: string;
  dates?: string;
  date?: string;
  startDate?: string;
  endDate?: string;
  description?: string;
};

export type EducationLike = {
  school?: string;
  institution?: string;
  university?: string;
  degree?: string;
  dates?: string;
  date?: string;
  field?: string;
};

export type IncomingCandidateInput = {
  name?: string;
  email?: string;
  phone?: string;
  title?: string;
  location?: string;
  linkedin_url?: string;
  resume_file_name?: string;
  source?: string;
  experience?: ExperienceLike[];
  education?: EducationLike[];
};

export type DuplicateMatchReason =
  | "email"
  | "phone"
  | "linkedin"
  | "name"
  | "work_history"
  | "education"
  | "title";

export type DuplicateProfileCard = {
  id?: string;
  name: string;
  role: "existing" | "incoming";
  subtitle: string;
  title?: string;
  email?: string;
  phone?: string;
  historyLine: string;
  educationLine: string;
  resumeFileName?: string;
  highlightHistory: boolean;
  highlightEducation: boolean;
};

export type DuplicateMatch = {
  candidateId: string;
  confidence: "high" | "medium";
  reasons: DuplicateMatchReason[];
  headline: string;
  subhead: string;
  explanation: string;
  signalLabel: string;
  contactDiffers: boolean;
  contentMatchPercent: number;
  workMatched: number;
  workIncomingTotal: number;
  educationMatched: boolean;
  sameCurrentTitle: boolean;
  existing: DuplicateProfileCard;
  incoming: DuplicateProfileCard;
};

const CORP_STOP = new Set([
  "inc",
  "llc",
  "ltd",
  "llp",
  "corp",
  "corporation",
  "company",
  "co",
  "the",
  "group",
  "plc",
  "pa",
  "pc",
  "pllc",
]);

export function normalizeMatchText(value: unknown): string {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function normalizeEmail(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

export function normalizePhoneDigits(value: unknown): string {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
}

export function normalizeLinkedIn(value: unknown): string {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  const inMatch = raw.match(/linkedin\.com\/in\/([^/?#]+)/i);
  if (inMatch?.[1]) return inMatch[1].replace(/\/+$/, "");
  return raw.replace(/^https?:\/\//, "").replace(/\/+$/, "");
}

export function normalizeOrg(value: unknown): string {
  return normalizeMatchText(value)
    .split(" ")
    .filter((token) => token && !CORP_STOP.has(token))
    .join(" ")
    .trim();
}

export function experienceCompany(row?: ExperienceLike | null): string {
  if (!row) return "";
  return (
    row.company ||
    row.employer ||
    row.companyName ||
    row.organization ||
    ""
  ).trim();
}

export function experienceDates(row?: ExperienceLike | null): string {
  if (!row) return "";
  if (row.dates) return String(row.dates);
  if (row.date) return String(row.date);
  const start = row.startDate || "";
  const end = row.endDate || "";
  return [start, end].filter(Boolean).join(" – ");
}

export function educationSchool(row?: EducationLike | null): string {
  if (!row) return "";
  return (row.school || row.institution || row.university || "").trim();
}

export function extractYears(dates?: string): {
  start?: number;
  end?: number;
  current: boolean;
} {
  const text = String(dates || "");
  const years = [...text.matchAll(/\b(?:19|20)\d{2}\b/g)].map((m) =>
    Number(m[0])
  );
  const current = /\b(present|current|now|today)\b/i.test(text);
  const start = years[0];
  const end = years[1] || (current ? new Date().getFullYear() : years[0]);
  return { start, end, current };
}

export function orgsMatch(a: string, b: string): boolean {
  const na = normalizeOrg(a);
  const nb = normalizeOrg(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.length >= 5 && nb.length >= 5 && (na.includes(nb) || nb.includes(na))) {
    return true;
  }
  const ta = na.split(" ").filter(Boolean);
  const tb = nb.split(" ").filter(Boolean);
  const [shorter, longer] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  return (
    shorter.length >= 2 && shorter.every((token) => longer.includes(token))
  );
}

export function jobsAlign(a: ExperienceLike, b: ExperienceLike): boolean {
  if (!orgsMatch(experienceCompany(a), experienceCompany(b))) return false;
  const ya = extractYears(experienceDates(a));
  const yb = extractYears(experienceDates(b));
  if (!ya.start || !yb.start) return true;
  const startSlack = Math.abs((ya.start || 0) - (yb.start || 0)) <= 1;
  const endSlack =
    Math.abs((ya.end || ya.start || 0) - (yb.end || yb.start || 0)) <= 1;
  return startSlack && endSlack;
}

export function schoolsMatch(a: EducationLike, b: EducationLike): boolean {
  return orgsMatch(educationSchool(a), educationSchool(b));
}

function namesMatch(a?: string, b?: string): boolean {
  const na = normalizeMatchText(a);
  const nb = normalizeMatchText(b);
  if (!na || !nb) return false;
  if (na.split(" ").length < 2 || nb.split(" ").length < 2) return false;
  return na === nb;
}

function titlesMatch(a?: string, b?: string): boolean {
  const na = normalizeMatchText(a);
  const nb = normalizeMatchText(b);
  if (!na || !nb || na.length < 3 || nb.length < 3) return false;
  return na === nb;
}

export function countWorkHistoryOverlap(
  incoming: ExperienceLike[] = [],
  existing: ExperienceLike[] = []
): { matched: number; incomingTotal: number; existingTotal: number } {
  const used = new Set<number>();
  let matched = 0;
  for (const row of incoming) {
    if (!experienceCompany(row)) continue;
    const idx = existing.findIndex(
      (other, i) => !used.has(i) && jobsAlign(row, other)
    );
    if (idx >= 0) {
      used.add(idx);
      matched += 1;
    }
  }
  return {
    matched,
    incomingTotal: incoming.filter((row) => experienceCompany(row)).length,
    existingTotal: existing.filter((row) => experienceCompany(row)).length,
  };
}

export function educationOverlaps(
  incoming: EducationLike[] = [],
  existing: EducationLike[] = []
): boolean {
  return incoming.some((row) =>
    existing.some((other) => schoolsMatch(row, other))
  );
}

function yearSpan(rows: Array<{ dates?: string }>): string {
  const years: number[] = [];
  for (const row of rows) {
    const y = extractYears(row.dates);
    if (y.start) years.push(y.start);
    if (y.end) years.push(y.end);
  }
  if (!years.length) return "";
  const min = Math.min(...years);
  const max = Math.max(...years);
  return min === max ? String(min) : `${min}–${max}`;
}

export function formatHistoryLine(rows: ExperienceLike[] = []): string {
  const companies = rows
    .map((row) => experienceCompany(row))
    .filter(Boolean);
  if (!companies.length) return "—";
  const unique: string[] = [];
  for (const name of companies) {
    if (!unique.some((existing) => orgsMatch(existing, name))) {
      unique.push(name);
    }
  }
  const span = yearSpan(
    rows.map((row) => ({ dates: experienceDates(row) }))
  );
  const names = unique.slice(0, 3).join(", ");
  const extra = unique.length > 3 ? ` +${unique.length - 3}` : "";
  return span ? `${names}${extra} — ${span}` : `${names}${extra}`;
}

export function formatEducationLine(rows: EducationLike[] = []): string {
  const first = rows.find((row) => educationSchool(row));
  if (!first) return "—";
  const school = educationSchool(first);
  const span = extractYears(first.dates || first.date);
  if (span.start) {
    const label =
      span.end && span.end !== span.start
        ? `${span.start}–${span.end}`
        : String(span.start);
    return `${school} — ${label}`;
  }
  return school;
}

function formatUpdated(raw?: string): string {
  if (!raw) return "";
  const t = new Date(raw).getTime();
  if (!Number.isFinite(t)) return "";
  return new Date(t).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function currentTitle(
  title?: string,
  experience?: ExperienceLike[]
): string {
  return (title || experience?.[0]?.title || "").trim();
}

function contactDiffers(
  incoming: IncomingCandidateInput,
  existing: IncomingCandidateInput
): boolean {
  const iEmail = normalizeEmail(incoming.email);
  const eEmail = normalizeEmail(existing.email);
  const iPhone = normalizePhoneDigits(incoming.phone);
  const ePhone = normalizePhoneDigits(existing.phone);
  const emailDiffers = Boolean(iEmail && eEmail && iEmail !== eEmail);
  const phoneDiffers = Boolean(
    iPhone.length >= 7 && ePhone.length >= 7 && iPhone !== ePhone
  );
  const incomingHasContact = Boolean(iEmail || iPhone.length >= 7);
  const existingHasContact = Boolean(eEmail || ePhone.length >= 7);
  return (
    emailDiffers ||
    phoneDiffers ||
    (incomingHasContact && existingHasContact && (iEmail !== eEmail || iPhone !== ePhone))
  );
}

function scoreMatch(args: {
  email: boolean;
  phone: boolean;
  linkedin: boolean;
  name: boolean;
  workMatched: number;
  education: boolean;
  sameTitle: boolean;
}): { keep: boolean; confidence: "high" | "medium"; reasons: DuplicateMatchReason[] } {
  const reasons: DuplicateMatchReason[] = [];
  if (args.email) reasons.push("email");
  if (args.phone) reasons.push("phone");
  if (args.linkedin) reasons.push("linkedin");
  if (args.name) reasons.push("name");
  if (args.workMatched > 0) reasons.push("work_history");
  if (args.education) reasons.push("education");
  if (args.sameTitle) reasons.push("title");

  const strongId = args.email || args.phone || args.linkedin;
  if (strongId) {
    return { keep: true, confidence: "high", reasons };
  }
  if (args.name && args.workMatched >= 2) {
    return { keep: true, confidence: "high", reasons };
  }
  if (args.name && args.workMatched >= 1 && args.education) {
    return { keep: true, confidence: "high", reasons };
  }
  if (args.name && args.workMatched >= 1 && args.sameTitle) {
    return { keep: true, confidence: "medium", reasons };
  }
  if (args.name && args.education && args.sameTitle) {
    return { keep: true, confidence: "medium", reasons };
  }
  return { keep: false, confidence: "medium", reasons };
}

function explanationFor(args: {
  contactDiffers: boolean;
  workMatched: number;
  education: boolean;
  email: boolean;
  phone: boolean;
  linkedin: boolean;
  fromResume: boolean;
}): string {
  if (args.workMatched > 0 && args.contactDiffers) {
    return args.fromResume
      ? "The uploaded résumé matches a candidate already in your ATS. Contact details differ, but the work history is the same person."
      : "This candidate matches a record already in your ATS. Contact details differ, but the work history is the same person.";
  }
  if (args.email) {
    return "An existing candidate already uses this email address.";
  }
  if (args.phone) {
    return "An existing candidate already uses this phone number.";
  }
  if (args.linkedin) {
    return "An existing candidate is already linked to this LinkedIn profile.";
  }
  if (args.workMatched > 0 && args.education) {
    return "Name, work history, and education overlap with a candidate already in your ATS.";
  }
  if (args.workMatched > 0) {
    return "Work history overlaps with a candidate already in your ATS.";
  }
  return "This looks like a candidate already in your ATS.";
}

function headlineFor(reasons: DuplicateMatchReason[]): string {
  if (reasons.includes("work_history") && reasons.includes("name")) {
    return "Matched on resume work history and candidate name";
  }
  if (reasons.includes("email")) return "Matched on email address";
  if (reasons.includes("phone")) return "Matched on phone number";
  if (reasons.includes("linkedin")) return "Matched on LinkedIn profile";
  if (reasons.includes("education") && reasons.includes("name")) {
    return "Matched on education and candidate name";
  }
  return "Possible match with an existing candidate";
}

function subheadFor(args: {
  workMatched: number;
  workTotal: number;
  sameTitle: boolean;
  education: boolean;
  email: boolean;
  phone: boolean;
}): string {
  const parts: string[] = [];
  if (args.workTotal > 0 && args.workMatched > 0) {
    parts.push(
      `${args.workMatched} of ${args.workTotal} employers & date ranges align`
    );
  }
  if (args.sameTitle) parts.push("current title is the same");
  if (args.education && args.workMatched === 0) {
    parts.push("education matches");
  }
  if (!parts.length && args.email) parts.push("email is an exact match");
  if (!parts.length && args.phone) parts.push("phone is an exact match");
  return parts.join(" · ");
}

export function contentMatchPercent(args: {
  name: boolean;
  workMatched: number;
  workTotal: number;
  education: boolean;
  sameTitle: boolean;
}): number {
  const ratio = args.workTotal > 0 ? args.workMatched / args.workTotal : 0;
  const raw =
    Math.round(ratio * 70) +
    (args.name ? 12 : 0) +
    (args.education ? 8 : 0) +
    (args.sameTitle ? 6 : 0);
  return Math.max(50, Math.min(99, raw));
}

function signalLabelFor(reasons: DuplicateMatchReason[]): string {
  if (reasons.includes("work_history") && reasons.includes("education")) {
    return "Résumé history & education match — the reliable signal.";
  }
  if (reasons.includes("work_history")) {
    return "Résumé history match — the reliable signal.";
  }
  if (reasons.includes("email")) {
    return "Email address match — the reliable signal";
  }
  if (reasons.includes("phone")) {
    return "Phone number match — the reliable signal";
  }
  if (reasons.includes("linkedin")) {
    return "LinkedIn profile match — the reliable signal";
  }
  if (reasons.includes("education")) {
    return "Education match — the reliable signal";
  }
  return "Name and profile details match — review before creating";
}

export function leadToIncoming(lead: Record<string, any>): IncomingCandidateInput {
  return {
    name: lead?.name || "",
    email: lead?.email || "",
    phone: lead?.phone || "",
    title: lead?.title || "",
    location: lead?.location || "",
    linkedin_url: lead?.linkedin_url || lead?.linkedin || "",
    resume_file_name: lead?.resume_file_name || lead?.resumeFileName || "",
    source: lead?.source || "",
    experience: Array.isArray(lead?.experience) ? lead.experience : [],
    education: Array.isArray(lead?.education) ? lead.education : [],
  };
}

export function compareIncomingToExisting(
  incoming: IncomingCandidateInput,
  existingLead: Record<string, any>
): DuplicateMatch | null {
  const existing = leadToIncoming(existingLead);
  const id = String(existingLead?.id || "");
  if (!id) return null;

  const email =
    Boolean(normalizeEmail(incoming.email)) &&
    normalizeEmail(incoming.email) === normalizeEmail(existing.email);
  const iPhone = normalizePhoneDigits(incoming.phone);
  const ePhone = normalizePhoneDigits(existing.phone);
  const phone = iPhone.length >= 7 && iPhone === ePhone;
  const iLi = normalizeLinkedIn(incoming.linkedin_url);
  const eLi = normalizeLinkedIn(existing.linkedin_url);
  const linkedin = Boolean(iLi) && iLi === eLi;
  const name = namesMatch(incoming.name, existing.name);
  const work = countWorkHistoryOverlap(
    incoming.experience || [],
    existing.experience || []
  );
  const education = educationOverlaps(
    incoming.education || [],
    existing.education || []
  );
  const sameTitle = titlesMatch(
    currentTitle(incoming.title, incoming.experience),
    currentTitle(existing.title, existing.experience)
  );

  const scored = scoreMatch({
    email,
    phone,
    linkedin,
    name,
    workMatched: work.matched,
    education,
    sameTitle,
  });
  if (!scored.keep) return null;

  const differs = contactDiffers(incoming, existing);
  const fromResume = /resume/i.test(String(incoming.source || ""));
  const updated =
    formatUpdated(
      existingLead?.modified_at ||
        existingLead?.updated_at ||
        existingLead?.created_at ||
        existingLead?.createdAt
    ) || "unknown date";

  return {
    candidateId: id,
    confidence: scored.confidence,
    reasons: scored.reasons,
    headline: headlineFor(scored.reasons),
    subhead: subheadFor({
      workMatched: work.matched,
      workTotal: work.incomingTotal || work.existingTotal,
      sameTitle,
      education,
      email,
      phone,
    }),
    explanation: explanationFor({
      contactDiffers: differs,
      workMatched: work.matched,
      education,
      email,
      phone,
      linkedin,
      fromResume,
    }),
    signalLabel: signalLabelFor(scored.reasons),
    contactDiffers: differs,
    contentMatchPercent: contentMatchPercent({
      name,
      workMatched: work.matched,
      workTotal: work.incomingTotal || work.existingTotal,
      education,
      sameTitle,
    }),
    workMatched: work.matched,
    workIncomingTotal: work.incomingTotal,
    educationMatched: education,
    sameCurrentTitle: sameTitle,
    existing: {
      id,
      name: existing.name || "Unknown",
      role: "existing",
      subtitle: existing.title
        ? `${existing.title} · added ${updated}`
        : `Existing record · added ${updated}`,
      title: existing.title,
      email: existing.email,
      phone: existing.phone,
      historyLine: formatHistoryLine(existing.experience),
      educationLine: formatEducationLine(existing.education),
      resumeFileName: existing.resume_file_name,
      highlightHistory: work.matched > 0,
      highlightEducation: education,
    },
    incoming: {
      name: incoming.name || "New candidate",
      role: "incoming",
      subtitle: incoming.title
        ? `${incoming.title} · ${fromResume ? "uploading now" : "not saved yet"}`
        : fromResume
          ? "New upload · uploading now"
          : "New candidate · not saved yet",
      title: incoming.title,
      email: incoming.email,
      phone: incoming.phone,
      historyLine: formatHistoryLine(incoming.experience),
      educationLine: formatEducationLine(incoming.education),
      resumeFileName: incoming.resume_file_name,
      highlightHistory: work.matched > 0,
      highlightEducation: education,
    },
  };
}

export function findDuplicateMatches(
  incoming: IncomingCandidateInput,
  leads: Array<Record<string, any>>,
  opts?: { limit?: number }
): DuplicateMatch[] {
  const hasSignal =
    Boolean(incoming.name?.trim()) ||
    Boolean(normalizeEmail(incoming.email)) ||
    normalizePhoneDigits(incoming.phone).length >= 7 ||
    Boolean(normalizeLinkedIn(incoming.linkedin_url)) ||
    (incoming.experience || []).some((row) => experienceCompany(row));
  if (!hasSignal) return [];

  const matches: DuplicateMatch[] = [];
  for (const lead of leads) {
    const match = compareIncomingToExisting(incoming, lead);
    if (match) matches.push(match);
  }

  const rank = (m: DuplicateMatch) => {
    let score = m.confidence === "high" ? 100 : 40;
    if (m.reasons.includes("email")) score += 50;
    if (m.reasons.includes("phone")) score += 40;
    if (m.reasons.includes("linkedin")) score += 40;
    score += m.workMatched * 8;
    if (m.educationMatched) score += 10;
    if (m.sameCurrentTitle) score += 5;
    return score;
  };

  matches.sort((a, b) => rank(b) - rank(a));
  const limit = opts?.limit ?? 5;
  return matches.slice(0, limit);
}

export function incomingFingerprint(incoming: IncomingCandidateInput): string {
  return [
    normalizeMatchText(incoming.name),
    normalizeEmail(incoming.email),
    normalizePhoneDigits(incoming.phone),
    normalizeLinkedIn(incoming.linkedin_url),
    (incoming.experience || [])
      .map((row) => normalizeOrg(experienceCompany(row)))
      .filter(Boolean)
      .join("|"),
  ].join("::");
}
