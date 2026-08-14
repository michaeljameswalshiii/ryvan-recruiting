import { expandSearchToken, labelToId, mergeTaxonomy } from "./taxonomy";
import type { TenantTaxonomyOverrides } from "./types";

/** Split "Construction AND Project Management" / "CNC + Lean" into clauses. */
export function splitAndClauses(query: string): string[] {
  return String(query || "")
    .split(/\s+(?:and|&)\s+|\s*\+\s+/i)
    .map((part) => part.trim())
    .filter((part) => part.length >= 2);
}

function clauseMatchesHay(
  clause: string,
  hay: string,
  taxonomy: ReturnType<typeof mergeTaxonomy>
): boolean {
  const q = clause.trim().toLowerCase();
  if (!q) return true;
  if (hay.includes(q)) return true;
  const mapped = labelToId(clause, taxonomy);
  if (mapped && hay.includes(mapped)) return true;
  for (const piece of expandSearchToken(clause, taxonomy)) {
    if (piece.length >= 2 && hay.includes(piece)) return true;
  }
  return false;
}

/**
 * True when a search query matches structured fields or controlled tags,
 * including synonym expansion ("PM" → Project Manager).
 * "A AND B" requires both clauses.
 */
export function recordMatchesQuery(input: {
  query: string;
  fields?: Array<string | null | undefined>;
  tags?: Array<string | null | undefined>;
  overrides?: TenantTaxonomyOverrides | null;
}): boolean {
  const q = (input.query || "").trim();
  if (!q) return true;

  const taxonomy = mergeTaxonomy(input.overrides);
  const hay = [
    ...(input.fields || []),
    ...(input.tags || []),
  ]
    .map((v) => String(v || "").toLowerCase())
    .filter(Boolean)
    .join(" | ");

  if (!hay) return false;

  const clauses = splitAndClauses(q);
  if (clauses.length >= 2) {
    return clauses.every((clause) => clauseMatchesHay(clause, hay, taxonomy));
  }

  return clauseMatchesHay(q, hay, taxonomy);
}
