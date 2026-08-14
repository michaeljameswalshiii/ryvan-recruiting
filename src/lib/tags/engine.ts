import { mergeTaxonomy } from "./taxonomy";
import type {
  TagAttributes,
  TagEngineResult,
  TagHit,
  TagObjectType,
  TaxonomyEntry,
  TenantTaxonomyOverrides,
} from "./types";

function escapeRe(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function wordHit(haystack: string, term: string): boolean {
  const t = term.trim();
  if (t.length < 2) return false;
  const re = new RegExp(
    `(^|[^a-z0-9])${escapeRe(t)}([^a-z0-9]|$)`,
    "i"
  );
  return re.test(haystack);
}

function yearsFromText(text: string): number | null {
  const match = text.match(
    /(\d{1,2})\s*\+?\s*(?:years?|yrs?)(?:\s+of)?(?:\s+(?:experience|exp))?/i
  );
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isFinite(n) ? n : null;
}

function scopeFromText(text: string): string | undefined {
  const match = text.match(
    /\b(?:managed|led|oversaw|supervised)\s+(?:a\s+)?(\d{1,4})\+?\s*(?:person|people|employee|staff|direct reports?)/i
  );
  if (match) return `${match[1]}+ employees`;
  if (/\b50\+?\s*(?:person|people|employees|staff)\b/i.test(text)) {
    return "50+ employees";
  }
  return undefined;
}

function buildTerms(entry: TaxonomyEntry): Array<{ term: string; explicit: boolean }> {
  const terms = [entry.label, ...entry.synonyms]
    .map((t) => t.trim())
    .filter((t) => t.length >= 2)
    .sort((a, b) => b.length - a.length);
  return terms.map((term) => ({
    term,
    explicit: term.toLowerCase() === entry.label.toLowerCase(),
  }));
}

/**
 * Classify free text into controlled tags + attributes.
 * Never invents tags outside the taxonomy.
 */
export function classifyText(input: {
  objectType: TagObjectType;
  text?: string;
  title?: string;
  extras?: string[];
  overrides?: TenantTaxonomyOverrides | null;
  limit?: number;
}): TagEngineResult {
  const objectType = input.objectType;
  const blob = [
    input.title || "",
    input.text || "",
    ...(input.extras || []),
  ]
    .filter(Boolean)
    .join("\n")
    .replace(/\s+/g, " ")
    .trim();

  const taxonomy = mergeTaxonomy(input.overrides).filter((row) =>
    row.objects.includes(objectType)
  );
  const hits: TagHit[] = [];
  const seen = new Set<string>();

  if (blob.length >= 8) {
    const ranked = [...taxonomy].sort((a, b) => {
      const al = Math.max(a.label.length, ...a.synonyms.map((s) => s.length), 0);
      const bl = Math.max(b.label.length, ...b.synonyms.map((s) => s.length), 0);
      return bl - al;
    });

    for (const entry of ranked) {
      if (seen.has(entry.id)) continue;
      for (const { term, explicit } of buildTerms(entry)) {
        if (!wordHit(blob, term)) continue;
        const confidence = explicit ? 0.97 : 0.91;
        hits.push({
          id: entry.id,
          label: entry.label,
          facet: entry.facet,
          confidence,
          source: explicit ? "explicit" : "inferred",
        });
        seen.add(entry.id);
        break;
      }
    }
  }

  const years = yearsFromText(blob);
  if (years != null && years >= 8 && !seen.has("senior")) {
    const senior = taxonomy.find((t) => t.id === "senior");
    if (senior) {
      hits.push({
        id: senior.id,
        label: senior.label,
        facet: senior.facet,
        confidence: 0.72,
        source: "inferred",
      });
      seen.add(senior.id);
    }
  }

  const limit = input.limit ?? 18;
  const trimmed = hits
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, limit);

  const attributes: TagAttributes = {};
  const seniorHit = trimmed.find((h) => h.facet === "seniority");
  if (seniorHit) {
    attributes.leadershipLevel = seniorHit.label as TagAttributes["leadershipLevel"];
  }
  const scope = scopeFromText(blob);
  if (scope) attributes.managementScope = scope;
  attributes.regulatedEnvironment = trimmed.some((h) =>
    ["iso-13485", "as9100", "gmp"].includes(h.id)
  );
  if (years != null) attributes.yearsExperience = years;
  const remote = trimmed.find((h) => h.facet === "work_preference");
  if (remote) {
    attributes.remotePreference = remote.label as TagAttributes["remotePreference"];
  }
  const emp = trimmed.find((h) => h.facet === "employment_type");
  if (emp) {
    attributes.employmentType = emp.label as TagAttributes["employmentType"];
  }

  return {
    objectType,
    tags: trimmed.map((h) => h.label),
    tagIds: trimmed.map((h) => h.id),
    hits: trimmed,
    attributes,
  };
}

export function tagsFromRecord(input: {
  objectType: TagObjectType;
  title?: string;
  summary?: string;
  skills?: string[] | string;
  description?: string;
  industry?: string;
  notes?: string;
  experience?: Array<{ title?: string; company?: string; description?: string }>;
  overrides?: TenantTaxonomyOverrides | null;
}): TagEngineResult {
  const skillBits = Array.isArray(input.skills)
    ? input.skills
    : typeof input.skills === "string"
      ? input.skills.split(/[,;\n]/).map((s) => s.trim())
      : [];
  const expBits = (input.experience || []).flatMap((row) => [
    row.title || "",
    row.company || "",
    row.description || "",
  ]);
  return classifyText({
    objectType: input.objectType,
    title: input.title,
    text: [input.summary, input.description, input.industry, input.notes]
      .filter(Boolean)
      .join("\n"),
    extras: [...skillBits, ...expBits],
    overrides: input.overrides,
  });
}

/** Keep recruiter edits; fill gaps from the engine. */
export function mergeManualAndGenerated(
  existing: string[] | undefined,
  generated: string[],
  max = 18
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of [...(existing || []), ...generated]) {
    const tag = String(raw || "").trim();
    const key = tag.toLowerCase();
    if (!tag || seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
    if (out.length >= max) break;
  }
  return out;
}
