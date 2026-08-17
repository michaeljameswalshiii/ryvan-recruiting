/**
 * Versioned Boolean Generator system prompt.
 * Edit this file to refine string quality without changing route logic.
 */

import { getTaxonomyEntry } from "@/lib/tags";

export const BOOLEAN_PROMPT_VERSION = 1;

export type BooleanPlatform =
  | "LinkedIn"
  | "Indeed"
  | "Apollo"
  | "Google"
  | "All";

export type BooleanString = {
  label: string;
  platform: string;
  query: string;
  notes?: string;
};

export type BooleanCache = {
  generatedAt: string;
  editedAt?: string;
  promptVersion?: number;
  model?: string;
  strings: BooleanString[];
};

export const BOOLEAN_SYSTEM_PROMPT = `You are a sourcing assistant for a recruiting firm. Given a job's details, produce standard Boolean search strings a recruiter can paste into LinkedIn Recruiter, Indeed, Apollo, and general search engines. Return ONLY valid JSON, no preamble or markdown, in this shape:

{"strings": [{"label": "...", "platform": "LinkedIn", "query": "...", "notes": "..."}]}

Rules:
- Produce 4–6 variants: a broad net, a tight/senior-focused one, a title-synonym version, and a skills-heavy version. Add Indeed-simpler and Apollo-oriented variants when useful.
- Use proper Boolean: quotes for phrases, parentheses for grouping, AND/OR/NOT in caps.
- Include title synonyms (e.g. "Director of Operations" OR "Operations Director" OR "VP Operations" OR "Plant Manager").
- Weave in the most differentiating skills from the tags, not all of them. Cluster related skills (e.g. CNC + Lean Manufacturing + Six Sigma) rather than dumping the full tag list.
- Platform notes:
  - LinkedIn: Recruiter Boolean. Prefer title + skills. Do not use site: operators.
  - Indeed: keep it shorter and less nested; Indeed caps complexity.
  - Apollo: people-search style keywords (titles + skills). Avoid site: and location operators Apollo already filters separately.
  - Google: may use site:linkedin.com/in and location phrases.
- Add a one-line note on when to use each variant.
- Never include the client or company name in any query, even if it appears in the job details.
- If the job is marked confidential, search on role and skills only. Do not echo company, client, or brand names.
- Do not invent certifications or tools that are not in the title, tags, or description.
- Prefer 3–8 high-signal terms per string. Skip generic tags like "Engineering" unless they are the only signal.`;

export function isConfidentialJob(job: {
  title?: string | null;
  tags?: string[] | null;
  confidential?: boolean | null;
  companyName?: string | null;
}): boolean {
  if (job.confidential === true) return true;
  const title = String(job.title || "");
  if (/\bconfidential\b/i.test(title)) return true;
  const tags = Array.isArray(job.tags) ? job.tags : [];
  return tags.some((tag) => /\bconfidential\b/i.test(String(tag)));
}

export function resolveJobTagLabels(tags?: string[] | null): string[] {
  if (!Array.isArray(tags)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of tags) {
    const value = String(raw || "").trim();
    if (!value) continue;
    const label = getTaxonomyEntry(value)?.label || value;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(label);
  }
  return out;
}

export function buildBooleanJobContext(job: {
  title?: string | null;
  location?: string | null;
  tags?: string[] | null;
  salaryRange?: string | null;
  description?: string | null;
  employmentType?: string | null;
  companyName?: string | null;
  confidential?: boolean | null;
}): string {
  const confidential = isConfidentialJob(job);
  const tags = resolveJobTagLabels(job.tags);
  const description = String(job.description || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 6000);

  const lines = [
    `Title: ${String(job.title || "").trim() || "(untitled)"}`,
    `Location: ${String(job.location || "").trim() || "(not specified)"}`,
    `Skills/Tags: ${tags.length ? tags.join(", ") : "(none)"}`,
    `Employment type: ${String(job.employmentType || "").trim() || "(not specified)"}`,
    `Salary: ${String(job.salaryRange || "").trim() || "(not specified)"}`,
    confidential
      ? "Confidential: YES. Do not include company, client, or brand names in any query."
      : `Company: ${String(job.companyName || "").trim() || "(not specified)"}`,
    `Description: ${description || "(none)"}`,
  ];
  return lines.join("\n");
}

export function parseBooleanPayload(raw: unknown): BooleanString[] {
  const payload =
    raw && typeof raw === "object" ? (raw as { strings?: unknown }) : {};
  const list = Array.isArray(payload.strings)
    ? payload.strings
    : Array.isArray(raw)
      ? raw
      : [];

  const strings: BooleanString[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const query = String(row.query || row.boolean || row.string || "").trim();
    if (!query) continue;
    strings.push({
      label: String(row.label || row.name || "Boolean string").trim().slice(0, 120),
      platform: String(row.platform || "LinkedIn").trim().slice(0, 40) || "LinkedIn",
      query: query.slice(0, 4000),
      notes: String(row.notes || row.note || "").trim().slice(0, 500) || undefined,
    });
    if (strings.length >= 8) break;
  }
  return strings;
}

export function parseBooleanText(text: string): BooleanString[] {
  const trimmed = String(text || "").trim();
  if (!trimmed) return [];
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  const objectMatch = candidate.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  const jsonText = objectMatch ? objectMatch[1] : candidate;
  try {
    return parseBooleanPayload(JSON.parse(jsonText));
  } catch {
    return [];
  }
}
