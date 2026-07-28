/**
 * Source candidates for a job posting (careers URL, job id, or free-text brief).
 * Priority: Apollo → PDL → LLM (Nova grounding + AgentCore extract + Haiku).
 * Results are person-shaped (name/title/company), never raw job-URL search hits.
 *
 * @serverOnly
 */

import { getJobById } from '@/lib/db/repositories/job-repository';
import { getTenantBySubdomain } from '@/lib/db/repositories/tenant-repository';
import {
  enrichPeopleByIds,
  resolveApolloConfigured,
  searchPeople as apolloSearchPeople,
  type ApolloPerson,
} from '@/lib/apollo/client';
import {
  isPdlConfigured,
  searchPeople as pdlSearchPeople,
  type PdlNormalizedPerson,
} from '@/lib/pdl/client';
import {
  logApolloUsage,
  logPdlUsage,
  logCombinedUsageTurn,
} from '@/lib/aws/athena-bedrock';
import {
  llmSourceCandidates,
  looksLikePersonName,
} from '@/lib/sourcing/llm-candidate-source';
import {
  type CostBreakdown,
  buildApolloSearchSlice,
  formatBreakdownLine,
  sumBreakdown,
} from '@/lib/usage/cost-breakdown';
import { filterAndRankByQuality } from '@/lib/sourcing/profile-quality';
import {
  buildApolloSearchPlan,
  formatPlanForNotes,
  isValidPersonLocation,
  planFromUserEdit,
  type ApolloSearchPlan,
} from '@/lib/sourcing/apollo-search-plan';
import { rerankCandidatesForJob } from '@/lib/sourcing/rerank-candidates';

export { isValidPersonLocation };

export type SourcedCandidate = {
  id: string;
  name: string;
  title?: string;
  company?: string;
  location?: string;
  email?: string;
  phone?: string;
  linkedinUrl?: string;
  /** apollo | pdl | structured DBs; llm | web = discovery (verify before outreach) */
  source: 'apollo' | 'pdl' | 'llm' | 'web';
  snippet?: string;
  url?: string;
  qualityScore?: number;
  qualityFlags?: string[];
  /** LLM / heuristic fit vs JD (0–100) */
  fitScore?: number;
  /** One-line recruiter explanation */
  fitReason?: string;
  mustHaveHit?: boolean;
  geoOk?: boolean;
};

export type JobContext = {
  jobId?: string;
  tenantSlug?: string;
  title: string;
  location?: string;
  companyName?: string;
  description?: string;
  keywords: string[];
  source: 'careers_url' | 'job_id' | 'brief';
};

export type SourceCandidatesResult = {
  ok: boolean;
  job?: JobContext;
  candidates: SourcedCandidate[];
  estimatedCostUsd: number;
  costs: Array<{ engine: string; estimatedCostUsd: number; count: number }>;
  /** Side-by-side LLM tokens/$ and Apollo results/credits */
  usageBreakdown?: CostBreakdown;
  usageLine?: string;
  /** What the LLM told Apollo to search */
  apolloPlan?: ApolloSearchPlan;
  apolloPlanSource?: 'llm' | 'heuristic' | 'user';
  /** tenant = company BYOK, platform = env key, none = missing */
  apolloKeySource?: 'tenant' | 'platform' | 'explicit' | 'none';
  /** Last Apollo HTTP status when search failed or ran */
  apolloHttpStatus?: number;
  /** Filters sent on last Apollo call (no secrets) */
  apolloRequest?: Record<string, unknown>;
  notes: string[];
  error?: string;
};

/** Pull a job-title-like phrase from a pasted JD / brief (not soft-skill paragraphs). */
export function extractTitleFromBrief(input: string): string {
  const text = (input || '').replace(/\s+/g, ' ').trim();
  if (!text) return 'Open role';

  // Explicit labeled title
  const labeled = text.match(
    /(?:job\s*title|title|position|role)\s*[:\-–—]\s*([^\n.|]{4,80})/i
  );
  if (labeled?.[1]) {
    const t = cleanTitleCandidate(labeled[1]);
    if (t) return t;
  }

  // "Director of Operations" style — stop before "to lead / responsible / with"
  const roleOf = text.match(
    /\b((?:Senior|Jr\.?|Junior|Lead|Staff|Principal|Director|VP|Vice President|Head|Manager)?\s*(?:of\s+)?(?:Operations|Manufacturing|Engineering|Finance|Sales|Marketing|Product|Human Resources|HR|Quality|Supply Chain|Plant|Production)(?:\s+(?:Manager|Director|Lead|Engineer|Specialist))?)\b/i
  );
  if (roleOf?.[1]) {
    const t = cleanTitleCandidate(roleOf[1]);
    if (t) return t;
  }

  const patterns = [
    /\b((?:Senior|Jr\.?|Junior|Lead|Staff|Principal|Director|VP|Vice President|Head|Manager|Specialist|Engineer|Analyst|Consultant|Coordinator|Supervisor|Controller)\s+[A-Za-z0-9 /&-]{2,40}?)\s*(?=\s+(?:to|who|with|for|in\s+a|responsible|looking|seeking|,|\.|$))/i,
    /\b([A-Za-z][A-Za-z0-9 /&-]{2,40}\s+(?:Specialist|Manager|Director|Engineer|Analyst|Consultant|Coordinator|Supervisor|Controller|Lead))\b/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m?.[1]) {
      const t = cleanTitleCandidate(m[1]);
      if (t) return t;
    }
  }

  // First short line if it looks like a title
  const firstLine = (input.split(/\n/)[0] || '').trim();
  const cleanedFirst = cleanTitleCandidate(firstLine);
  if (
    cleanedFirst &&
    cleanedFirst.length >= 4 &&
    cleanedFirst.length <= 60
  ) {
    return cleanedFirst;
  }

  return 'Open role';
}

function cleanTitleCandidate(raw: string): string | null {
  let t = (raw || '').trim().replace(/\s+/g, ' ');
  // Cut trailing JD glue
  t = t
    .replace(
      /\s+(to lead|to oversee|to manage|who will|responsible for|with multiple|in a highly|looking for).*$/i,
      ''
    )
    .trim();
  if (t.length < 3 || t.length > 70) return null;
  if (
    /^(demonstrated|ability|high level|integrity|commitment|thrive|fast-paced)/i.test(
      t
    )
  ) {
    return null;
  }
  return t.slice(0, 70);
}

/**
 * Extract a real geography from a pasted JD.
 * Never use bare "in …" — that matches the "in" inside "industries" → "dustries where quality".
 */
export function extractLocationFromBrief(input: string): string | undefined {
  const text = input || '';

  // Explicit Location: / Job location: (anywhere in text)
  const labeled = text.match(
    /\b(?:job\s*location|work\s*location|location)\s*[:\-–—]\s*([A-Za-z0-9 .,'-]{2,50})/i
  );
  if (labeled?.[1]) {
    const cand = labeled[1]
      .trim()
      .replace(/[.;].*$/, '')
      .replace(/\s+/g, ' ')
      .slice(0, 50);
    if (isValidPersonLocation(cand)) return cand;
  }

  // "based in Florida" / "located in Miami, FL"
  const based = text.match(
    /\b(?:based|located|office)\s+in\s+([A-Za-z .'-]{2,40}(?:,\s*[A-Z]{2})?)\b/i
  );
  if (based?.[1] && isValidPersonLocation(based[1].trim())) {
    return based[1].trim();
  }

  // Known states / major FL cities (and common remotes)
  const known = text.match(
    /\b(Remote|Florida|Texas|California|New York|Georgia|North Carolina|South Carolina|Miami(?:[ -]?Dade)?|Tampa(?: Bay)?|Orlando|Jacksonville|Fort Lauderdale|West Palm Beach|Palm Beach|Boca Raton|Atlanta|Dallas|Houston|Austin|Chicago|Boston|Seattle|Denver|Phoenix)\b/i
  );
  if (known?.[1]) return known[1];

  return undefined;
}

/** Parse Trio careers URL: /careers/{slug}/{jobId} */
export function parseCareersJobUrl(input: string): {
  tenantSlug: string;
  jobId: string;
} | null {
  const t = (input || '').trim();
  if (!t) return null;
  try {
    const u = t.includes('://')
      ? new URL(t)
      : new URL(t, 'https://turnkey-optimization.vercel.app');
    const m = u.pathname.match(
      /\/careers\/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_-]+)/i
    );
    if (m?.[1] && m?.[2]) {
      return { tenantSlug: m[1], jobId: m[2] };
    }
  } catch {
    /* ignore */
  }
  // Loose path without host
  const m2 = t.match(/careers\/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_-]+)/i);
  if (m2?.[1] && m2?.[2]) {
    return { tenantSlug: m2[1], jobId: m2[2] };
  }
  return null;
}

function extractKeywordsFromDescription(desc: string, title: string): string[] {
  const text = `${title}\n${desc || ''}`.toLowerCase();
  const stop = new Set([
    'and',
    'the',
    'for',
    'with',
    'you',
    'will',
    'our',
    'are',
    'this',
    'that',
    'from',
    'have',
    'your',
    'role',
    'job',
    'work',
    'team',
    'years',
    'experience',
    'ability',
    'skills',
    'including',
    'required',
    'preferred',
    'about',
    'what',
    'who',
    'we',
    'as',
    'an',
    'or',
    'to',
    'in',
    'of',
    'a',
    'is',
    'on',
    'be',
  ]);
  const words = (text.match(/[a-z][a-z0-9+.#-]{2,}/g) || []).filter(
    (w) => !stop.has(w) && w.length > 2
  );
  const freq = new Map<string, number>();
  for (const w of words) freq.set(w, (freq.get(w) || 0) + 1);
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([w]) => w)
    .filter(
      (w) =>
        !['description', 'responsibilities', 'requirements', 'benefits'].includes(
          w
        )
    )
    .slice(0, 12);
}

export async function resolveJobContext(params: {
  input: string;
  tenantId?: string | null;
  jobId?: string | null;
}): Promise<JobContext | null> {
  const input = (params.input || '').trim();
  const explicitJobId = (params.jobId || '').trim();

  // 1) Careers URL
  const parsed = parseCareersJobUrl(input);
  if (parsed) {
    const tenant = await getTenantBySubdomain(parsed.tenantSlug);
    const tenantId = tenant?.id || params.tenantId;
    if (tenantId) {
      const job = await getJobById(tenantId, parsed.jobId);
      if (job) {
        const title = job.title || 'Open role';
        return {
          jobId: job.id,
          tenantSlug: parsed.tenantSlug,
          title,
          location: job.location || undefined,
          companyName: job.companyName || (job as any).company_name,
          description: job.description || undefined,
          keywords: extractKeywordsFromDescription(
            job.description || '',
            title
          ),
          source: 'careers_url',
        };
      }
    }
  }

  // 2) Explicit job id in session tenant
  const jobId = explicitJobId || (input.match(/^[a-zA-Z0-9_-]{8,}$/) ? input : '');
  if (jobId && params.tenantId) {
    const job = await getJobById(params.tenantId, jobId);
    if (job) {
      const title = job.title || 'Open role';
      return {
        jobId: job.id,
        title,
        location: job.location || undefined,
        companyName: job.companyName || (job as any).company_name,
        description: job.description || undefined,
        keywords: extractKeywordsFromDescription(job.description || '', title),
        source: 'job_id',
      };
    }
  }

  // 3) Free-text brief (not a URL) — extract a real job title, not soft-skill prose
  if (input && !input.includes('http') && !input.includes('/careers/')) {
    const titleGuess = extractTitleFromBrief(input);
    const locGuess = extractLocationFromBrief(input);
    return {
      title: titleGuess,
      location: locGuess,
      description: input,
      keywords: extractKeywordsFromDescription(input, titleGuess),
      source: 'brief',
    };
  }

  // 4) URL that we couldn't resolve — strip URL and use surrounding text as brief
  if (input.includes('http')) {
    const withoutUrl = input
      .replace(/https?:\/\/\S+/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (withoutUrl.length > 8) {
      return {
        title: withoutUrl.slice(0, 100),
        description: withoutUrl,
        keywords: extractKeywordsFromDescription(withoutUrl, withoutUrl),
        source: 'brief',
      };
    }
  }

  return null;
}

function mapApollo(p: ApolloPerson, i: number): SourcedCandidate {
  return {
    id: p.id || `apollo-${i}`,
    name:
      p.name ||
      [p.first_name, p.last_name].filter(Boolean).join(' ') ||
      'Unknown',
    title: p.title,
    company: p.company,
    location: [p.city, p.state, p.country].filter(Boolean).join(', ') || undefined,
    email: p.email,
    phone: p.phone,
    linkedinUrl: p.linkedin_url,
    source: 'apollo',
  };
}

/** Non-US countries we drop when the plan targets a US state / Florida / USA */
const NON_US_COUNTRY_RE =
  /\b(china|india|pakistan|bangladesh|philippines|nigeria|brazil|mexico|canada|uk|united kingdom|germany|france|spain|italy|japan|korea|singapore|australia|vietnam|indonesia|taiwan|hong kong|uae|saudi|russia|ukraine|poland|romania|argentina|colombia|chile|peru|egypt|south africa|israel|turkey|thailand|malaysia)\b/i;

const US_STATE_HINT_RE =
  /\b(florida|texas|california|georgia|new york|north carolina|south carolina|arizona|ohio|pennsylvania|illinois|michigan|virginia|massachusetts|washington|colorado|oregon|nevada|tennessee|indiana|missouri|maryland|wisconsin|minnesota|alabama|louisiana|kentucky|oklahoma|connecticut|utah|iowa|arkansas|mississippi|kansas|new mexico|nebraska|idaho|west virginia|hawaii|new hampshire|maine|montana|rhode island|delaware|south dakota|north dakota|alaska|vermont|wyoming|united states|usa|u\.s\.a?\.?)\b/i;

/** Two-letter US state codes (uppercase) → full name for matching */
const US_STATE_CODE_TO_NAME: Record<string, string> = {
  AL: 'alabama',
  AK: 'alaska',
  AZ: 'arizona',
  AR: 'arkansas',
  CA: 'california',
  CO: 'colorado',
  CT: 'connecticut',
  DE: 'delaware',
  FL: 'florida',
  GA: 'georgia',
  HI: 'hawaii',
  ID: 'idaho',
  IL: 'illinois',
  IN: 'indiana',
  IA: 'iowa',
  KS: 'kansas',
  KY: 'kentucky',
  LA: 'louisiana',
  ME: 'maine',
  MD: 'maryland',
  MA: 'massachusetts',
  MI: 'michigan',
  MN: 'minnesota',
  MS: 'mississippi',
  MO: 'missouri',
  MT: 'montana',
  NE: 'nebraska',
  NV: 'nevada',
  NH: 'new hampshire',
  NJ: 'new jersey',
  NM: 'new mexico',
  NY: 'new york',
  NC: 'north carolina',
  ND: 'north dakota',
  OH: 'ohio',
  OK: 'oklahoma',
  OR: 'oregon',
  PA: 'pennsylvania',
  RI: 'rhode island',
  SC: 'south carolina',
  SD: 'south dakota',
  TN: 'tennessee',
  TX: 'texas',
  UT: 'utah',
  VT: 'vermont',
  VA: 'virginia',
  WA: 'washington',
  WV: 'west virginia',
  WI: 'wisconsin',
  WY: 'wyoming',
  DC: 'district of columbia',
};

const STATE_NAME_TO_CODE = Object.fromEntries(
  Object.entries(US_STATE_CODE_TO_NAME).map(([code, name]) => [name, code])
);

/** Pull a specific US state from plan targets (e.g. "Florida" → FL). */
export function extractTargetUsState(targets: string[]): string | null {
  for (const t of targets) {
    const s = (t || '').trim();
    if (!s) continue;
    // "FL" / "FL, United States"
    const codeM = s.match(/\b([A-Z]{2})\b/);
    if (codeM && US_STATE_CODE_TO_NAME[codeM[1]]) return codeM[1];
    const lower = s.toLowerCase();
    for (const [name, code] of Object.entries(STATE_NAME_TO_CODE)) {
      if (new RegExp(`\\b${name.replace(/\s+/g, '\\s+')}\\b`, 'i').test(lower)) {
        return code;
      }
    }
  }
  return null;
}

function personHasUsState(loc: string, stateCode: string): boolean {
  const name = US_STATE_CODE_TO_NAME[stateCode];
  if (!name) return false;
  const lower = loc.toLowerCase();
  if (new RegExp(`\\b${name.replace(/\s+/g, '\\s+')}\\b`, 'i').test(lower)) {
    return true;
  }
  // "Miami, FL" / "Tampa FL" / "FL, United States"
  if (new RegExp(`(?:^|[,\\s])${stateCode}(?:$|[,\\s])`, 'i').test(loc)) {
    return true;
  }
  return false;
}

/** True if location clearly names a *different* US state than target. */
function personInOtherUsState(loc: string, targetCode: string): boolean {
  const lower = loc.toLowerCase();
  for (const [code, name] of Object.entries(US_STATE_CODE_TO_NAME)) {
    if (code === targetCode) continue;
    if (new RegExp(`\\b${name.replace(/\s+/g, '\\s+')}\\b`, 'i').test(lower)) {
      return true;
    }
    if (new RegExp(`(?:^|[,\\s])${code}(?:$|[,\\s])`, 'i').test(loc)) {
      return true;
    }
  }
  return false;
}

/**
 * When recruiter asks for Florida (or another state), hard-require that state.
 * Drop Indiana/California/China when target is Florida.
 * Unknown location kept (Apollo may have matched person_locations without city).
 */
export function personMatchesGeoTarget(
  personLocation: string | undefined,
  targets: string[]
): boolean {
  if (!targets.length) return true;
  const loc = (personLocation || '').trim();
  if (!loc) return true; // unknown — keep

  // Hard drop non-US when any US target
  const targetUs = targets.some((t) => US_STATE_HINT_RE.test(t));
  if (targetUs && NON_US_COUNTRY_RE.test(loc)) {
    if (!targets.some((t) => new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(loc))) {
      return false;
    }
  }

  const targetState = extractTargetUsState(targets);
  if (targetState) {
    if (NON_US_COUNTRY_RE.test(loc)) return false;
    // Explicit match for target state
    if (personHasUsState(loc, targetState)) return true;
    // Other US state named → hard drop (no more "keep CA when Florida")
    if (personInOtherUsState(loc, targetState)) return false;
    // City-only / vague US without another state — keep (soft)
    if (/\bunited states\b|\busa\b|\bu\.s\./i.test(loc)) return true;
    return true;
  }

  return true;
}

/** Expand "Florida" into Apollo-friendly person_locations variants */
export function expandApolloLocations(locs: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (s: string) => {
    const t = s.trim();
    if (!t) return;
    const k = t.toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    out.push(t);
  };
  for (const raw of locs) {
    const s = (raw || '').trim();
    if (!s) continue;
    add(s);
    if (/^florida$/i.test(s) || /^fl$/i.test(s)) {
      add('Florida');
      add('Florida, United States');
      add('FL, United States');
      // Major FL markets help Apollo person_locations recall without leaving the state
      add('Miami, Florida');
      add('Tampa, Florida');
      add('Orlando, Florida');
    } else if (/^united states$/i.test(s) || /^usa$/i.test(s)) {
      add('United States');
    } else if (/^([A-Za-z .'-]+),\s*([A-Z]{2})$/.test(s)) {
      add(s);
      // also "City, State, United States"
      add(`${s}, United States`);
    }
  }
  return out.slice(0, 6);
}

function mapPdl(p: PdlNormalizedPerson, i: number): SourcedCandidate {
  return {
    id: p.pdlId || `pdl-${i}`,
    name: p.name || 'Unknown',
    title: p.title,
    company: p.company,
    location: p.location,
    email: p.email,
    phone: p.phone,
    linkedinUrl: p.linkedinUrl,
    source: 'pdl',
  };
}

/**
 * Find people who could fill the role — not web pages about the job URL.
 */
export async function sourceCandidatesForJob(params: {
  input: string;
  tenantId?: string | null;
  userId?: string | null;
  jobId?: string | null;
  limit?: number;
  /**
   * Optional location override for this search only.
   * - undefined: use job location when available
   * - "": no location filter (worldwide)
   * - "Miami, FL": person_locations filter
   */
  location?: string | null;
  /** Skip LLM path when Apollo already returned enough quality people */
  preferApolloOnlyWhenEnough?: boolean;
  /**
   * User-edited Apollo plan — skip LLM replan and search with these filters.
   * Used for "edit plan → search again" in Fill job UI.
   */
  apolloPlanOverride?: Partial<ApolloSearchPlan> | null;
}): Promise<SourceCandidatesResult> {
  const notes: string[] = [];
  const costs: SourceCandidatesResult['costs'] = [];
  let estimatedCostUsd = 0;
  let apolloSlice: ReturnType<typeof buildApolloSearchSlice> | null = null;
  let llmInputTokens = 0;
  let llmOutputTokens = 0;
  let llmUsd = 0;
  let llmModelId: string | undefined;
  const started = Date.now();
  const limit = Math.min(Math.max(params.limit || 15, 5), 30);

  const job = await resolveJobContext({
    input: params.input,
    tenantId: params.tenantId,
    jobId: params.jobId,
  });

  if (!job) {
    return {
      ok: false,
      candidates: [],
      estimatedCostUsd: 0,
      costs: [],
      notes: [
        'Could not resolve a job. Paste a Trio careers job URL (/careers/{tenant}/{jobId}), a job id, or a role brief (title + location + skills).',
      ],
      error: 'Could not resolve job from input',
    };
  }

  // Location choice: explicit override > job location > none
  // Reject JD prose mistaken as places (e.g. "dustries where quality")
  let searchLocation: string | undefined;
  if (params.location === '') {
    searchLocation = undefined;
    notes.push('Location filter: off (worldwide)');
  } else if (params.location != null && String(params.location).trim()) {
    const raw = String(params.location).trim();
    if (isValidPersonLocation(raw)) {
      searchLocation = raw;
      notes.push(`Location filter: ${searchLocation}`);
    } else {
      notes.push(
        `Ignored invalid location "${raw.slice(0, 40)}" — not a real place`
      );
    }
  } else if (job.location && isValidPersonLocation(job.location)) {
    searchLocation = job.location;
    notes.push(`Location filter: ${searchLocation} (from job)`);
  } else if (job.location) {
    notes.push(
      `Ignored bogus job location "${job.location.slice(0, 40)}" (JD prose, not a place)`
    );
  } else {
    notes.push('Location filter: none');
  }

  notes.push(
    `Sourcing for: ${job.title}` +
      (searchLocation ? ` · ${searchLocation}` : '') +
      (job.companyName ? ` @ ${job.companyName}` : '')
  );

  const candidates: SourcedCandidate[] = [];
  const seen = new Set<string>();
  let droppedLowQuality = 0;

  const add = (c: SourcedCandidate) => {
    if (
      (c.source === 'web' || c.source === 'llm') &&
      !looksLikePersonName(c.name)
    ) {
      droppedLowQuality++;
      return;
    }
    // Prefer stable unique keys — Apollo search often lacks email/LinkedIn.
    // Include id so 15 thin rows are not all collapsed to "unknown||".
    const key = (
      c.id ||
      c.linkedinUrl ||
      c.email ||
      `${c.name}|${c.title || ''}|${c.company || ''}`
    )
      .toLowerCase()
      .trim();
    if (!key || seen.has(key)) return;
    seen.add(key);
    candidates.push(c);
  };

  // --- 0) Apollo plan: user edit OR LLM from JD ---
  let plan: ApolloSearchPlan;
  let planSource: 'llm' | 'heuristic' | 'user' = 'heuristic';
  let planLlmError: string | undefined;

  if (params.apolloPlanOverride && typeof params.apolloPlanOverride === 'object') {
    plan = planFromUserEdit(params.apolloPlanOverride, {
      titles: [job.title].filter(Boolean),
      personLocations: searchLocation ? [searchLocation] : [],
      mustHaveKeywords: [],
      keywords: [],
      seniorities: [],
    });
    planSource = 'user';
  } else {
    const planResult = await buildApolloSearchPlan({
      job,
      rawInput: params.input,
      locationOverride:
        params.location === undefined
          ? undefined
          : params.location === ''
            ? ''
            : params.location,
      tenantId: params.tenantId,
      userId: params.userId,
    });
    // Small LLM cost for planning (Haiku logged separately in completeJson)
    llmUsd += 0.003;
    llmInputTokens += 800;
    llmOutputTokens += 200;
    llmModelId = llmModelId || 'apollo-search-plan';
    plan = planResult.plan;
    planSource = planResult.source;
    planLlmError = planResult.error;
  }

  // User location still wins over plan if explicitly set above
  // (skip when user-edited plan already set locations and no location override)
  if (params.location === '') {
    plan = { ...plan, personLocations: [] };
  } else if (searchLocation && planSource !== 'user') {
    plan = { ...plan, personLocations: [searchLocation] };
  } else if (planSource === 'user') {
    // Keep user locations; still drop invalid
    plan = {
      ...plan,
      personLocations: (plan.personLocations || []).filter(isValidPersonLocation),
    };
  } else {
    plan = {
      ...plan,
      personLocations: plan.personLocations.filter(isValidPersonLocation),
    };
  }

  notes.push(formatPlanForNotes(plan, planSource));
  if (planLlmError && planSource === 'heuristic') {
    notes.push(`Plan LLM fallback: ${planLlmError}`);
  }

  const titles = plan.titles.length ? plan.titles : [job.title].filter(Boolean);
  const locations = expandApolloLocations(
    plan.personLocations.length
      ? plan.personLocations
      : searchLocation
        ? [searchLocation]
        : []
  );
  // Must-have hard skills (CNC, NetSuite…) — first-pass precision
  const mustHaveKeywords = (plan.mustHaveKeywords || [])
    .map((k) => k.trim())
    .filter((k) => k.length >= 2 && k.length <= 32)
    .slice(0, 2);
  const optionalKeywords = (plan.keywords || [])
    .map((k) => k.trim())
    .filter((k) => k.length >= 2 && k.length <= 32)
    .filter(
      (k) => !mustHaveKeywords.some((m) => m.toLowerCase() === k.toLowerCase())
    )
    .slice(0, 2);

  if (mustHaveKeywords.length) {
    notes.push(
      `Must-have experience keywords (Apollo q_keywords, not title): ${mustHaveKeywords.join(', ')}`
    );
  }

  // --- 1) Apollo: progressive passes (search = 0 credits each) ---
  // Precision first (title+loc+must-have CNC), then broaden if too few hits.
  const apolloAuth = params.tenantId
    ? { tenantId: params.tenantId }
    : undefined;

  type ApolloPass = {
    label: string;
    titles: string[];
    locations: string[];
    keywords?: string[];
    seniorities?: string[];
  };

  const apolloPasses: ApolloPass[] = [
    // 1) Precision: titles + location + must-have (e.g. CNC)
    ...(mustHaveKeywords.length
      ? [
          {
            label: 'titles+location+mustHave',
            titles: titles.slice(0, 4),
            locations,
            keywords: mustHaveKeywords.slice(0, 1),
          } satisfies ApolloPass,
        ]
      : [
          {
            label: 'titles+location',
            titles: titles.slice(0, 5),
            locations,
          } satisfies ApolloPass,
        ]),
    // 2) Same must-have with alt titles
    ...(mustHaveKeywords.length && titles.length > 1
      ? [
          {
            label: 'alt-titles+location+mustHave',
            titles: titles.slice(0, 5),
            locations,
            keywords: mustHaveKeywords.slice(0, 1),
          } satisfies ApolloPass,
        ]
      : []),
    // 3) Drop must-have only if still thin (recall) — KEEP state locations
    {
      label: 'titles+location-noMust',
      titles: titles.slice(0, 4),
      locations,
    },
    ...(optionalKeywords.length
      ? [
          {
            label: 'titles+location+optionalKw',
            titles: titles.slice(0, 3),
            locations,
            keywords: optionalKeywords.slice(0, 1),
          } satisfies ApolloPass,
        ]
      : []),
    // 4) Only broaden to whole US when plan has no specific state (Florida etc.)
    //    Expanding Florida → US is what flooded results with IN / CA.
    ...(() => {
      const specificState = extractTargetUsState(locations);
      const alreadyUs = locations.some((l) =>
        /united states|usa|u\.s\./i.test(l)
      );
      if (specificState || alreadyUs || !locations.length) return [];
      return [
        ...(mustHaveKeywords.length
          ? [
              {
                label: 'titles+US+mustHave',
                titles: titles.slice(0, 3),
                locations: ['United States'],
                keywords: mustHaveKeywords.slice(0, 1),
              } satisfies ApolloPass,
            ]
          : []),
        {
          label: 'titles+US',
          titles: titles.slice(0, 3),
          locations: ['United States'],
        } satisfies ApolloPass,
      ];
    })(),
  ];
  // seniorities reserved in plan for notes/UI; not forced on search

  let apolloKeySource: SourceCandidatesResult['apolloKeySource'];
  let apolloHttpStatus: number | undefined;
  let apolloRequest: Record<string, unknown> | undefined;
  let apolloAuthError: string | undefined;

  try {
    if (await resolveApolloConfigured(apolloAuth)) {
      let passIdx = 0;
      let lastApolloError: string | undefined;

      for (const pass of apolloPasses) {
        if (candidates.length >= Math.min(8, limit)) break;
        if (!pass.titles.length) continue;

        const apolloRes = await apolloSearchPeople({
          // Prefer structured filters; avoid stuffing long JD text into q_keywords
          q: pass.titles[0],
          titles: pass.titles,
          // Always pass locations array (even empty) so client does not invent locations
          locations: pass.locations || [],
          keywords: pass.keywords,
          seniorities: pass.seniorities,
          per_page: limit,
          page: 1,
          auth: apolloAuth,
        });

        if (apolloRes.keySource) apolloKeySource = apolloRes.keySource;
        if (apolloRes.httpStatus) apolloHttpStatus = apolloRes.httpStatus;
        if (apolloRes.requestBody) apolloRequest = apolloRes.requestBody;

        if (apolloRes.error && !apolloRes.people.length) {
          lastApolloError = apolloRes.error;
          // Auth failures won't improve on later passes — stop early
          if (
            apolloRes.httpStatus === 401 ||
            apolloRes.httpStatus === 403
          ) {
            apolloAuthError = apolloRes.error;
            notes.unshift(`Apollo AUTH: ${apolloRes.error}`);
            notes.push(
              `Key source: ${apolloRes.keySource || 'unknown'} · HTTP ${apolloRes.httpStatus}`
            );
            break;
          }
          notes.push(`Apollo ${pass.label}: ${apolloRes.error}`);
          continue;
        }

        const before = candidates.length;
        for (let i = 0; i < apolloRes.people.length; i++) {
          add(mapApollo(apolloRes.people[i], passIdx * 100 + i));
        }
        const added = candidates.length - before;
        const slice = buildApolloSearchSlice({
          results: apolloRes.people.length,
          endpoint: 'mixed_people/api_search',
        });
        estimatedCostUsd += slice.estimatedUsd;
        costs.push({
          engine: passIdx === 0 ? 'apollo' : `apollo-${pass.label}`,
          estimatedCostUsd: slice.estimatedUsd,
          count: apolloRes.people.length,
        });
        if (!apolloSlice) {
          apolloSlice = slice;
        } else {
          apolloSlice = {
            results: apolloSlice.results + slice.results,
            credits: apolloSlice.credits,
            estimatedUsd: apolloSlice.estimatedUsd + slice.estimatedUsd,
            endpoint: apolloSlice.endpoint,
            note: apolloSlice.note,
          };
        }
        void logApolloUsage({
          modelId: `apollo-source-for-job-${pass.label}`,
          resultsCount: apolloRes.people.length,
          estimatedCost: slice.estimatedUsd,
          credits: slice.credits,
          endpoint: slice.endpoint,
          queryPreview: `${pass.titles[0]} | ${pass.label}`,
          tenantId: params.tenantId || undefined,
          userId: params.userId || undefined,
          surface: 'fill-job',
        }).catch(() => {});

        notes.push(
          `Apollo ${pass.label}: ${apolloRes.people.length} returned · +${added} new · key=${apolloRes.keySource || '?'}`
        );
        passIdx++;

        // After a good precision pass (esp. with must-have), stop early
        const haveMust =
          pass.keywords?.length &&
          mustHaveKeywords.some((m) =>
            (pass.keywords || []).some(
              (k) => k.toLowerCase() === m.toLowerCase()
            )
          );
        if (
          haveMust &&
          candidates.filter((c) => c.source === 'apollo').length >=
            Math.min(5, limit)
        ) {
          notes.push(
            `Stopping after precision pass (${pass.label}) — enough must-have matches`
          );
          break;
        }
        if (passIdx === 1 && candidates.length >= Math.min(8, limit)) break;
      }

      if (apolloAuthError) {
        // already noted
      } else if (!candidates.length && lastApolloError) {
        notes.push(
          `Apollo had no people after broaden passes: ${lastApolloError}`
        );
      } else if (!candidates.filter((c) => c.source === 'apollo').length) {
        notes.push(
          'Apollo returned 0 people with a working key. Filters may still be too narrow — try a simpler title like "Operations Manager".'
        );
      }

      // Search API privacy-masks last names (Toby Me***). Enrich top hits by id
      // so recruiters see real full names + LinkedIn (uses Apollo credits).
      const apolloHits = candidates.filter(
        (c) =>
          c.source === 'apollo' &&
          c.id &&
          !String(c.id).startsWith('apollo-') &&
          (/\*{2,}/.test(c.name || '') ||
            !c.linkedinUrl ||
            !c.email)
      );
      if (apolloHits.length > 0) {
        try {
          const enrichIds = apolloHits
            .map((c) => c.id!)
            .slice(0, Math.min(10, limit));
          const enriched = await enrichPeopleByIds(enrichIds, apolloAuth, {
            revealPersonalEmails: false,
            revealPhoneNumber: false,
          });
          if (enriched.error) {
            notes.push(
              `Apollo enrich (unlock full names): ${enriched.error}. Search still returns real people with privacy-masked last names until enrich succeeds.`
            );
          } else if (enriched.people.length) {
            const byId = new Map(
              enriched.people
                .filter((p) => p.id)
                .map((p) => [String(p.id), p] as const)
            );
            let unlocked = 0;
            for (let i = 0; i < candidates.length; i++) {
              const c = candidates[i];
              if (c.source !== 'apollo' || !c.id) continue;
              const full = byId.get(String(c.id));
              if (!full) continue;
              const next = mapApollo(full, i);
              // Prefer enriched fields when present
              candidates[i] = {
                ...c,
                name: next.name && !/\*{2,}/.test(next.name) ? next.name : c.name,
                title: next.title || c.title,
                company: next.company || c.company,
                location: next.location || c.location,
                email: next.email || c.email,
                phone: next.phone || c.phone,
                linkedinUrl: next.linkedinUrl || c.linkedinUrl,
              };
              if (!/\*{2,}/.test(candidates[i].name || '')) unlocked++;
            }
            const enrichCredits =
              typeof enriched.creditsConsumed === 'number'
                ? enriched.creditsConsumed
                : enriched.people.length;
            // Credit cost for enrichment (search is free; enrich is not)
            const enrichUsd = enrichCredits * 0.01; // rough; usage dashboard uses credit log
            estimatedCostUsd += enrichUsd;
            costs.push({
              engine: 'apollo-enrich',
              estimatedCostUsd: enrichUsd,
              count: enriched.people.length,
            });
            void logApolloUsage({
              modelId: 'apollo-people-bulk-match',
              resultsCount: enriched.people.length,
              estimatedCost: enrichUsd,
              credits: enrichCredits,
              endpoint: 'people/bulk_match',
              queryPreview: `enrich ${enrichIds.length} search hits`,
              tenantId: params.tenantId || undefined,
              userId: params.userId || undefined,
              surface: 'fill-job-enrich',
            }).catch(() => {});
            notes.push(
              `Apollo enrich: unlocked ${unlocked}/${enrichIds.length} full profile(s) · ~${enrichCredits} credit(s). Search hits are real people; asterisks are Apollo privacy masking until enrich.`
            );
          }
        } catch (err: any) {
          notes.push(
            `Apollo enrich error: ${err?.message || err}. Showing privacy-masked search results (real Apollo records).`
          );
        }
      }
    } else {
      apolloKeySource = 'none';
      apolloAuthError =
        'Apollo not configured — add a company master key in Settings → Integrations (People API Search access).';
      notes.push(apolloAuthError);
    }
  } catch (err: any) {
    notes.push(`Apollo error: ${err?.message || err}`);
  }

  // --- 2) People Data Labs if still thin ---
  if (candidates.length < Math.min(8, limit) && isPdlConfigured()) {
    try {
      const pdlRes = await pdlSearchPeople({
        titles,
        locations,
        keywords: [...mustHaveKeywords, ...optionalKeywords].slice(0, 6),
        size: Math.min(limit, 15),
      });
      if (pdlRes.error && !pdlRes.people.length) {
        notes.push(`PDL: ${pdlRes.error}`);
      } else {
        for (let i = 0; i < pdlRes.people.length; i++) {
          add(mapPdl(pdlRes.people[i], i));
        }
        estimatedCostUsd += pdlRes.estimatedCostUsd || 0;
        costs.push({
          engine: 'pdl',
          estimatedCostUsd: pdlRes.estimatedCostUsd || 0,
          count: pdlRes.people.length,
        });
        void logPdlUsage({
          resultsCount: pdlRes.people.length,
          estimatedCost: pdlRes.estimatedCostUsd || 0,
          queryPreview: job.title,
          latencyMs: pdlRes.latencyMs,
          tenantId: params.tenantId || undefined,
          userId: params.userId || undefined,
        }).catch(() => {});
        notes.push(`PDL: ${pdlRes.people.length} people`);
      }
    } catch (err: any) {
      notes.push(`PDL error: ${err?.message || err}`);
    }
  } else if (candidates.length < 8 && !isPdlConfigured()) {
    notes.push('PDL not configured (optional)');
  }

  // --- 3) Web-grounded discovery ONLY if Apollo/PDL still empty
  // Skip when Apollo auth is broken — fix the key first; web hints mislead.
  const dbCount = candidates.filter(
    (c) => c.source === 'apollo' || c.source === 'pdl'
  ).length;

  if (apolloAuthError) {
    notes.push(
      'Skipped web/LLM people discovery until Apollo key works (Settings → Integrations)'
    );
  } else if (dbCount >= Math.min(5, limit)) {
    notes.push(
      'Using database matches only (Apollo/PDL) — no invented profiles'
    );
  } else if (dbCount === 0) {
    notes.push(
      'No Apollo/PDL people yet — optional web hints (no invented names; LinkedIn links are search-only)'
    );
    try {
      const jobForLlm = {
        ...job,
        title:
          job.title === 'Open role' ||
          job.title.length > 70 ||
          /to lead a highly/i.test(job.title)
            ? titles[0] ||
              extractTitleFromBrief(params.input || job.description || '')
            : job.title,
        location: searchLocation || job.location,
      };
      const llm = await llmSourceCandidates({
        job: jobForLlm,
        limit,
        tenantId: params.tenantId,
        userId: params.userId,
      });
      for (const n of llm.notes) notes.push(n);
      for (const c of llm.costs) {
        costs.push(c);
        estimatedCostUsd += c.estimatedCostUsd;
        if (
          c.engine.includes('nova') ||
          c.engine.includes('llm') ||
          c.engine.includes('agentcore')
        ) {
          llmUsd += c.estimatedCostUsd;
        }
      }
      if (llm.tokenUsage) {
        llmInputTokens += llm.tokenUsage.inputTokens || 0;
        llmOutputTokens += llm.tokenUsage.outputTokens || 0;
        llmModelId = llm.tokenUsage.modelId || llmModelId;
      }
      for (const p of llm.candidates) {
        // Never surface raw /in/ URLs from LLM/web — they frequently 404.
        // Keep name/title/company so "Find on LinkedIn" + Google work.
        add({
          ...p,
          linkedinUrl: undefined,
          url: undefined,
          snippet:
            p.snippet ||
            'Web hint only — open Find on LinkedIn / Google to verify before outreach',
        });
      }
      notes.push(
        `Web hints (unverified): ${llm.candidates.length} · ~$${llmUsd.toFixed(4)} — use Find on LinkedIn, not Profile`
      );
    } catch (err: any) {
      notes.push(`Web grounding error: ${err?.message || err}`);
    }
  } else {
    notes.push(
      `Kept ${dbCount} database match(es); skipped inventing extra LLM names`
    );
  }

  // Drop people clearly outside target geo (e.g. China when Florida was requested)
  const geoTargets = locations.length
    ? locations
    : plan.personLocations || [];
  let geoFiltered = candidates;
  if (geoTargets.length) {
    const beforeGeo = geoFiltered.length;
    geoFiltered = geoFiltered.filter((c) =>
      personMatchesGeoTarget(c.location, geoTargets)
    );
    const droppedGeo = beforeGeo - geoFiltered.length;
    if (droppedGeo > 0) {
      notes.push(
        `Geo filter removed ${droppedGeo} profile(s) outside ${geoTargets.join(', ')} (e.g. non-US when Florida requested)`
      );
    }
  }

  // Quality filter: drop thin / likely-hallucinated LLM profiles.
  const beforeQ = geoFiltered.length;
  let qualityKept = filterAndRankByQuality(geoFiltered, {
    preferDbSources: true,
  });
  droppedLowQuality += beforeQ - qualityKept.length;
  if (droppedLowQuality > 0) {
    notes.push(
      `Quality filter removed ${droppedLowQuality} thin or suspicious profile(s)`
    );
  }

  // Soft-pass: never empty a full Apollo page
  if (qualityKept.length === 0 && beforeQ > 0) {
    const dbOnly = geoFiltered.filter(
      (c) => c.source === 'apollo' || c.source === 'pdl'
    );
    if (dbOnly.length) {
      notes.push(
        `Soft-pass ${dbOnly.length} Apollo/PDL hit(s) after quality — will re-rank vs JD`
      );
      qualityKept = dbOnly.map((c) => ({
        ...c,
        qualityScore: c.qualityScore ?? 40,
        qualityFlags: c.qualityFlags ?? ['soft_pass'],
      }));
    }
  }

  // --- Best-in-class: LLM re-rank shortlist vs JD + must-haves (CNC etc.) ---
  let ranked: Array<
    SourcedCandidate & {
      qualityScore?: number;
      qualityFlags?: string[];
      fitScore?: number;
      fitReason?: string;
      mustHaveHit?: boolean;
      geoOk?: boolean;
    }
  > = qualityKept;

  if (qualityKept.length > 0) {
    try {
      const rr = await rerankCandidatesForJob({
        jobTitle: job.title,
        jobLocation: searchLocation || job.location || locations[0],
        jobDescription:
          params.input || job.description || plan.rationale || job.title,
        mustHaveKeywords: mustHaveKeywords,
        people: qualityKept.map((c) => ({
          id: c.id,
          name: c.name,
          title: c.title,
          company: c.company,
          location: c.location,
          source: c.source,
          snippet: c.snippet,
        })),
        tenantId: params.tenantId,
        userId: params.userId,
      });
      llmUsd += rr.usedLlm ? 0.004 : 0;
      llmInputTokens += rr.usedLlm ? 1200 : 0;
      llmOutputTokens += rr.usedLlm ? 400 : 0;
      llmModelId = llmModelId || 'fill-job-rerank';

      const byId = new Map(qualityKept.map((c) => [String(c.id), c]));
      ranked = rr.ranked
        .map((r) => {
          const base = byId.get(String(r.id));
          if (!base) return null;
          return {
            ...base,
            fitScore: r.fitScore,
            fitReason: r.fitReason,
            mustHaveHit: r.mustHaveHit,
            geoOk: r.geoOk,
            qualityScore: r.fitScore,
            snippet: r.fitReason || base.snippet,
          };
        })
        .filter(Boolean) as typeof ranked;

      // Prefer must-have hits when we have enough
      const withMust = ranked.filter((c) => c.mustHaveHit);
      if (
        mustHaveKeywords.length &&
        withMust.length >= Math.min(3, ranked.length)
      ) {
        const without = ranked.filter((c) => !c.mustHaveHit);
        ranked = [...withMust, ...without];
        notes.push(
          `Re-rank: prioritizing ${withMust.length} with must-have signal (${mustHaveKeywords.join(', ')})`
        );
      }

      notes.push(
        rr.usedLlm
          ? `LLM re-rank applied to ${rr.ranked.length} candidate(s) vs JD`
          : `Heuristic re-rank applied${rr.error ? ` (${rr.error})` : ''}`
      );
    } catch (err: any) {
      notes.push(`Re-rank skipped: ${err?.message || err}`);
      ranked = qualityKept;
    }
  }

  // Recompute usage after re-rank token estimate
  // (usageBreakdown built earlier — rebuild line at end with updated llmUsd)

  const jobOut = { ...job, location: searchLocation || job.location };

  if (ranked.length === 0) {
    const emptyBreakdown = sumBreakdown({
      llm:
        llmUsd > 0
          ? {
              inputTokens: llmInputTokens,
              outputTokens: llmOutputTokens,
              estimatedUsd: llmUsd,
              modelId: llmModelId,
            }
          : null,
      apollo: apolloSlice,
      engines: [],
    });
    emptyBreakdown.totalEstimatedUsd = estimatedCostUsd;
    return {
      ok: false,
      job: jobOut,
      candidates: [],
      estimatedCostUsd,
      costs,
      usageBreakdown: emptyBreakdown,
      usageLine: formatBreakdownLine(emptyBreakdown),
      apolloPlan: plan,
      apolloPlanSource: planSource,
      apolloKeySource,
      apolloHttpStatus,
      apolloRequest,
      notes,
      error:
        apolloAuthError ||
        'No real candidates found. Check notes for Apollo key/auth errors. With a valid master key, titles like "Director of Operations" should return people.',
    };
  }

  const finalCandidates: SourcedCandidate[] = ranked
    .slice(0, limit)
    .map((c) => ({
      ...c,
      qualityScore: c.fitScore ?? c.qualityScore,
      qualityFlags: c.qualityFlags,
      fitScore: c.fitScore,
      fitReason: c.fitReason,
      mustHaveHit: c.mustHaveHit,
      geoOk: c.geoOk,
      snippet:
        c.fitReason ||
        c.snippet ||
        (c.source === 'llm' || c.source === 'web'
          ? 'Verify on LinkedIn/Google before outreach'
          : undefined),
    }));

  // Final usage (includes plan + re-rank LLM estimates)
  estimatedCostUsd = Math.max(
    estimatedCostUsd,
    (apolloSlice?.estimatedUsd || 0) +
      llmUsd +
      costs
        .filter((c) => c.engine === 'apollo-enrich')
        .reduce((s, c) => s + c.estimatedCostUsd, 0)
  );

  const usageBreakdownFinal = sumBreakdown({
    llm:
      llmUsd > 0 || llmInputTokens > 0
        ? {
            inputTokens: llmInputTokens,
            outputTokens: llmOutputTokens,
            estimatedUsd: llmUsd,
            modelId: llmModelId,
          }
        : null,
    apollo: apolloSlice,
    engines: costs
      .filter((c) => c.engine !== 'apollo' && !c.engine.startsWith('apollo-titles') && !c.engine.includes('titles+location'))
      .map((c) => ({
        engine: c.engine,
        results: c.count,
        estimatedUsd: c.estimatedCostUsd,
      })),
  });
  usageBreakdownFinal.totalEstimatedUsd = estimatedCostUsd;
  const usageLineFinal = formatBreakdownLine(usageBreakdownFinal);

  void logCombinedUsageTurn({
    queryPreview: `Fill job: ${job.title}`.slice(0, 200),
    surface: 'fill-job',
    tenantId: params.tenantId,
    userId: params.userId,
    latencyMs: Date.now() - started,
    llm:
      llmUsd > 0 || llmInputTokens > 0
        ? {
            inputTokens: llmInputTokens,
            outputTokens: llmOutputTokens,
            estimatedUsd: llmUsd,
            modelId: llmModelId,
          }
        : null,
    apollo: apolloSlice
      ? {
          results: apolloSlice.results,
          credits: apolloSlice.credits,
          estimatedUsd: apolloSlice.estimatedUsd,
          endpoint: apolloSlice.endpoint,
        }
      : null,
    toolsUsed: [...costs.map((c) => c.engine), 'fill-job-rerank'],
    extraUsd: costs
      .filter(
        (c) =>
          !c.engine.includes('apollo') &&
          !c.engine.includes('nova') &&
          !c.engine.includes('llm') &&
          !c.engine.includes('agentcore')
      )
      .reduce((s, c) => s + c.estimatedCostUsd, 0),
  }).catch(() => {});

  return {
    ok: true,
    job: jobOut,
    candidates: finalCandidates,
    estimatedCostUsd,
    costs,
    usageBreakdown: usageBreakdownFinal,
    usageLine: usageLineFinal,
    apolloPlan: plan,
    apolloPlanSource: planSource,
    apolloKeySource,
    apolloHttpStatus,
    apolloRequest,
    notes,
  };
}
