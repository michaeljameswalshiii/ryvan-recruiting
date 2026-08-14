import { expandSearchToken, labelToId, mergeTaxonomy } from "./taxonomy";
import type { TagMatchResult, TenantTaxonomyOverrides } from "./types";

function toIds(
  tags: string[] | undefined,
  overrides?: TenantTaxonomyOverrides | null
): string[] {
  const taxonomy = mergeTaxonomy(overrides);
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const raw of tags || []) {
    const id = labelToId(String(raw || ""), taxonomy) || String(raw || "").toLowerCase();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

/**
 * Compare job requirement tags to candidate tags (synonym-aware).
 */
export function matchControlledTags(input: {
  required: string[];
  candidate: string[];
  overrides?: TenantTaxonomyOverrides | null;
}): TagMatchResult {
  const taxonomy = mergeTaxonomy(input.overrides);
  const requiredIds = toIds(input.required, input.overrides);
  const candidateIds = new Set(toIds(input.candidate, input.overrides));

  const matched: TagMatchResult["matched"] = [];
  const gaps: TagMatchResult["gaps"] = [];

  for (const id of requiredIds) {
    const entry = taxonomy.find((row) => row.id === id);
    const label = entry?.label || id;
    const facet = entry?.facet || "skill";
    const expanded = new Set(
      expandSearchToken(label, taxonomy).concat(id)
    );
    const hit = [...expanded].some((token) => {
      const mapped = labelToId(token, taxonomy);
      return (mapped && candidateIds.has(mapped)) || candidateIds.has(token);
    });
    const row = { id, label, facet };
    if (hit) matched.push(row);
    else gaps.push(row);
  }

  const score =
    requiredIds.length === 0
      ? 0
      : Math.round((matched.length / requiredIds.length) * 100);

  return { score, matched, gaps };
}
