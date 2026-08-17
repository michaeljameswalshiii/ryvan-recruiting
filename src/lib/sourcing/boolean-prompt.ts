/**
 * Versioned Boolean Generator system prompt.
 * Edit this file to refine string quality without changing route logic.
 */

import { getTaxonomyEntry } from "@/lib/tags";

export const BOOLEAN_PROMPT_VERSION = 2;

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

export const BOOLEAN_SYSTEM_PROMPT = `You are a sourcing assistant for a recruiting firm. Given a job's details, produce standard Boolean search strings a recruiter can paste into LinkedIn Recruiter, Indeed Resume Search / Jobs, Apollo, and general search engines. Return ONLY valid JSON, no preamble or markdown, in this shape:

{"strings": [{"label": "...", "platform": "LinkedIn", "query": "...", "notes": "..."}]}

Rules:
- Produce 7–10 variants covering LinkedIn, Indeed, Apollo, and Google. Always include at least three Indeed strings (Resume Search, Jobs keywords, tight/senior). Never give Indeed only a space-separated keyword dump.
- Use proper Boolean: quotes for phrases, parentheses for grouping, AND/OR/NOT in caps.
- Include title synonyms (e.g. "Director of Operations" OR "Operations Director" OR "VP Operations" OR "Plant Manager").
- Weave in the most differentiating skills from the tags, not all of them. Cluster related skills (e.g. CNC + Lean Manufacturing + Six Sigma) rather than dumping the full tag list.
- Platform notes:
  - LinkedIn: Recruiter Boolean. Prefer title + skills. Do not use site: operators.
  - Indeed Resume Search / Smart Sourcing (platform: "Indeed"):
    * Use title:() for current-title targeting. Use anytitle:() when past titles should count.
    * AND, OR, and quotes are reliable. Keep a single level of parentheses. Prefer -intern -junior over a nested NOT group.
    * Do NOT put city/state in the query — Indeed has a separate location box. Mention the location in notes instead ("set Where to Atlanta, GA").
    * Required Indeed set:
      1) Resume Search — title:("Title A" OR "Title B") AND (skill OR "vertical phrase")
      2) Jobs keywords — flatter quoted phrases for indeed.com/jobs (competitive postings + simple paste)
      3) Tight / senior — title: + skills + -intern -junior -assistant
    * Stay under ~800 characters. 3–7 high-signal terms. Field operators beat dumping every tag.
  - Apollo: people-search style keywords (titles + skills). Avoid site: and location operators Apollo already filters separately.
  - Google: may use site:linkedin.com/in and site:indeed.com/r plus location phrases.
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
    if (strings.length >= 12) break;
  }
  return strings;
}

function quotePhrase(value: string): string {
  const t = value.replace(/"/g, "").trim();
  if (!t) return "";
  return /\s/.test(t) ? `"${t}"` : t;
}

function uniqueLabels(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const t = value.replace(/\s+/g, " ").trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

export function titleSynonyms(title?: string | null): string[] {
  const cleaned = String(title || "")
    .replace(/\bconfidential\b/gi, "")
    .replace(/[—–|-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return [];
  const out = [cleaned];
  const ofMatch = cleaned.match(/^(.+?)\s+of\s+(.+)$/i);
  if (ofMatch) out.push(`${ofMatch[2]} ${ofMatch[1]}`);
  if (/^director of /i.test(cleaned)) {
    out.push(`${cleaned.replace(/^director of /i, "")} Director`);
  }
  if (/^vp(?:\s+of)?\s+/i.test(cleaned)) {
    out.push(cleaned.replace(/^vp(?:\s+of)?\s+/i, "Vice President of "));
    out.push(cleaned.replace(/^vp(?:\s+of)?\s+/i, "VP "));
  }
  if (/^vice president(?:\s+of)?\s+/i.test(cleaned)) {
    out.push(cleaned.replace(/^vice president(?:\s+of)?\s+/i, "VP "));
  }
  if (/\bplant manager\b/i.test(cleaned) === false && /operations/i.test(cleaned)) {
    out.push("Plant Manager");
  }
  return uniqueLabels(out).slice(0, 6);
}

const GENERIC_TAGS = new Set([
  "engineering",
  "operations",
  "management",
  "leadership",
  "manufacturing",
]);

export function differentiatingTags(tags?: string[] | null, limit = 5): string[] {
  const labels = resolveJobTagLabels(tags);
  const ranked = [
    ...labels.filter((t) => !GENERIC_TAGS.has(t.toLowerCase())),
    ...labels.filter((t) => GENERIC_TAGS.has(t.toLowerCase())),
  ];
  return uniqueLabels(ranked).slice(0, limit);
}

function orGroup(values: string[]): string {
  const parts = uniqueLabels(values).map(quotePhrase).filter(Boolean);
  if (!parts.length) return "";
  return parts.length === 1 ? parts[0] : `(${parts.join(" OR ")})`;
}

function indeedLocationNote(location?: string | null): string {
  const loc = String(location || "").trim();
  return loc
    ? `Set Indeed's Where box to ${loc} — do not paste the city into the keyword field.`
    : "Set location in Indeed's Where box, not in this string.";
}

/**
 * Indeed Resume Search / Smart Sourcing: title:() plus one skill OR-group.
 * Location stays out of the query (Indeed filters it separately).
 */
export function indeedResumeQuery(titles: string[], skills: string[]): string {
  const titleBit = titles.length ? `title:${orGroup(titles)}` : "";
  const skillBit = orGroup(skills);
  if (titleBit && skillBit) return `${titleBit} AND ${skillBit}`;
  return titleBit || skillBit;
}

/** Flatter Indeed Jobs what-box: quoted title plus one skill OR-group. */
export function indeedJobsQuery(titles: string[], skills: string[]): string {
  const titleBit = titles[0] ? quotePhrase(titles[0]) : "";
  const skillBit = orGroup(skills);
  if (titleBit && skillBit) return `${titleBit} ${skillBit}`;
  return titleBit || skillBit;
}

export function indeedTightQuery(titles: string[], skills: string[]): string {
  const base = indeedResumeQuery(titles.slice(0, 3), skills.slice(0, 3));
  if (!base) return "";
  return `${base} -intern -junior -assistant`;
}

export function indeedOpenUrls(
  query: string,
  location?: string | null
): { jobs: string; resumes: string } {
  const q = encodeURIComponent(String(query || "").trim());
  const loc = String(location || "").trim();
  const l = loc ? `&l=${encodeURIComponent(loc)}` : "";
  return {
    jobs: `https://www.indeed.com/jobs?q=${q}${l}`,
    resumes: `https://resumes.indeed.com/search?q=${q}${l}`,
  };
}

export function isIndeedPlatform(platform?: string | null): boolean {
  return /\bindeed\b/i.test(String(platform || ""));
}

function indeedFallbackStrings(job: {
  title?: string | null;
  tags?: string[] | null;
  location?: string | null;
}): BooleanString[] {
  const titles = titleSynonyms(job.title);
  const skills = differentiatingTags(job.tags, 5);
  const locNote = indeedLocationNote(job.location);
  const resume = indeedResumeQuery(titles, skills.slice(0, 3));
  const jobs = indeedJobsQuery(titles, skills.slice(0, 3));
  const tight = indeedTightQuery(titles, skills);
  const strings: BooleanString[] = [];
  if (resume) {
    strings.push({
      label: "Resume Search",
      platform: "Indeed",
      query: resume,
      notes: `Indeed Resume Search / Smart Sourcing workhorse. ${locNote}`,
    });
  }
  if (jobs) {
    strings.push({
      label: "Jobs keywords",
      platform: "Indeed",
      query: jobs,
      notes: `Paste into Indeed Jobs what-box for competing postings. ${locNote}`,
    });
  }
  if (tight && tight !== resume) {
    strings.push({
      label: "Tight / senior",
      platform: "Indeed",
      query: tight,
      notes: `Tighter Resume Search when volume is high. ${locNote}`,
    });
  }
  return strings;
}

/**
 * If Claude omitted Indeed or only emitted a keyword dump, splice in
 * title: Resume Search / Jobs / tight variants from tags.
 */
export function ensureIndeedVariants(
  strings: BooleanString[],
  job: {
    title?: string | null;
    tags?: string[] | null;
    location?: string | null;
  }
): BooleanString[] {
  const extras = indeedFallbackStrings(job);
  if (!extras.length) return strings.slice(0, 12);

  const indeedRows = strings.filter((row) => isIndeedPlatform(row.platform));
  const hasTitleOperator = indeedRows.some((row) => /\btitle\s*:/i.test(row.query));
  const hasJobsKeywords = indeedRows.some((row) =>
    /jobs|keyword/i.test(`${row.label} ${row.notes || ""}`)
  );

  const merged = [...strings];
  const existingQueries = new Set(merged.map((row) => row.query.toLowerCase()));

  const needed: BooleanString[] = [];
  if (indeedRows.length === 0 || !hasTitleOperator) {
    const resume = extras.find((row) => /resume/i.test(row.label));
    if (resume) needed.push(resume);
  }
  if (indeedRows.length === 0 || !hasJobsKeywords) {
    const jobs = extras.find((row) => /jobs/i.test(row.label));
    if (jobs) needed.push(jobs);
  }
  if (indeedRows.length < 2) {
    for (const extra of extras) {
      if (!needed.includes(extra)) needed.push(extra);
    }
  }

  const toAdd = needed.filter((extra) => !existingQueries.has(extra.query.toLowerCase()));
  if (!toAdd.length) return merged.slice(0, 12);

  const insertAt = merged.findIndex((row) => isIndeedPlatform(row.platform));
  if (insertAt >= 0) merged.splice(insertAt, 0, ...toAdd);
  else merged.push(...toAdd);

  return merged.slice(0, 12);
}

/**
 * Deterministic strings from title + tags so the modal still works if Claude is down.
 */
export function fallbackBooleanStrings(job: {
  title?: string | null;
  tags?: string[] | null;
  location?: string | null;
}): BooleanString[] {
  const titles = titleSynonyms(job.title);
  const skills = differentiatingTags(job.tags, 5);
  const titleGroup = orGroup(titles);
  const skillGroup = orGroup(skills.slice(0, 3));
  const location = String(job.location || "").trim();
  const locBit = location ? ` AND ${quotePhrase(location)}` : "";

  const strings: BooleanString[] = [];
  if (titleGroup) {
    strings.push({
      label: "Broad net",
      platform: "LinkedIn",
      query: skillGroup ? `${titleGroup} AND ${skillGroup}` : titleGroup,
      notes: "Start here in LinkedIn Recruiter for volume.",
    });
    strings.push({
      label: "Title synonyms",
      platform: "LinkedIn",
      query: titleGroup,
      notes: "When the exact title is too narrow — swap titles only.",
    });
  }
  if (titleGroup && skillGroup) {
    strings.push({
      label: "Tight / senior",
      platform: "LinkedIn",
      query: `${titleGroup} AND ${skillGroup} AND (Senior OR Director OR VP OR "Vice President") NOT intern NOT junior`,
      notes: "Use when you only want seasoned operators.",
    });
  }
  strings.push(...indeedFallbackStrings(job));
  if (titles.length || skills.length) {
    strings.push({
      label: "Apollo keywords",
      platform: "Apollo",
      query: uniqueLabels([...titles.slice(0, 3), ...skills.slice(0, 4)]).join(", "),
      notes: "Paste into Apollo people search; apply location as a filter.",
    });
  }
  if (titleGroup) {
    strings.push({
      label: "Google / LinkedIn profiles",
      platform: "Google",
      query: `site:linkedin.com/in ${titleGroup}${skillGroup ? ` AND ${skillGroup}` : ""}${locBit}`,
      notes: "X-ray search for public LinkedIn profiles.",
    });
    const indeedXraySkills = orGroup(skills.slice(0, 2));
    strings.push({
      label: "Google / Indeed resumes",
      platform: "Google",
      query: `site:indeed.com/r ${titleGroup}${indeedXraySkills ? ` AND ${indeedXraySkills}` : ""}${locBit}`,
      notes: "X-ray public Indeed resume pages when Recruiter search is thin.",
    });
  }
  return strings.slice(0, 12);
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
