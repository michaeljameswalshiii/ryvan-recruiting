/**
 * Shared market-source records: pre-decision Apollo / AI / PDL search hits.
 * Separate from tenant leads, contacts, and companies.
 */

export const MARKET_PERSON_ROLES = ['candidate', 'contact'] as const;
export type MarketPersonRole = (typeof MARKET_PERSON_ROLES)[number];

export const MARKET_SURFACES = [
  'fill_job',
  'recruiter',
  'candidate_list_builder',
  'company_list_builder',
] as const;
export type MarketSurface = (typeof MARKET_SURFACES)[number];

export type MarketSighting = {
  at: string;
  surface: MarketSurface;
  source?: string;
  query?: string;
  title?: string;
  location?: string;
  /** Originating search-run id (no tenant). Used to keep backfill idempotent. */
  runKey?: string;
};

export type MarketPerson = {
  id: string;
  tenant_id: string;
  type: 'market_person';
  roles: MarketPersonRole[];
  name: string;
  title?: string;
  company?: string;
  companyId?: string;
  location?: string;
  email?: string;
  phone?: string;
  linkedinUrl?: string;
  pdlId?: string;
  apolloId?: string;
  sources: string[];
  sightingCount: number;
  sightings: MarketSighting[];
  firstSeenAt: string;
  lastSeenAt: string;
  createdAt: string;
  updatedAt: string;
};

export type MarketCompany = {
  id: string;
  tenant_id: string;
  type: 'market_company';
  name: string;
  website?: string;
  domain?: string;
  city?: string;
  state?: string;
  location?: string;
  industry?: string;
  employeeCount?: number;
  companySize?: string;
  sources: string[];
  sightingCount: number;
  sightings: MarketSighting[];
  firstSeenAt: string;
  lastSeenAt: string;
  createdAt: string;
  updatedAt: string;
};

export type MarketAlias = {
  id: string;
  tenant_id: string;
  type: 'market_person_alias' | 'market_company_alias';
  canonicalId: string;
  updatedAt: string;
};
