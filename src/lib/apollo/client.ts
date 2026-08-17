/**
 * Shared Apollo.io API client
 * Correct endpoints, auth headers, and normalized result shapes.
 *
 * @serverOnly
 */

const APOLLO_BASE = 'https://api.apollo.io/api/v1';

export type ApolloPerson = {
  id?: string;
  name?: string;
  first_name?: string;
  last_name?: string;
  title?: string;
  company?: string;
  email?: string;
  phone?: string;
  linkedin_url?: string;
  city?: string;
  state?: string;
  country?: string;
  industry?: string;
  headline?: string;
  organization_id?: string;
};

export type ApolloCompany = {
  id?: string;
  name?: string;
  website?: string;
  domain?: string;
  industry?: string;
  size?: string;
  employees_count?: number | string;
  city?: string;
  state?: string;
  country?: string;
  linkedin_url?: string;
  facebook_url?: string;
  twitter_url?: string;
  description?: string;
  headquarters_location?: string;
  founded_year?: number;
  annual_revenue?: string;
  phone?: string;
  num_jobs?: number;
};

export type ApolloJob = {
  id?: string;
  title?: string;
  company?: string;
  company_id?: string;
  location?: string;
  department?: string;
  description?: string;
  posted_at?: string;
  url?: string;
  employees_count?: string | number;
  industry?: string;
  source?: string;
};

export type PeopleSearchInput = {
  q?: string;
  titles?: string[];
  keywords?: string[];
  locations?: string[];
  personLocations?: string[];
  organizationLocations?: string[];
  industries?: string[];
  seniorities?: string[];
  technologies?: string[];
  per_page?: number;
  page?: number;
  /** Tenant BYOK / explicit key */
  auth?: ApolloAuthContext;
};

export type CompanySearchInput = {
  q?: string;
  keywords?: string[];
  locations?: string[];
  industries?: string[];
  employeeRanges?: string[];
  jobTitles?: string[];
  minJobs?: number;
  per_page?: number;
  page?: number;
  auth?: ApolloAuthContext;
};

export type JobSearchInput = {
  q?: string;
  titles?: string[];
  locations?: string[];
  keywords?: string[];
  per_page?: number;
  auth?: ApolloAuthContext;
};

const SENIORITY_MAP: Record<string, string> = {
  intern: 'intern',
  entry: 'entry',
  junior: 'entry',
  senior: 'senior',
  mid: 'senior',
  manager: 'manager',
  director: 'director',
  head: 'head',
  vp: 'vp',
  'vice president': 'vp',
  'c-level': 'c_suite',
  c_level: 'c_suite',
  c_suite: 'c_suite',
  cxo: 'c_suite',
  ceo: 'c_suite',
  cto: 'c_suite',
  cfo: 'c_suite',
  founder: 'founder',
  owner: 'owner',
  partner: 'partner',
  lead: 'senior',
};

/** Optional auth context for tenant BYOK or explicit key override */
export type ApolloAuthContext = {
  /** Explicit key (highest priority) */
  apiKey?: string;
  /** Resolve tenant-shared BYOK, then platform env */
  tenantId?: string | null;
};

function getEnvApiKey(): string {
  // Vercel env names are case-sensitive on Linux — accept common variants
  const key =
    process.env.APOLLO_API_KEY ||
    process.env.Apollo_API_key ||
    process.env.APOLLO_API_key ||
    process.env.apollo_api_key ||
    process.env.NEXT_PUBLIC_APOLLO_API_KEY ||
    '';
  return key.trim();
}

export function isApolloConfigured(): boolean {
  return getEnvApiKey().length > 10;
}

export type ApolloKeySource = 'explicit' | 'tenant' | 'platform' | 'none';

/** Sync env-only check; prefer resolveApolloConfigured for tenant-aware checks */
export async function resolveApolloConfigured(
  auth?: ApolloAuthContext
): Promise<boolean> {
  const { apiKey } = await resolveApiKeyDetailed(auth);
  return apiKey.length > 10;
}

async function resolveApiKey(auth?: ApolloAuthContext): Promise<string> {
  const { apiKey } = await resolveApiKeyDetailed(auth);
  return apiKey;
}

/** Resolve key + where it came from (never logs the key). */
export async function resolveApiKeyDetailed(
  auth?: ApolloAuthContext
): Promise<{ apiKey: string; source: ApolloKeySource; tenantId?: string }> {
  if (auth?.apiKey && auth.apiKey.trim().length > 10) {
    return { apiKey: auth.apiKey.trim(), source: 'explicit' };
  }
  if (auth?.tenantId) {
    try {
      const { resolveApolloApiKey } = await import(
        '@/lib/db/repositories/tenant-apollo-credentials-repository'
      );
      const resolved = await resolveApolloApiKey(auth.tenantId);
      if (resolved?.apiKey) {
        return {
          apiKey: resolved.apiKey,
          source: resolved.source,
          tenantId: auth.tenantId,
        };
      }
    } catch (err) {
      console.warn('[apollo] tenant key resolve failed', err);
    }
  }
  const env = getEnvApiKey();
  if (env.length > 10) {
    return {
      apiKey: env,
      source: 'platform',
      tenantId: auth?.tenantId || undefined,
    };
  }
  return {
    apiKey: '',
    source: 'none',
    tenantId: auth?.tenantId || undefined,
  };
}

function headersFor(key: string): HeadersInit {
  return {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache',
    'X-Api-Key': key,
    // Some Apollo accounts still expect this legacy header
    'Api-Key': key,
  };
}

function asStringArray(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .map((v) => String(v || '').trim())
      .filter(Boolean)
      .slice(0, 12);
  }
  if (typeof value === 'string' && value.trim()) return [value.trim()];
  return [];
}

function normalizeSeniorities(raw?: string[]): string[] {
  const out = new Set<string>();
  for (const s of asStringArray(raw)) {
    const key = s.toLowerCase().replace(/[_\s]+/g, ' ').trim();
    const mapped = SENIORITY_MAP[key] || SENIORITY_MAP[key.replace(/ /g, '_')];
    if (mapped) out.add(mapped);
  }
  return Array.from(out);
}

/** Convert "1-100" style ranges to Apollo "1,100" format */
function normalizeEmployeeRanges(raw?: string[]): string[] {
  return asStringArray(raw).map((r) => {
    if (r.includes(',')) return r;
    if (r.includes('-')) return r.replace('-', ',');
    return r;
  });
}

function personName(p: any): string {
  if (p?.name && String(p.name).trim() && !/^unknown$/i.test(String(p.name))) {
    return String(p.name).trim();
  }
  const first =
    p?.first_name ||
    p?.firstName ||
    p?.first_name_obfuscated ||
    p?.firstNameObfuscated ||
    '';
  // Apollo People Search often returns last_name_obfuscated (e.g. "S***h") not full last
  const last =
    p?.last_name ||
    p?.lastName ||
    p?.last_name_obfuscated ||
    p?.lastNameObfuscated ||
    '';
  const combined = `${first} ${last}`.replace(/\s+/g, ' ').trim();
  if (combined) return combined;
  // Last resort: title-based label so profiles are not all "Unknown" (which dedupe + quality-drop)
  const title = p?.title || p?.headline || '';
  if (title) return `Apollo contact · ${String(title).slice(0, 40)}`;
  if (p?.id) return `Apollo contact ${String(p.id).slice(0, 8)}`;
  return 'Unknown';
}

export function mapPerson(p: any): ApolloPerson {
  const org = p?.organization || p?.company || p?.account || {};
  const city =
    p?.city ||
    p?.present_raw_address ||
    (typeof p?.present_raw_address === 'string' ? p.present_raw_address : undefined);
  return {
    id: p?.id,
    name: personName(p),
    first_name: p?.first_name || p?.firstName || p?.first_name_obfuscated,
    last_name: p?.last_name || p?.lastName || p?.last_name_obfuscated,
    title: p?.title || p?.headline,
    company:
      (typeof org === 'string' ? org : org?.name) ||
      p?.organization_name ||
      p?.company_name ||
      p?.account?.name,
    email: p?.email || undefined,
    phone: p?.phone_number || p?.phone || p?.sanitized_phone,
    linkedin_url: p?.linkedin_url || p?.linkedin,
    city:
      typeof city === 'string'
        ? city.split(',')[0]?.trim() || city
        : p?.city,
    state: p?.state || p?.state_code,
    country: p?.country,
    industry: (typeof org === 'object' && org?.industry) || p?.industry,
    headline: p?.headline,
    organization_id:
      (typeof org === 'object' && org?.id) || p?.organization_id,
  };
}

/**
 * People Search intentionally returns privacy-masked last names (e.g. Me***).
 * Enrich by Apollo person id to unlock full name, LinkedIn, email (uses credits).
 * Docs: POST /v1/people/bulk_match  body: { details: [{ id }] }
 */
export async function enrichPeopleByIds(
  ids: string[],
  auth?: ApolloAuthContext,
  options?: { revealPersonalEmails?: boolean; revealPhoneNumber?: boolean }
): Promise<{
  people: ApolloPerson[];
  creditsConsumed?: number;
  error?: string;
  keySource?: ApolloKeySource;
  httpStatus?: number;
}> {
  const unique = Array.from(
    new Set((ids || []).map((id) => String(id || '').trim()).filter(Boolean))
  ).slice(0, 10); // Apollo bulk_match max 10 per call
  if (!unique.length) {
    return { people: [] };
  }

  const keyInfo = await resolveApiKeyDetailed(auth);
  if (keyInfo.apiKey.length <= 10) {
    return {
      people: [],
      error: 'Apollo not configured',
      keySource: 'none',
    };
  }

  const qs = new URLSearchParams();
  if (options?.revealPersonalEmails) qs.set('reveal_personal_emails', 'true');
  if (options?.revealPhoneNumber) qs.set('reveal_phone_number', 'true');
  const path =
    '/people/bulk_match' + (qs.toString() ? `?${qs.toString()}` : '');

  const result = await apolloFetch(
    path,
    { details: unique.map((id) => ({ id })) },
    { apiKey: keyInfo.apiKey }
  );

  if (!result.ok) {
    return {
      people: [],
      error: result.error || `Apollo enrich failed (${result.status})`,
      keySource: keyInfo.source,
      httpStatus: result.status,
    };
  }

  const matches =
    result.data?.matches ||
    result.data?.people ||
    (Array.isArray(result.data) ? result.data : []);
  const people = (Array.isArray(matches) ? matches : [])
    .filter(Boolean)
    .map(mapPerson);

  return {
    people,
    creditsConsumed:
      typeof result.data?.credits_consumed === 'number'
        ? result.data.credits_consumed
        : people.length,
    keySource: keyInfo.source,
    httpStatus: result.status,
  };
}

export type PersonMatchDetail = {
  linkedin_url?: string;
  email?: string;
  name?: string;
  first_name?: string;
  last_name?: string;
  organization_name?: string;
  domain?: string;
};

function splitPersonName(name: string): { first_name?: string; last_name?: string } {
  const parts = String(name || "")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  if (!parts.length) return {};
  if (parts.length === 1) return { first_name: parts[0] };
  return { first_name: parts[0], last_name: parts.slice(1).join(" ") };
}

function toMatchDetail(input: PersonMatchDetail): Record<string, string> {
  const out: Record<string, string> = {};
  const linkedin = String(input.linkedin_url || "").trim();
  const email = String(input.email || "").trim();
  const org = String(input.organization_name || "").trim();
  const domain = String(input.domain || "").trim();
  let first = String(input.first_name || "").trim();
  let last = String(input.last_name || "").trim();
  if ((!first || !last) && input.name) {
    const split = splitPersonName(input.name);
    first = first || split.first_name || "";
    last = last || split.last_name || "";
  }
  if (linkedin) out.linkedin_url = linkedin;
  if (email) out.email = email;
  if (first) out.first_name = first;
  if (last) out.last_name = last;
  if (org) out.organization_name = org;
  if (domain) out.domain = domain;
  return out;
}

/**
 * Match/enrich one or more people by LinkedIn URL, email, or name + company.
 * Docs: POST /v1/people/bulk_match
 */
export async function matchPeople(
  details: PersonMatchDetail[],
  auth?: ApolloAuthContext,
  options?: { revealPersonalEmails?: boolean; revealPhoneNumber?: boolean }
): Promise<{
  people: ApolloPerson[];
  creditsConsumed?: number;
  error?: string;
  keySource?: ApolloKeySource;
  httpStatus?: number;
}> {
  const cleaned = (details || [])
    .map(toMatchDetail)
    .filter((row) => Object.keys(row).length > 0)
    .slice(0, 10);
  if (!cleaned.length) {
    return { people: [], error: "Need a LinkedIn URL, email, or name to look up" };
  }

  const keyInfo = await resolveApiKeyDetailed(auth);
  if (keyInfo.apiKey.length <= 10) {
    return {
      people: [],
      error: "Apollo not configured",
      keySource: "none",
    };
  }

  const qs = new URLSearchParams();
  if (options?.revealPersonalEmails) qs.set("reveal_personal_emails", "true");
  if (options?.revealPhoneNumber) qs.set("reveal_phone_number", "true");
  const path =
    "/people/bulk_match" + (qs.toString() ? `?${qs.toString()}` : "");

  const result = await apolloFetch(
    path,
    { details: cleaned },
    { apiKey: keyInfo.apiKey }
  );

  if (!result.ok) {
    return {
      people: [],
      error: result.error || `Apollo lookup failed (${result.status})`,
      keySource: keyInfo.source,
      httpStatus: result.status,
    };
  }

  const matches =
    result.data?.matches ||
    result.data?.people ||
    (Array.isArray(result.data) ? result.data : []);
  const people = (Array.isArray(matches) ? matches : [])
    .filter(Boolean)
    .map(mapPerson);

  return {
    people,
    creditsConsumed:
      typeof result.data?.credits_consumed === "number"
        ? result.data.credits_consumed
        : people.length,
    keySource: keyInfo.source,
    httpStatus: result.status,
  };
}

export function mapOrganization(o: any): ApolloCompany {
  const city = o?.city || o?.organization_city;
  const state = o?.state || o?.organization_state;
  const country = o?.country || o?.organization_country;
  const hq =
    o?.raw_address ||
    o?.primary_location ||
    [city, state, country].filter(Boolean).join(', ');

  return {
    id: o?.id || o?.organization_id,
    name: o?.name || o?.organization_name || 'Unknown company',
    website: o?.website_url || o?.website || o?.primary_domain,
    domain: o?.primary_domain || o?.domain,
    industry:
      o?.industry ||
      (Array.isArray(o?.industries) ? o.industries[0] : undefined) ||
      (Array.isArray(o?.industry_tag_list) ? o.industry_tag_list[0] : undefined),
    size: o?.estimated_num_employees
      ? String(o.estimated_num_employees)
      : o?.organization_headcount_six_month_growth != null
        ? undefined
        : o?.employee_count,
    employees_count:
      o?.estimated_num_employees || o?.employee_count || o?.num_employees,
    city,
    state,
    country,
    linkedin_url: o?.linkedin_url,
    facebook_url: o?.facebook_url,
    twitter_url: o?.twitter_url,
    description: o?.short_description || o?.seo_description || o?.description,
    headquarters_location: typeof hq === 'string' ? hq : undefined,
    founded_year: o?.founded_year,
    annual_revenue: o?.annual_revenue_printed || o?.organization_revenue_printed,
    phone: o?.phone || o?.sanitized_phone,
    num_jobs: o?.num_jobs || o?.organization_num_jobs || o?.active_job_postings_count,
  };
}

async function apolloFetch(
  path: string,
  body: Record<string, unknown>,
  auth?: ApolloAuthContext
): Promise<{ ok: boolean; status: number; data: any; error?: string }> {
  const key = await resolveApiKey(auth);
  if (key.length <= 10) {
    return {
      ok: false,
      status: 400,
      data: null,
      error:
        'Apollo API key is not configured. Add a company Apollo key in Settings, or set APOLLO_API_KEY on the server.',
    };
  }

  try {
    const response = await fetch(`${APOLLO_BASE}${path}`, {
      method: 'POST',
      headers: headersFor(key),
      body: JSON.stringify(body),
    });

    const text = await response.text();
    let data: any = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text };
    }

    if (!response.ok) {
      const msg =
        data?.error ||
        data?.message ||
        data?.error_message ||
        (typeof data?.raw === 'string' ? data.raw.slice(0, 300) : null) ||
        `Apollo API error ${response.status}`;

      let friendly = msg;
      if (response.status === 401) {
        friendly =
          'Invalid Apollo API key (401). Update the company key in Company Settings → Integrations.';
      } else if (response.status === 403) {
        friendly =
          'Apollo plan or master API key required for this search (403).';
      } else if (response.status === 422) {
        friendly = `Apollo rejected the search filters (422): ${msg}`;
      } else if (response.status === 429) {
        friendly = 'Apollo rate limit exceeded (429). Try again shortly.';
      }

      return { ok: false, status: response.status, data, error: friendly };
    }

    return { ok: true, status: response.status, data };
  } catch (err: any) {
    return {
      ok: false,
      status: 500,
      data: null,
      error: err?.message || 'Apollo request failed',
    };
  }
}

/**
 * Heuristic parse when Smart Search is off — extract titles/locations from free text.
 */
export function heuristicParseQuery(q: string): {
  titles: string[];
  locations: string[];
  keywords: string[];
} {
  const query = (q || '').trim();
  if (!query) return { titles: [], locations: [], keywords: [] };

  const locations: string[] = [];
  const locPatterns = [
    /\bin\s+([A-Za-z .]+(?:,\s*[A-Za-z]{2})?)\s*$/i,
    /\b(miami|tampa|orlando|jacksonville|fort lauderdale|boca raton|south florida|florida|new york|nyc|austin|dallas|seattle|san francisco|bay area|los angeles|chicago|boston|atlanta|denver|remote)\b/i,
  ];
  for (const re of locPatterns) {
    const m = query.match(re);
    if (m?.[1] || m?.[0]) {
      const loc = (m[1] || m[0]).replace(/^in\s+/i, '').trim();
      if (loc && loc.toLowerCase() !== 'in') locations.push(loc);
    }
  }

  // Common title-ish phrases: strip location for title
  let titlePart = query
    .replace(/\bin\s+[A-Za-z .]+(?:,\s*[A-Za-z]{2})?\s*$/i, '')
    .replace(/\bremote\b/i, '')
    .trim();

  const titles = titlePart ? [titlePart] : [];
  const keywords = query
    .split(/[\s,]+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 2)
    .slice(0, 8);

  return {
    titles,
    locations: [...new Set(locations)],
    keywords,
  };
}

export async function searchPeople(
  input: PeopleSearchInput
): Promise<{
  people: ApolloPerson[];
  total: number;
  error?: string;
  raw?: any;
  keySource?: ApolloKeySource;
  httpStatus?: number;
  /** Filters actually sent (for debug / UI) */
  requestBody?: Record<string, unknown>;
}> {
  const keyInfo = await resolveApiKeyDetailed(input.auth);
  if (keyInfo.apiKey.length <= 10) {
    return {
      people: [],
      total: 0,
      error:
        'Apollo API key is not configured. Add a company Apollo master key in Company Settings → Integrations.',
      keySource: 'none',
    };
  }

  const heuristic = heuristicParseQuery(input.q || '');
  // Prefer explicit structured filters — do NOT let free-text heuristic
  // invent locations when caller intentionally passed empty locations.
  const titles = asStringArray(input.titles).length
    ? asStringArray(input.titles)
    : heuristic.titles;
  const personLocations = asStringArray(
    input.personLocations?.length ? input.personLocations : input.locations
  );
  const orgLocations = asStringArray(input.organizationLocations);
  // Only fall back to heuristic locations when caller did not pass locations at all
  const callerPassedLocations =
    input.personLocations != null || input.locations != null;
  const locations = callerPassedLocations
    ? personLocations.length > 0
      ? personLocations
      : orgLocations
    : personLocations.length > 0
      ? personLocations
      : orgLocations.length > 0
        ? orgLocations
        : heuristic.locations;

  const keywords = asStringArray(input.keywords);
  const seniorities = normalizeSeniorities(input.seniorities);
  const technologies = asStringArray(input.technologies).map((t) =>
    t.toLowerCase().replace(/[\s.]+/g, '_')
  );

  // Build Apollo People API Search payload (correct param names)
  const body: Record<string, unknown> = {
    page: input.page || 1,
    per_page: Math.min(input.per_page || 25, 100),
    include_similar_titles: true,
  };

  if (titles.length) body.person_titles = titles;
  // Apollo docs: person_locations like "California, US", "Oregon, US", city names.
  // Prefer "State, US" / full state name over bare "FL".
  if (locations.length) {
    const STATE_CODE_NAMES: Record<string, string> = {
      AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
      CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia',
      HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa',
      KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
      MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi',
      MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire',
      NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina',
      ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania',
      RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee',
      TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington',
      WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming', DC: 'District of Columbia',
    };
    body.person_locations = locations.map((l) => {
      const t = String(l).trim();
      if (/^[A-Z]{2}$/i.test(t)) {
        const name = STATE_CODE_NAMES[t.toUpperCase()];
        return name ? `${name}, US` : t;
      }
      // "Florida" → "Florida, US" (Apollo docs style)
      if (/^[A-Za-z .'-]+$/.test(t) && !/,\s*US$/i.test(t) && !/united states/i.test(t)) {
        const asState = Object.values(STATE_CODE_NAMES).find(
          (n) => n.toLowerCase() === t.toLowerCase()
        );
        if (asState) return `${asState}, US`;
      }
      return t;
    });
  }
  if (orgLocations.length) body.organization_locations = orgLocations;
  if (seniorities.length) body.person_seniorities = seniorities;
  if (technologies.length) {
    body.currently_using_any_of_technology_uids = technologies;
  }

  // q_keywords: free-text AND-style filter — keep SHORT.
  // Prefer person_titles + person_locations; only add light keywords when provided.
  if (keywords.length > 0) {
    body.q_keywords = keywords
      .map((k) => String(k).trim())
      .filter((k) => k.length >= 2 && k.length <= 40)
      .slice(0, 2)
      .join(' ');
  } else if (!titles.length && input.q) {
    body.q_keywords = String(input.q).trim().slice(0, 80);
  }

  if (!titles.length && !locations.length && input.q) {
    body.q_keywords = String(input.q).trim().slice(0, 80);
    body.person_titles = [input.q.replace(/\bin\s+.+$/i, '').trim()]
      .filter(Boolean)
      .slice(0, 1);
  }

  const result = await apolloFetch(
    '/mixed_people/api_search',
    body,
    // Pass resolved key so we don't re-resolve differently
    { apiKey: keyInfo.apiKey }
  );
  if (!result.ok) {
    let error = result.error || `Apollo error ${result.status}`;
    if (result.status === 401) {
      error =
        keyInfo.source === 'tenant'
          ? 'Company Apollo key rejected (401 Invalid API key). Re-save a master key with People API Search in Company Settings → Integrations.'
          : 'Platform Apollo key is invalid (401). Add/update the company Apollo master key in Company Settings → Integrations.';
    } else if (result.status === 403) {
      error =
        'Apollo 403 — key needs master access to People API Search (mixed_people/api_search). Create a master key in Apollo → Settings → API.';
    }
    return {
      people: [],
      total: 0,
      error,
      raw: result.data,
      keySource: keyInfo.source,
      httpStatus: result.status,
      requestBody: body,
    };
  }

  const peopleRaw =
    result.data?.people ||
    result.data?.contacts ||
    result.data?.profiles ||
    [];
  const people = (Array.isArray(peopleRaw) ? peopleRaw : []).map(mapPerson);
  const total =
    result.data?.pagination?.total_entries ||
    result.data?.total_entries ||
    result.data?.total ||
    people.length;

  return {
    people,
    total,
    raw: result.data,
    keySource: keyInfo.source,
    httpStatus: result.status,
    requestBody: body,
  };
}

export async function searchCompanies(
  input: CompanySearchInput
): Promise<{
  companies: ApolloCompany[];
  total: number;
  error?: string;
  raw?: any;
}> {
  const heuristic = heuristicParseQuery(input.q || '');
  const keywords = asStringArray(input.keywords).length
    ? asStringArray(input.keywords)
    : heuristic.keywords;
  const locations = asStringArray(input.locations).length
    ? asStringArray(input.locations)
    : heuristic.locations;
  const industries = asStringArray(input.industries);
  const jobTitles = asStringArray(input.jobTitles);
  const employeeRanges = normalizeEmployeeRanges(input.employeeRanges);

  const body: Record<string, unknown> = {
    page: input.page || 1,
    per_page: Math.min(input.per_page || 25, 100),
  };

  // Free-text name / general query
  if (input.q?.trim()) {
    body.q_organization_name = input.q.trim();
  }

  if (keywords.length) {
    body.q_organization_keyword_tags = keywords.slice(0, 10);
  }
  if (locations.length) {
    body.organization_locations = locations;
  }
  if (employeeRanges.length) {
    body.organization_num_employees_ranges = employeeRanges;
  }
  if (jobTitles.length) {
    body.q_organization_job_titles = jobTitles;
  }
  if (input.minJobs && input.minJobs > 0) {
    body['organization_num_jobs_range[min]'] = input.minJobs;
  }

  // Industries often work as keyword tags on Apollo
  if (industries.length) {
    const existing = asStringArray(body.q_organization_keyword_tags);
    body.q_organization_keyword_tags = [
      ...new Set([...existing, ...industries]),
    ].slice(0, 12);
  }

  // If almost empty body, put raw query into keyword tags
  if (
    !body.q_organization_name &&
    !body.q_organization_keyword_tags &&
    input.q
  ) {
    body.q_organization_keyword_tags = [input.q];
  }

  const result = await apolloFetch(
    '/mixed_companies/search',
    body,
    input.auth
  );
  if (!result.ok) {
    return { companies: [], total: 0, error: result.error, raw: result.data };
  }

  const orgs =
    result.data?.organizations ||
    result.data?.companies ||
    result.data?.accounts ||
    [];
  const companies = (Array.isArray(orgs) ? orgs : []).map(mapOrganization);
  const total =
    result.data?.pagination?.total_entries ||
    result.data?.total_entries ||
    result.data?.total ||
    companies.length;

  return { companies, total, raw: result.data };
}

/**
 * Open roles: find companies hiring for titles, then pull real job postings when possible.
 */
export async function searchJobs(
  input: JobSearchInput
): Promise<{ jobs: ApolloJob[]; total: number; error?: string; raw?: any }> {
  const heuristic = heuristicParseQuery(input.q || '');
  const titles = asStringArray(input.titles).length
    ? asStringArray(input.titles)
    : heuristic.titles.length
      ? heuristic.titles
      : input.q
        ? [input.q]
        : [];
  const locations = asStringArray(input.locations).length
    ? asStringArray(input.locations)
    : heuristic.locations;
  const keywords = asStringArray(input.keywords);

  // 1) Companies actively hiring for these titles
  const companyResult = await searchCompanies({
    q: input.q,
    keywords: keywords.length ? keywords : titles,
    locations,
    jobTitles: titles,
    minJobs: 1,
    per_page: Math.min(input.per_page || 15, 25),
    auth: input.auth,
  });

  if (companyResult.error && companyResult.companies.length === 0) {
    return {
      jobs: [],
      total: 0,
      error: companyResult.error,
      raw: companyResult.raw,
    };
  }

  const jobs: ApolloJob[] = [];
  const companies = companyResult.companies.slice(0, 12);

  // 2) Fetch real postings for top companies (parallel, limited)
  const postingFetches = companies.slice(0, 6).map(async (co) => {
    if (!co.id) return [] as ApolloJob[];

    // Prefer dedicated job postings endpoint; fall back gracefully
    let res = await apolloFetch(
      '/organizations/job_postings',
      {
        organization_id: co.id,
        per_page: 5,
        page: 1,
      },
      input.auth
    );

    // Some accounts expose nested path instead
    if (!res.ok) {
      res = await apolloFetch(
        `/organizations/${co.id}/job_postings`,
        {
          per_page: 5,
          page: 1,
        },
        input.auth
      );
    }

    if (!res.ok || !res.data) return [] as ApolloJob[];

    const postings =
      res.data?.organization_job_postings ||
      res.data?.job_postings ||
      res.data?.jobs ||
      res.data?.postings ||
      [];

    if (!Array.isArray(postings) || postings.length === 0) return [] as ApolloJob[];

    return postings.map((j: any) => ({
      id: j.id || `${co.id}-${j.title}`,
      title: j.title || titles[0] || 'Open role',
      company: co.name,
      company_id: co.id,
      location:
        j.location ||
        j.city ||
        [co.city, co.state].filter(Boolean).join(', ') ||
        co.headquarters_location,
      department: j.department || j.function,
      description: j.description || j.snippet || co.description,
      posted_at: j.posted_at || j.created_at || j.date_posted,
      url: j.url || j.apply_url || j.job_url || co.website,
      employees_count: co.employees_count,
      industry: co.industry,
      source: 'apollo_job_posting',
    })) as ApolloJob[];
  });

  const postingResults = await Promise.all(postingFetches);
  for (const list of postingResults) {
    jobs.push(...list);
  }

  // 3) If no postings API data, surface hiring companies as signals (honest labeling)
  if (jobs.length === 0) {
    for (const co of companies) {
      jobs.push({
        id: co.id,
        title: titles[0] || input.q || 'Hiring now',
        company: co.name,
        company_id: co.id,
        location:
          [co.city, co.state].filter(Boolean).join(', ') ||
          co.headquarters_location,
        department: undefined,
        description:
          co.description ||
          `${co.name} appears to be actively hiring` +
            (titles[0] ? ` for roles related to "${titles[0]}"` : '') +
            '.',
        posted_at: undefined,
        url: co.website || co.linkedin_url,
        employees_count: co.employees_count,
        industry: co.industry,
        source: 'apollo_hiring_company',
      });
    }
  }

  // Prefer title matches first
  const qLower = (input.q || '').toLowerCase();
  jobs.sort((a, b) => {
    const aScore = (a.title || '').toLowerCase().includes(qLower) ? 1 : 0;
    const bScore = (b.title || '').toLowerCase().includes(qLower) ? 1 : 0;
    return bScore - aScore;
  });

  return {
    jobs: jobs.slice(0, input.per_page || 25),
    total: jobs.length,
    raw: companyResult.raw,
  };
}

export async function checkApolloHealth(
  auth?: ApolloAuthContext
): Promise<{
  connected: boolean;
  message: string;
  source?: 'tenant' | 'platform' | 'none';
}> {
  const key = await resolveApiKey(auth);
  if (key.length <= 10) {
    return {
      connected: false,
      message:
        'No Apollo key — add one in Settings (shared for your company) or set APOLLO_API_KEY',
      source: 'none',
    };
  }

  // Lightweight people search to verify key + plan
  const result = await apolloFetch(
    '/mixed_people/api_search',
    {
      person_titles: ['software engineer'],
      per_page: 1,
      page: 1,
    },
    { apiKey: key, tenantId: auth?.tenantId }
  );

  let source: 'tenant' | 'platform' = 'platform';
  if (auth?.tenantId) {
    try {
      const { resolveApolloApiKey } = await import(
        '@/lib/db/repositories/tenant-apollo-credentials-repository'
      );
      const r = await resolveApolloApiKey(auth.tenantId);
      if (r?.source) source = r.source;
    } catch {
      /* ignore */
    }
  }

  if (result.ok) {
    return {
      connected: true,
      message:
        source === 'tenant'
          ? 'Apollo connected (company key)'
          : 'Apollo connected (platform key)',
      source,
    };
  }

  return {
    connected: false,
    message: result.error || 'Apollo unreachable',
    source,
  };
}
