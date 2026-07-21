/**
 * Lightweight stage ranking for merges / comparisons (no React).
 */

const PIPELINE_ORDER = [
  "sourced",
  "identification",
  "new",
  "left_message",
  "contacted",
  "outreach",
  "applied",
  "application",
  "interested",
  "pre_screened",
  "submitted",
  "presented",
  "conversation",
  "qualified",
  "interviewing",
  "interview",
  "second_interview",
  "third_interview",
  "offer_out",
  "offer",
  "offer_accepted",
  "converted",
  "placed",
  "hired",
  "accepted",
] as const;

const REJECTED = new Set([
  "rejected",
  "not_interested",
  "offer_declined",
  "withdrawn",
  "dnu",
  "do_not_use",
]);

export function stageIndex(status?: string | null): number {
  if (!status) return 0;
  const s = String(status).trim().toLowerCase().replace(/\s+/g, "_");
  if (REJECTED.has(s)) return -1;
  const idx = PIPELINE_ORDER.indexOf(s as (typeof PIPELINE_ORDER)[number]);
  if (idx >= 0) return idx;
  // fuzzy
  if (s.includes("interview")) return PIPELINE_ORDER.indexOf("interviewing");
  if (s.includes("submit")) return PIPELINE_ORDER.indexOf("submitted");
  if (s.includes("offer")) return PIPELINE_ORDER.indexOf("offer_out");
  if (s.includes("plac") || s.includes("hire")) return PIPELINE_ORDER.indexOf("placed");
  return 0;
}
