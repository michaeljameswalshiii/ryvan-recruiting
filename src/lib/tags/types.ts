/**
 * Controlled tagging types for Trio.
 * Tags are never free-form keyword dumps — they map to this taxonomy.
 */

export const TAG_FACETS = [
  "industry",
  "functional",
  "skill",
  "certification",
  "seniority",
  "specialty",
  "software",
  "language",
  "employment_type",
  "work_preference",
  "company_size",
  "decision_role",
] as const;

export type TagFacet = (typeof TAG_FACETS)[number];

export const TAG_OBJECT_TYPES = [
  "candidate",
  "job",
  "company",
  "contact",
] as const;

export type TagObjectType = (typeof TAG_OBJECT_TYPES)[number];

export type TaxonomyEntry = {
  id: string;
  label: string;
  facet: TagFacet;
  synonyms: string[];
  objects: TagObjectType[];
};

export type TagHit = {
  id: string;
  label: string;
  facet: TagFacet;
  confidence: number;
  source: "explicit" | "inferred";
};

export type TagAttributes = {
  leadershipLevel?: "Entry" | "Mid" | "Senior" | "Executive";
  managementScope?: string;
  regulatedEnvironment?: boolean;
  yearsExperience?: number | null;
  remotePreference?: "Remote" | "Hybrid" | "On-site";
  employmentType?: "Direct Hire" | "Contract" | "Contract-to-Hire";
};

export type TagEngineResult = {
  objectType: TagObjectType;
  tags: string[];
  tagIds: string[];
  hits: TagHit[];
  attributes: TagAttributes;
};

export type TenantTaxonomyOverrides = {
  disabledIds?: string[];
  extra?: TaxonomyEntry[];
};

export type TagMatchGap = {
  id: string;
  label: string;
  facet: TagFacet;
};

export type TagMatchResult = {
  score: number;
  matched: TagMatchGap[];
  gaps: TagMatchGap[];
};
