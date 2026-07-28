/**
 * LLM reads a full job description and outputs structured Apollo People Search filters.
 * Does NOT invent people — only the query Apollo needs.
 *
 * @serverOnly
 */

import { completeJson } from '@/lib/list-builder/llm-json';

/** Minimal job fields needed for planning (avoid circular runtime import) */
export type JobPlanInput = {
  title: string;
  location?: string;
  companyName?: string;
  description?: string;
  keywords: string[];
};

/** True if string looks like a real place Apollo can filter on (not JD prose). */
export function isValidPersonLocation(loc: string | undefined | null): boolean {
  const s = (loc || '').trim();
  if (s.length < 2 || s.length > 60) return false;
  // Mid-sentence JD fragments (e.g. "dustries where quality" from "industries")
  if (
    /^(dustries|dustry|cluding|vironment|tegrity|paced|manufacturing)\b/i.test(
      s
    )
  ) {
    return false;
  }
  if (
    /\b(where|quality|ability|integrity|commitment|thrive|fast-paced|environment|priorities|processes|people and|competing|humility|accountability|demonstrated|requirements|responsibilities|experience|years of)\b/i.test(
      s
    )
  ) {
    return false;
  }
  if (/^(remote|united states|usa|u\.s\.a?\.?|north america)$/i.test(s)) {
    return true;
  }
  if (
    /\b(Alabama|Alaska|Arizona|Arkansas|California|Colorado|Connecticut|Delaware|Florida|Georgia|Hawaii|Idaho|Illinois|Indiana|Iowa|Kansas|Kentucky|Louisiana|Maine|Maryland|Massachusetts|Michigan|Minnesota|Mississippi|Missouri|Montana|Nebraska|Nevada|New Hampshire|New Jersey|New Mexico|New York|North Carolina|North Dakota|Ohio|Oklahoma|Oregon|Pennsylvania|Rhode Island|South Carolina|South Dakota|Tennessee|Texas|Utah|Vermont|Virginia|Washington|West Virginia|Wisconsin|Wyoming|District of Columbia|Puerto Rico)\b/i.test(
      s
    )
  ) {
    return true;
  }
  if (
    /\b(Miami|Tampa|Orlando|Jacksonville|Atlanta|Dallas|Houston|Austin|Chicago|Boston|Seattle|Denver|Phoenix|Charlotte|Nashville|Raleigh|Fort Lauderdale|West Palm Beach|Palm Beach|Boca Raton)\b/i.test(
      s
    )
  ) {
    return true;
  }
  // City, ST
  if (/^[A-Za-z .'-]{2,40},\s*[A-Z]{2}\b/.test(s)) return true;
  if (/^[a-z]/.test(s)) return false;
  return false;
}

export type ApolloSearchPlan = {
  /** Primary + alternate job titles for person_titles */
  titles: string[];
  /** Person locations (city/state/region); empty = no location filter */
  personLocations: string[];
  /** Free-text skill / domain keywords for q_keywords */
  keywords: string[];
  /** Apollo person_seniorities when clear: entry, senior, manager, director, vp, c_suite, etc. */
  seniorities: string[];
  /** One-line rationale for recruiters */
  rationale?: string;
  /** Primary search phrase */
  query?: string;
};

function asStringArray(v: unknown, max = 12): string[] {
  if (!v) return [];
  if (Array.isArray(v)) {
    return v
      .map((x) => String(x || '').trim())
      .filter(Boolean)
      .slice(0, max);
  }
  if (typeof v === 'string' && v.trim()) return [v.trim()];
  return [];
}

/** Soft-skill / JD fluff that must never hit Apollo q_keywords or titles */
const BANNED_KEYWORD_RE =
  /integrity|humility|accountability|fast-paced|thrive|commitment|passionate|self-starter|team player|excellent communication|detail.oriented|proven track|highly motivated|dynamic|results.driven|performance.driven|collaborative|go.getter|rockstar|ninja|guru|ownership mentality|work ethic/i;

const BANNED_TITLE_RE =
  /demonstrated|ability to|integrity|commitment|fast-paced|performance.driven|to lead a highly|requirements|responsibilities|looking for|we are seeking/i;

/** Keep Apollo person_titles short and LinkedIn-shaped */
function cleanApolloTitle(t: string): string {
  let s = (t || '').replace(/\s+/g, ' ').trim();
  // Drop parenthetical noise
  s = s.replace(/\s*\([^)]*\)\s*/g, ' ').trim();
  // First segment of multi-title dumps
  s = s.split(/\s*\/\s*/)[0].split(/\s*[|·•]\s*/)[0].trim();
  // "Director of Operations to lead…" → stop at soft prose
  s = s.replace(
    /\s+(to lead|who will|responsible for|with experience|in a|for our).+$/i,
    ''
  );
  if (s.length > 70) s = s.slice(0, 70).replace(/\s+\S*$/, '');
  return s.trim();
}

function normalizePlan(raw: unknown, fallback: ApolloSearchPlan): ApolloSearchPlan {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  let titles = asStringArray(
    o.titles || o.person_titles || o.job_titles,
    8
  )
    .map(cleanApolloTitle)
    .filter(
      (t) =>
        t.length >= 3 &&
        t.length <= 70 &&
        !BANNED_TITLE_RE.test(t) &&
        !/^(the|a|an)\s/i.test(t)
    );
  // Dedupe case-insensitively, keep order
  {
    const seen = new Set<string>();
    titles = titles.filter((t) => {
      const k = t.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }

  const personLocations = asStringArray(
    o.personLocations ||
      o.person_locations ||
      o.locations ||
      o.location,
    4
  );
  // Apollo q_keywords ANDs — keep very short hard skills only (runner uses ≤2)
  let keywords = asStringArray(
    o.keywords || o.skills || o.q_keywords,
    6
  )
    .map((k) => k.replace(/\s+/g, ' ').trim())
    .filter(
      (k) =>
        k.length >= 2 &&
        k.length <= 32 &&
        !BANNED_KEYWORD_RE.test(k) &&
        !/\s{2,}/.test(k) &&
        // Prefer single tokens or short compounds (NetSuite, wire EDM ok; long phrases no)
        k.split(/\s+/).length <= 3
    )
    .slice(0, 4);

  const seniorities = asStringArray(
    o.seniorities || o.person_seniorities,
    4
  )
    .map((s) => s.toLowerCase().replace(/\s+/g, '_'))
    .filter((s) =>
      [
        'intern',
        'entry',
        'senior',
        'manager',
        'director',
        'head',
        'vp',
        'c_suite',
        'founder',
        'owner',
        'partner',
      ].includes(s)
    );

  const cleanLocs = personLocations.filter(isValidPersonLocation);
  const fallbackLocs = fallback.personLocations.filter(isValidPersonLocation);

  return {
    titles: titles.length ? titles.slice(0, 6) : fallback.titles,
    personLocations: cleanLocs.length > 0 ? cleanLocs : fallbackLocs,
    // Prefer empty keywords over fluff — empty lets title+location recall work
    keywords: keywords.length ? keywords : [],
    seniorities: seniorities.length ? seniorities : [],
    rationale:
      typeof o.rationale === 'string'
        ? o.rationale.slice(0, 300)
        : typeof o.reason === 'string'
          ? o.reason.slice(0, 300)
          : fallback.rationale,
    query:
      typeof o.query === 'string'
        ? o.query.slice(0, 200)
        : fallback.query,
  };
}

/**
 * Heuristic plan when LLM fails (no inventing people).
 */
export function heuristicApolloPlan(
  job: JobPlanInput,
  locationOverride?: string | null
): ApolloSearchPlan {
  let personLocations: string[] = [];
  if (locationOverride === '') {
    personLocations = [];
  } else if (locationOverride != null && String(locationOverride).trim()) {
    const o = String(locationOverride).trim();
    personLocations = isValidPersonLocation(o) ? [o] : [];
  } else if (job.location && isValidPersonLocation(job.location)) {
    personLocations = [job.location];
  }

  const titles = [job.title].filter(
    (t) =>
      t &&
      t !== 'Open role' &&
      t.length <= 70 &&
      !/demonstrated|ability to|integrity|commitment|to lead a highly/i.test(t)
  );

  const kw = (job.keywords || [])
    .map((k) => String(k).trim())
    .filter(
      (k) =>
        k.length >= 2 &&
        k.length <= 32 &&
        !BANNED_KEYWORD_RE.test(k) &&
        k.split(/\s+/).length <= 3
    )
    .slice(0, 3);

  return {
    titles: titles.length ? titles.map(cleanApolloTitle).filter(Boolean) : ['Software Engineer'],
    personLocations,
    keywords: kw,
    seniorities: [],
    rationale:
      'Heuristic: primary title + location; minimal hard-skill keywords (Apollo-AND safe)',
    query: [titles[0] || job.title, personLocations[0] || '']
      .filter(Boolean)
      .join(' '),
  };
}

/**
 * LLM reviews the full JD and returns exact Apollo People Search inputs.
 */
export async function buildApolloSearchPlan(params: {
  job: JobPlanInput;
  rawInput?: string;
  /** User location choice: undefined=job, ''=anywhere, string=custom */
  locationOverride?: string | null;
  tenantId?: string | null;
  userId?: string | null;
}): Promise<{
  plan: ApolloSearchPlan;
  source: 'llm' | 'heuristic';
  error?: string;
}> {
  const fallback = heuristicApolloPlan(params.job, params.locationOverride);

  const system = `You are an Apollo.io People Search expert (API: mixed_people/api_search).
Your ONLY job: turn a job posting into high-recall Apollo filters that return REAL people.
You never invent candidate names. Output ONLY valid JSON (no markdown).

## How Apollo filters work (critical)
- person_titles, person_locations, q_keywords, person_seniorities are combined with AND-style logic.
- MORE filters = FEWER (often ZERO) people. Sparse markets need BREADTH.
- People Search is FREE and returns privacy-masked last names; that is fine for shortlisting.
- q_keywords is free-text AND — long multi-skill keyword strings are the #1 cause of 0 results.
- Prefer: strong titles + optional location. Keywords and seniorities are optional spice, not defaults.

## JSON schema
{
  "titles": ["primary LinkedIn title", "variant 1", "variant 2"],
  "personLocations": ["City, ST"] | ["State"] | [] ,
  "keywords": ["ToolOrDomain"],
  "seniorities": [],
  "query": "short assist phrase (optional)",
  "rationale": "one sentence: why this plan maximizes recall without junk"
}

## Titles (person_titles) — most important
- 2–5 REAL LinkedIn-style titles people actually hold (not wish-list paragraphs).
- Primary title first = closest match to the role.
- Add 1–3 ALTERNATES that the same person might use, e.g.:
  - "Director of Operations" / "VP Operations" / "Head of Operations"
  - "Plant Manager" / "Manufacturing Manager"
  - "Software Engineer" / "Backend Engineer" (not "AWS API Healthcare Engineer")
- Keep each title ≤ 60 characters. No "to lead…", no soft skills, no company slogans.
- Do NOT invent exotic compound titles that almost nobody has on LinkedIn.
- If the JD is bloated prose, EXTRACT the real role (e.g. Director of Operations) — ignore filler.

## Locations (person_locations)
- ONLY real places Apollo understands: "Jacksonville, FL", "Florida", "Miami", "Remote", "United States".
- Prefer City+State when the job is local; use State alone when city is too small for recall.
- NEVER JD fragments: "fast-paced environment", "industries where quality", "demonstrated ability…".
- Empty [] when user wants worldwide OR no clear geo — better empty than wrong.
- Do not put 4+ locations; 1 is usually best (or [] for anywhere).

## Keywords (q_keywords) — use sparingly
- 0–3 SHORT hard tokens: products, tools, industries (NetSuite, SAP, CNC, AWS, healthcare).
- Prefer ZERO keywords when title+location is enough (most ops/leadership roles).
- NEVER soft skills: integrity, humility, fast-paced, team player, communication.
- NEVER long phrases: "high-volume restaurant operations" → use title variants instead.
- Max ~3 words per keyword. No comma-stuffing the whole JD.

## Seniorities (person_seniorities)
- Almost always []. Only set when the JD is crystal clear (e.g. explicit VP/C-level only).
- Wrong seniority zeros results. Prefer title variants ("VP Operations") over seniority=vp.

## Search strategy (think like a sourcer)
1) Start wide: best title + 1–2 variants + location (or []).
2) Do not over-constrain with skills + seniority + city + niche title all at once.
3) For niche tech: one domain keyword max (e.g. "NetSuite") + clean title.
4) For leadership/ops: titles only; drop keywords.
5) If the role could be titled many ways, cover those ways in titles[] — not in keywords.

## Output discipline
- rationale: explain tradeoff in one line (e.g. "Broad ops titles + FL only; no keywords to avoid AND zero").
- Never invent people. Design the search only.`;

  const locNote =
    params.locationOverride === ''
      ? 'USER LOCATION CHOICE: ANYWHERE — personLocations MUST be [].'
      : params.locationOverride != null &&
          String(params.locationOverride).trim()
        ? `USER LOCATION CHOICE (must use as primary personLocations entry): ${String(params.locationOverride).trim()}`
        : 'USER LOCATION CHOICE: use job location if it is a real place; else [] or a clean inferred State/City.';

  const user = `Convert this job into an Apollo People Search plan (expert mode: maximize useful recall).

JOB TITLE FIELD (may be wrong if pasted prose): ${params.job.title}
JOB LOCATION FIELD: ${params.job.location || '(none)'}
COMPANY: ${params.job.companyName || '(none)'}
SEED KEYWORDS (may be noisy — filter ruthlessly): ${(params.job.keywords || []).slice(0, 12).join(', ') || '(none)'}
${locNote}

FULL JOB TEXT / DESCRIPTION:
${(params.rawInput || params.job.description || params.job.title || '').slice(0, 6000)}

Return JSON only. Prefer fewer filters if unsure.`;

  try {
    const { data, error } = await completeJson<unknown>(
      system,
      user,
      {
        tenantId: params.tenantId || undefined,
        userId: params.userId || undefined,
        purpose: 'apollo-search-plan',
        queryPreview: params.job.title,
      },
      { timeoutMs: 20_000 }
    );

    if (error || data == null) {
      return {
        plan: fallback,
        source: 'heuristic',
        error: error || 'LLM returned no plan',
      };
    }

    let plan = normalizePlan(data, fallback);

    // Enforce user location override after LLM
    if (params.locationOverride === '') {
      plan = { ...plan, personLocations: [] };
    } else if (
      params.locationOverride != null &&
      String(params.locationOverride).trim()
    ) {
      plan = {
        ...plan,
        personLocations: [String(params.locationOverride).trim()],
      };
    }

    // Drop garbage titles (defense in depth after normalizePlan)
    plan.titles = plan.titles
      .map(cleanApolloTitle)
      .filter(
        (t) =>
          t.length >= 3 &&
          t.length <= 70 &&
          !BANNED_TITLE_RE.test(t)
      );
    if (!plan.titles.length) plan.titles = fallback.titles;

    plan.keywords = plan.keywords
      .filter(
        (k) =>
          k.length >= 2 &&
          k.length <= 32 &&
          !BANNED_KEYWORD_RE.test(k) &&
          k.split(/\s+/).length <= 3
      )
      .slice(0, 3);

    // Expert default: leadership/ops-style titles rarely need keywords
    const looksLikeLeadership = plan.titles.some((t) =>
      /\b(director|vp|vice president|head of|chief|coo|plant manager|general manager|operations manager)\b/i.test(
        t
      )
    );
    if (looksLikeLeadership && plan.keywords.length > 1) {
      plan.keywords = plan.keywords.slice(0, 1);
    }

    // Seniority only if LLM was confident — strip if titles already encode level
    if (
      plan.seniorities.length &&
      plan.titles.some((t) =>
        /\b(vp|vice president|director|chief|head of|manager)\b/i.test(t)
      )
    ) {
      plan.seniorities = [];
    }

    return { plan, source: 'llm' };
  } catch (err: any) {
    return {
      plan: fallback,
      source: 'heuristic',
      error: err?.message || String(err),
    };
  }
}

export function formatPlanForNotes(plan: ApolloSearchPlan, source: string): string {
  return (
    `Apollo plan (${source}): titles=[${plan.titles.slice(0, 4).join('; ')}]` +
    (plan.personLocations.length
      ? ` loc=[${plan.personLocations.join('; ')}]`
      : ' loc=anywhere') +
    (plan.keywords.length
      ? ` kw=[${plan.keywords.slice(0, 5).join(', ')}]`
      : '') +
    (plan.seniorities.length
      ? ` senior=[${plan.seniorities.join(',')}]`
      : '') +
    (plan.rationale ? ` — ${plan.rationale}` : '')
  );
}
