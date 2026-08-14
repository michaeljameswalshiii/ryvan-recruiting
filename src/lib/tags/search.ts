import { expandSearchToken, mergeTaxonomy } from "./taxonomy";
import type { TenantTaxonomyOverrides } from "./types";

/**
 * True when a search query matches structured fields or controlled tags,
 * including synonym expansion ("PM" → Project Manager).
 */
export function recordMatchesQuery(input: {
  query: string;
  fields?: Array<string | null | undefined>;
  tags?: Array<string | null | undefined>;
  overrides?: TenantTaxonomyOverrides | null;
}): boolean {
  const q = (input.query || "").trim().toLowerCase();
  if (!q) return true;

  const taxonomy = mergeTaxonomy(input.overrides);
  const tokens = q.split(/\s+/).filter((t) => t.length >= 2);
  const expanded = new Set<string>();
  for (const token of tokens.length ? tokens : [q]) {
    for (const piece of expandSearchToken(token, taxonomy)) {
      expanded.add(piece);
    }
    expanded.add(token);
  }

  const hay = [
    ...(input.fields || []),
    ...(input.tags || []),
  ]
    .map((v) => String(v || "").toLowerCase())
    .filter(Boolean)
    .join(" | ");

  if (!hay) return false;
  if (hay.includes(q)) return true;
  for (const piece of expanded) {
    if (piece.length >= 2 && hay.includes(piece)) return true;
  }
  return false;
}
