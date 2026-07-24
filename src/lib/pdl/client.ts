/**
 * People Data Labs Person Search client.
 * Key can come from PDL direct subscription or AWS Data Exchange entitlement.
 *
 * @serverOnly
 */

const PDL_BASE = 'https://api.peopledatalabs.com/v5';

/** Default list-price estimate per returned person (Search match). Override via env. */
export function pdlCostPerPerson(): number {
  const raw =
    process.env.PDL_COST_PER_PERSON ||
    process.env.PEOPLE_DATA_LABS_COST_PER_PERSON ||
    '0.03';
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : 0.03;
}

export type PdlPerson = {
  id?: string;
  full_name?: string;
  first_name?: string;
  last_name?: string;
  job_title?: string;
  job_company_name?: string;
  work_email?: string;
  personal_emails?: string[];
  mobile_phone?: string;
  phone_numbers?: string[];
  linkedin_url?: string;
  location_name?: string;
  location_locality?: string;
  location_region?: string;
  location_country?: string;
  industry?: string;
  skills?: string[];
  experience?: Array<{
    company?: { name?: string };
    title?: { name?: string };
  }>;
};

export type PdlSearchInput = {
  /** Free-text role / keywords from the brief */
  titles?: string[];
  keywords?: string[];
  /** Person location filters (city, region, country) */
  locations?: string[];
  /** Company name hints */
  companies?: string[];
  /** Industry keywords */
  industries?: string[];
  size?: number;
  scrollToken?: string;
  /** Optional raw SQL WHERE clause fragment (advanced) */
  sqlWhere?: string;
};

export type PdlSearchResult = {
  people: PdlNormalizedPerson[];
  total: number;
  scrollToken?: string;
  creditsUsed?: number;
  estimatedCostUsd: number;
  latencyMs: number;
  error?: string;
  raw?: unknown;
};

export type PdlNormalizedPerson = {
  pdlId?: string;
  name: string;
  firstName?: string;
  lastName?: string;
  title?: string;
  company?: string;
  email?: string;
  phone?: string;
  linkedinUrl?: string;
  city?: string;
  state?: string;
  country?: string;
  location?: string;
  industry?: string;
  skills?: string[];
};

function getApiKey(): string {
  const key =
    process.env.PEOPLE_DATA_LABS_API_KEY ||
    process.env.PDL_API_KEY ||
    process.env.PEOPLEDATALABS_API_KEY ||
    process.env.pdl_api_key ||
    '';
  return key.trim();
}

export function isPdlConfigured(): boolean {
  return getApiKey().length > 10;
}

function escapeSqlLiteral(s: string): string {
  return s.replace(/'/g, "''").trim();
}

/**
 * Build a conservative SQL WHERE from structured filters.
 * PDL SQL: SELECT * FROM person WHERE …
 */
export function buildPersonSearchSql(input: PdlSearchInput): string {
  if (input.sqlWhere?.trim()) {
    const where = input.sqlWhere.trim().replace(/^where\s+/i, '');
    return `SELECT * FROM person WHERE ${where}`;
  }

  const clauses: string[] = [];

  const titles = (input.titles || []).map((t) => t.trim()).filter(Boolean);
  if (titles.length === 1) {
    clauses.push(`job_title LIKE '%${escapeSqlLiteral(titles[0])}%'`);
  } else if (titles.length > 1) {
    const or = titles
      .slice(0, 6)
      .map((t) => `job_title LIKE '%${escapeSqlLiteral(t)}%'`)
      .join(' OR ');
    clauses.push(`(${or})`);
  }

  const locs = (input.locations || []).map((l) => l.trim()).filter(Boolean);
  for (const loc of locs.slice(0, 4)) {
    const lower = loc.toLowerCase();
    // Country-level
    if (
      /^(united states|usa|u\.s\.a\.?|u\.s\.|us)$/i.test(loc) ||
      lower === 'united states'
    ) {
      clauses.push(`location_country = 'united states'`);
      continue;
    }
    // State / region (2-letter or full name)
    if (/^[a-z]{2}$/i.test(loc) || /\b(florida|texas|california|new york|georgia|north carolina)\b/i.test(loc)) {
      clauses.push(`location_region = '${escapeSqlLiteral(loc.toLowerCase())}'`);
      continue;
    }
    // City / metro / county free text
    clauses.push(
      `(location_name LIKE '%${escapeSqlLiteral(loc)}%' OR location_locality LIKE '%${escapeSqlLiteral(loc)}%' OR location_region LIKE '%${escapeSqlLiteral(loc)}%')`
    );
  }

  const companies = (input.companies || []).map((c) => c.trim()).filter(Boolean);
  if (companies.length) {
    const or = companies
      .slice(0, 4)
      .map((c) => `job_company_name LIKE '%${escapeSqlLiteral(c)}%'`)
      .join(' OR ');
    clauses.push(`(${or})`);
  }

  const industries = (input.industries || []).map((i) => i.trim()).filter(Boolean);
  if (industries.length) {
    const or = industries
      .slice(0, 4)
      .map((i) => `industry LIKE '%${escapeSqlLiteral(i)}%'`)
      .join(' OR ');
    clauses.push(`(${or})`);
  }

  const keywords = (input.keywords || []).map((k) => k.trim()).filter(Boolean);
  for (const kw of keywords.slice(0, 3)) {
    // Skills / headline style match
    clauses.push(
      `(job_title LIKE '%${escapeSqlLiteral(kw)}%' OR skills LIKE '%${escapeSqlLiteral(kw)}%')`
    );
  }

  // Prefer people with some contact surface (reduces empty-contact waste)
  clauses.push(
    `(work_email IS NOT NULL OR mobile_phone IS NOT NULL OR linkedin_url IS NOT NULL OR personal_emails IS NOT NULL)`
  );

  if (clauses.length === 0) {
    return `SELECT * FROM person WHERE location_country = 'united states'`;
  }

  return `SELECT * FROM person WHERE ${clauses.join(' AND ')}`;
}

/**
 * Parse a free-text recruiting brief into PDL search filters.
 */
export function parseCandidateBrief(brief: string): {
  titles: string[];
  locations: string[];
  companies: string[];
  industries: string[];
  keywords: string[];
  targetSize?: number;
} {
  const b = (brief || '').trim();
  const titles: string[] = [];
  const locations: string[] = [];
  const companies: string[] = [];
  const industries: string[] = [];
  const keywords: string[] = [];

  // "100 candidates" / "50 people" / "find 25"
  let targetSize: number | undefined;
  const withNoun = b.match(
    /\b(\d{1,3})\s*(?:candidates?|people|persons?|profiles?|talent|leads?)\b/i
  );
  if (withNoun?.[1]) {
    const n = parseInt(withNoun[1], 10);
    if (n >= 1 && n <= 500) targetSize = n;
  } else {
    const findN = b.match(
      /\b(?:find|list|get|need|want|source|pull)\s+(?:me\s+)?(\d{1,3})\b/i
    );
    if (findN?.[1]) {
      const n = parseInt(findN[1], 10);
      if (n >= 1 && n <= 500) targetSize = n;
    }
  }

  // Title patterns: "Finance Implementation Specialists", "software engineers"
  const roleMatch = b.match(
    /\b(?:for|looking for|source|sourcing|find|need|want|hire|hiring)?\s*([A-Za-z][A-Za-z0-9/&\s-]{2,60}?)(?:\s+(?:in|near|around|from|based|who|with|at|,|\.|$))/i
  );
  // Prefer explicit title phrases before "in Location"
  const inSplit = b.split(/\s+\bin\s+/i);
  if (inSplit.length >= 2) {
    const before = inSplit[0]
      .replace(
        /^(?:find|source|sourcing|get|need|want|looking for|hire|hiring|list)\s+(?:me\s+)?(?:\d+\s+)?(?:candidates?|people|persons?)?\s*/i,
        ''
      )
      .replace(/^\d+\s+/, '')
      .trim();
    if (before.length >= 3 && before.length <= 80) {
      titles.push(before.replace(/\s+/g, ' '));
    }
    // Location after "in"
    const after = inSplit
      .slice(1)
      .join(' in ')
      .replace(
        /\s+(?:with|who|that|under|over|and|,|\.|for|looking).*$/i,
        ''
      )
      .trim();
    if (after.length >= 2 && after.length <= 80) {
      locations.push(after);
    }
  } else if (roleMatch?.[1]) {
    const t = roleMatch[1].trim();
    if (t.length >= 3) titles.push(t);
  }

  // Geography fallbacks
  const county = b.match(
    /\b([A-Za-z][A-Za-z0-9\s.'-]{1,40}\s+(?:County|Parish))\b/i
  );
  if (county?.[1] && !locations.some((l) => l.includes(county[1]))) {
    locations.push(county[1].trim());
  }
  const stateFull = b.match(
    /\b(Florida|Texas|California|Georgia|New York|North Carolina|South Carolina|Arizona|Colorado|Illinois|Ohio|Pennsylvania|Virginia|Washington|Massachusetts|Michigan|Minnesota|Tennessee|Missouri|Indiana|Maryland|Wisconsin|Colorado|Oregon|Nevada|Utah|Alabama|Louisiana|Kentucky|Oklahoma|Connecticut|Iowa|Arkansas|Mississippi|Kansas|New Mexico|Nebraska|Idaho|West Virginia|Hawaii|New Hampshire|Maine|Montana|Rhode Island|Delaware|South Dakota|North Dakota|Alaska|Vermont|Wyoming)\b/i
  );
  if (stateFull?.[1] && !locations.some((l) => new RegExp(stateFull[1], 'i').test(l))) {
    locations.push(stateFull[1]);
  }
  if (/\b(united states|usa|u\.s\.a\.?|nationwide)\b/i.test(b) && locations.length === 0) {
    locations.push('United States');
  }

  // Company: "at Acme" / "from Google"
  const atCo = b.match(
    /\b(?:at|from|currently at|working at)\s+([A-Za-z0-9][A-Za-z0-9 .,&'-]{1,50})(?:\s+(?:in|who|with|,|\.|$))/i
  );
  if (atCo?.[1]) companies.push(atCo[1].trim());

  // Industry keywords
  const industryHints = [
    'construction',
    'healthcare',
    'fintech',
    'finance',
    'saas',
    'software',
    'manufacturing',
    'logistics',
    'retail',
    'hospitality',
    'education',
    'government',
    'staffing',
    'insurance',
    'real estate',
  ];
  for (const ind of industryHints) {
    if (new RegExp(`\\b${ind}\\b`, 'i').test(b)) industries.push(ind);
  }

  // Skills after "with"
  const withSkills = b.match(
    /\bwith\s+([A-Za-z0-9][A-Za-z0-9 ,/+#.-]{2,80})(?:\s+(?:in|at|who|looking)|$)/i
  );
  if (withSkills?.[1]) {
    for (const part of withSkills[1].split(/,| and /i)) {
      const p = part.trim();
      if (p.length >= 2 && p.length <= 40) keywords.push(p);
    }
  }

  // If we still have no title, use a cleaned brief as keyword title
  if (titles.length === 0) {
    const cleaned = b
      .replace(/\b\d{1,3}\s*(?:candidates?|people|persons?)?\b/gi, '')
      .replace(/\bin\s+[A-Za-z].*$/i, '')
      .replace(
        /^(?:find|source|sourcing|get|need|want|looking for|hire|hiring)\s+/i,
        ''
      )
      .trim()
      .slice(0, 60);
    if (cleaned.length >= 3) titles.push(cleaned);
  }

  if (locations.length === 0) {
    locations.push('United States');
  }

  return {
    titles: [...new Set(titles)].slice(0, 6),
    locations: [...new Set(locations)].slice(0, 4),
    companies: [...new Set(companies)].slice(0, 4),
    industries: [...new Set(industries)].slice(0, 4),
    keywords: [...new Set(keywords)].slice(0, 6),
    targetSize,
  };
}

function firstEmail(raw: PdlPerson): string | undefined {
  const work = (raw.work_email || '').trim();
  if (work && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(work)) return work.toLowerCase();
  const personal = Array.isArray(raw.personal_emails) ? raw.personal_emails : [];
  for (const e of personal) {
    const v = String(e || '').trim().toLowerCase();
    if (v && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return v;
  }
  return undefined;
}

function firstPhone(raw: PdlPerson): string | undefined {
  const mobile = (raw.mobile_phone || '').trim();
  if (mobile && (mobile.match(/\d/g) || []).length >= 7) return mobile;
  const phones = Array.isArray(raw.phone_numbers) ? raw.phone_numbers : [];
  for (const p of phones) {
    const v = String(p || '').trim();
    if (v && (v.match(/\d/g) || []).length >= 7) return v;
  }
  return undefined;
}

export function normalizePdlPerson(raw: PdlPerson): PdlNormalizedPerson | null {
  const first = (raw.first_name || '').trim();
  const last = (raw.last_name || '').trim();
  const full =
    (raw.full_name || '').trim() ||
    [first, last].filter(Boolean).join(' ').trim();
  if (!full) return null;

  const city = (raw.location_locality || '').trim() || undefined;
  const state = (raw.location_region || '').trim() || undefined;
  const country = (raw.location_country || '').trim() || undefined;
  const location =
    (raw.location_name || '').trim() ||
    [city, state].filter(Boolean).join(', ') ||
    undefined;

  let linkedin = (raw.linkedin_url || '').trim() || undefined;
  if (linkedin && !/^https?:\/\//i.test(linkedin)) {
    linkedin = `https://${linkedin.replace(/^\/+/, '')}`;
  }

  return {
    pdlId: raw.id,
    name: full,
    firstName: first || undefined,
    lastName: last || undefined,
    title: (raw.job_title || '').trim() || undefined,
    company: (raw.job_company_name || '').trim() || undefined,
    email: firstEmail(raw),
    phone: firstPhone(raw),
    linkedinUrl: linkedin,
    city,
    state,
    country,
    location,
    industry: (raw.industry || '').trim() || undefined,
    skills: Array.isArray(raw.skills)
      ? raw.skills.map(String).filter(Boolean).slice(0, 20)
      : undefined,
  };
}

/**
 * Person Search — one page (size 1–100). Uses scroll_token for next batches.
 */
export async function searchPeople(
  input: PdlSearchInput
): Promise<PdlSearchResult> {
  const started = Date.now();
  if (!isPdlConfigured()) {
    return {
      people: [],
      total: 0,
      estimatedCostUsd: 0,
      latencyMs: Date.now() - started,
      error:
        'People Data Labs is not configured. Set PEOPLE_DATA_LABS_API_KEY (or PDL_API_KEY) from your PDL account or AWS Data Exchange subscription.',
    };
  }

  const size = Math.min(Math.max(input.size || 25, 1), 100);
  const sql = buildPersonSearchSql(input);
  const body: Record<string, unknown> = {
    sql,
    size,
    dataset: 'all',
  };
  if (input.scrollToken) {
    body.scroll_token = input.scrollToken;
  }

  try {
    const res = await fetch(`${PDL_BASE}/person/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': getApiKey(),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(45_000),
    });

    const latencyMs = Date.now() - started;
    const data = (await res.json().catch(() => ({}))) as {
      status?: number;
      error?: { message?: string; type?: string };
      data?: PdlPerson[];
      total?: number;
      scroll_token?: string;
      rateLimit?: { remaining?: number };
    };

    if (!res.ok) {
      const msg =
        data?.error?.message ||
        (typeof data?.error === 'string' ? data.error : null) ||
        `PDL person search failed (${res.status})`;
      return {
        people: [],
        total: 0,
        estimatedCostUsd: 0,
        latencyMs,
        error: String(msg),
        raw: data,
      };
    }

    const rows = Array.isArray(data.data) ? data.data : [];
    const people = rows
      .map(normalizePdlPerson)
      .filter((p): p is PdlNormalizedPerson => !!p);

    const creditsUsed = people.length;
    const estimatedCostUsd = creditsUsed * pdlCostPerPerson();

    return {
      people,
      total: typeof data.total === 'number' ? data.total : people.length,
      scrollToken: data.scroll_token || undefined,
      creditsUsed,
      estimatedCostUsd,
      latencyMs,
      raw: process.env.NODE_ENV === 'development' ? data : undefined,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      people: [],
      total: 0,
      estimatedCostUsd: 0,
      latencyMs: Date.now() - started,
      error: message,
    };
  }
}
