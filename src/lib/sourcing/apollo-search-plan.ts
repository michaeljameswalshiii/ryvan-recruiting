/**
 * LLM reads a full job description and outputs structured Apollo People Search filters.
 * Does NOT invent people — only the query Apollo needs.
 *
 * @serverOnly
 */

import {
  completeJson,
  fillJobPlanModelChain,
} from '@/lib/list-builder/llm-json';

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
  /**
   * Hard must-have skills/tools for q_keywords (CNC, NetSuite, AWS…).
   * Applied on the FIRST Apollo pass for precision; dropped only if zero hits.
   */
  mustHaveKeywords: string[];
  /** Optional hard skills (used after must-haves / for notes) */
  keywords: string[];
  /** Apollo person_seniorities when clear: entry, senior, manager, director, vp, c_suite, etc. */
  seniorities: string[];
  /** One-line rationale for recruiters */
  rationale?: string;
  /** Primary search phrase */
  query?: string;
};

/**
 * Extract hard must-have tools/skills from JD text when LLM omits them.
 * CNC, EDM, NetSuite-style tokens only — not soft skills.
 */
export function extractMustHaveSkillsFromText(text: string): string[] {
  const t = text || '';
  const found: string[] = [];
  const patterns: Array<{ re: RegExp; token: string }> = [
    { re: /\bCNC\b/i, token: 'CNC' },
    { re: /\bEDM\b/i, token: 'EDM' },
    { re: /\bwire\s*EDM\b/i, token: 'wire EDM' },
    { re: /\bSwiss\s+machin/i, token: 'Swiss machining' },
    { re: /\bNetSuite\b/i, token: 'NetSuite' },
    { re: /\bSAP\b/i, token: 'SAP' },
    { re: /\bSalesforce\b/i, token: 'Salesforce' },
    { re: /\bWorkday\b/i, token: 'Workday' },
    { re: /\bSolidWorks\b/i, token: 'SolidWorks' },
    { re: /\bAutoCAD\b/i, token: 'AutoCAD' },
    { re: /\bPLC\b/i, token: 'PLC' },
    { re: /\bAWS\b/, token: 'AWS' },
    { re: /\bAzure\b/i, token: 'Azure' },
    { re: /\bKubernetes\b|\bk8s\b/i, token: 'Kubernetes' },
    { re: /\bReact\b/, token: 'React' },
    { re: /\bPython\b/i, token: 'Python' },
    { re: /\bJava\b(?!\s*Script)/i, token: 'Java' },
    { re: /\bTypeScript\b/i, token: 'TypeScript' },
    { re: /\bGD&T\b|\bGDT\b/i, token: 'GD&T' },
    { re: /\bISO\s*9001\b/i, token: 'ISO 9001' },
    { re: /\bLean\s+Manufacturing\b/i, token: 'Lean Manufacturing' },
    { re: /\bSix\s+Sigma\b/i, token: 'Six Sigma' },
    { re: /\bmachining\b/i, token: 'machining' },
    { re: /\btool\s*and\s*die\b/i, token: 'tool and die' },
  ];
  for (const { re, token } of patterns) {
    if (re.test(t) && !found.some((f) => f.toLowerCase() === token.toLowerCase())) {
      found.push(token);
    }
  }
  return found.slice(0, 4);
}

function mergeUniqueSkills(...lists: string[][]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const list of lists) {
    for (const raw of list) {
      const k = String(raw || '').trim();
      if (!k || k.length > 32 || BANNED_KEYWORD_RE.test(k)) continue;
      if (k.split(/\s+/).length > 3) continue;
      const key = k.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(k);
    }
  }
  return out;
}

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
  // Must-have hard skills (CNC, NetSuite…) — precision pass
  let mustHaveKeywords = asStringArray(
    o.mustHaveKeywords ||
      o.must_have_keywords ||
      o.required_skills ||
      o.requiredSkills ||
      o.must_haves,
    4
  )
    .map((k) => k.replace(/\s+/g, ' ').trim())
    .filter(
      (k) =>
        k.length >= 2 &&
        k.length <= 32 &&
        !BANNED_KEYWORD_RE.test(k) &&
        k.split(/\s+/).length <= 3
    );

  // Optional / secondary hard skills
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
        k.split(/\s+/).length <= 3
    )
    .slice(0, 4);

  // If LLM only filled keywords, promote first hard ones to must-have
  if (!mustHaveKeywords.length && keywords.length) {
    mustHaveKeywords = keywords.slice(0, 2);
    keywords = keywords.slice(2);
  }

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
    mustHaveKeywords: mustHaveKeywords.slice(0, 2),
    keywords: keywords
      .filter(
        (k) =>
          !mustHaveKeywords.some((m) => m.toLowerCase() === k.toLowerCase())
      )
      .slice(0, 3),
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

  const jdBlob = [job.title, job.description, ...(job.keywords || [])].join(
    ' '
  );
  const mustFromJd = extractMustHaveSkillsFromText(jdBlob);
  const mustHaveKeywords = mergeUniqueSkills(mustFromJd, kw).slice(0, 2);

  return {
    titles: titles.length
      ? titles.map(cleanApolloTitle).filter(Boolean)
      : ['Software Engineer'],
    personLocations,
    mustHaveKeywords,
    keywords: kw.filter(
      (k) => !mustHaveKeywords.some((m) => m.toLowerCase() === k.toLowerCase())
    ),
    seniorities: [],
    rationale: mustHaveKeywords.length
      ? `Heuristic: titles + location + must-have ${mustHaveKeywords.join(', ')}`
      : 'Heuristic: primary title + location; no clear hard-skill must-haves',
    query: [titles[0] || job.title, personLocations[0] || '', mustHaveKeywords[0]]
      .filter(Boolean)
      .join(' '),
  };
}

/**
 * Normalize a user-edited plan from the UI (comma-separated fields already split).
 */
export function planFromUserEdit(
  raw: Partial<ApolloSearchPlan> | Record<string, unknown>,
  fallback?: Partial<ApolloSearchPlan>
): ApolloSearchPlan {
  const base: ApolloSearchPlan = {
    titles: fallback?.titles || [],
    personLocations: fallback?.personLocations || [],
    mustHaveKeywords: fallback?.mustHaveKeywords || [],
    keywords: fallback?.keywords || [],
    seniorities: fallback?.seniorities || [],
    rationale: fallback?.rationale || 'User-edited Apollo plan',
    query: fallback?.query,
  };
  return normalizePlan(raw, base);
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
  /** Bedrock model that produced the plan (when source=llm) */
  modelId?: string;
}> {
  const fallback = heuristicApolloPlan(params.job, params.locationOverride);

  const system = `You are an Apollo.io People Search expert (API: mixed_people/api_search).
Your ONLY job: turn a job posting into Apollo filters that return REAL people who can do the job.
You never invent candidate names. Output ONLY valid JSON (no markdown).

## Goal: PRECISION first, then recall
Recruiters hate zero results AND hate broad trash.
- Include 1–2 MUST-HAVE hard skills when the JD requires them (e.g. CNC, wire EDM, NetSuite, AWS).
- Do NOT dump every nice-to-have skill into keywords.
- Soft skills NEVER go into keywords.
- CRITICAL: Apollo q_keywords does NOT search full employment history. For shop skills like CNC,
  q_keywords mostly matches COMPANY NAMES ("CNC Industries"), not "Plant Manager who ran CNC".
  Still put CNC in mustHaveKeywords so the product can run a separate labeled pass + re-rank —
  but never put CNC into person_titles unless people commonly hold "CNC Manager" as title.

## How Apollo filters work
- person_titles + person_locations + q_keywords are AND-style.
- Too many keywords → 0 people.
- People Search is free (masked last names OK for shortlist).

## JSON schema
{
  "titles": ["primary LinkedIn title", "variant 1", "variant 2"],
  "personLocations": ["City, ST"] | ["State"] | [],
  "mustHaveKeywords": ["CNC"],
  "keywords": ["optional secondary hard skill"],
  "seniorities": [],
  "query": "optional short assist",
  "rationale": "one sentence: required skill + title + geo tradeoff"
}

## Titles (person_titles)
- 2–5 REAL LinkedIn titles (not JD prose).
- Cover how people title themselves: "Plant Manager", "Manufacturing Manager", "Director of Operations".
- Do NOT put CNC inside the title string unless people commonly write "CNC Manager" on LinkedIn.
- Prefer clean titles; put tools like CNC in mustHaveKeywords instead.

## Locations
- Real places only: "Jacksonville, FL", "Florida", "Remote", "United States".
- Never JD fragments. Empty [] for worldwide. Usually 0–1 locations.

## mustHaveKeywords (REQUIRED when JD requires a tool/process)
- These map to Apollo q_keywords = experience / skills / profile TEXT match.
- They do NOT need to appear in the person's job TITLE or NAME.
  Example: Plant Manager with CNC experience → titles=["Plant Manager"], mustHaveKeywords=["CNC"].
- Examples: CNC, EDM, "wire EDM", NetSuite, SAP, SolidWorks, PLC, AWS, React.
- If the JD says "CNC machining", "Swiss CNC", "must know CNC" → mustHaveKeywords MUST include "CNC".
- If the JD requires NetSuite implementation → "NetSuite".
- Max 2 must-haves. Prefer the single strongest (CNC beats a list of five tools).
- NEVER put CNC into titles unless people commonly hold "CNC Operator" as their title.
- NEVER soft skills. NEVER long phrases.

## keywords (optional only)
- Extra hard skills NOT required to pass the first screen (0–2).
- Do not repeat mustHaveKeywords.

## Seniorities
- Almost always []. Prefer title variants over seniority filters.

## Strategy
1) Extract role title variants + geo.
2) Extract 1–2 non-negotiable tools/processes from the JD → mustHaveKeywords.
3) Leave nice-to-haves out (or optional keywords only).
4) rationale e.g. "Ops/plant titles + FL + CNC must-have so we don't get generic managers."

Never invent people. Design the search only.`;

  const locNote =
    params.locationOverride === ''
      ? 'USER LOCATION CHOICE: ANYWHERE — personLocations MUST be [].'
      : params.locationOverride != null &&
          String(params.locationOverride).trim()
        ? `USER LOCATION CHOICE (must use as primary personLocations entry): ${String(params.locationOverride).trim()}`
        : 'USER LOCATION CHOICE: use job location if it is a real place; else [] or a clean inferred State/City.';

  const jdText = (
    params.rawInput ||
    params.job.description ||
    params.job.title ||
    ''
  ).slice(0, 6000);
  const autoMust = extractMustHaveSkillsFromText(
    [params.job.title, jdText, ...(params.job.keywords || [])].join(' ')
  );

  const user = `Convert this job into an Apollo People Search plan (precision + recall).

JOB TITLE FIELD (may be wrong if pasted prose): ${params.job.title}
JOB LOCATION FIELD: ${params.job.location || '(none)'}
COMPANY: ${params.job.companyName || '(none)'}
SEED KEYWORDS (filter ruthlessly): ${(params.job.keywords || []).slice(0, 12).join(', ') || '(none)'}
AUTO-DETECTED HARD SKILLS (include in mustHaveKeywords if they fit the role): ${autoMust.join(', ') || '(none)'}
${locNote}

FULL JOB TEXT / DESCRIPTION:
${jdText}

Return JSON only.
If the JD requires CNC / EDM / NetSuite / similar tools, put them in mustHaveKeywords (1–2 max).
Do not leave mustHaveKeywords empty when a clear tool requirement is in the JD.`;

  try {
    // Sonnet for plan quality; list-builder stays on Haiku (see fillJobPlanModelChain)
    const { data, error, modelId } = await completeJson<unknown>(
      system,
      user,
      {
        tenantId: params.tenantId || undefined,
        userId: params.userId || undefined,
        purpose: 'apollo-search-plan',
        queryPreview: params.job.title,
      },
      {
        timeoutMs: 25_000,
        modelIds: fillJobPlanModelChain(),
        temperature: 0.2,
        maxTokens: 2048,
      }
    );

    if (error || data == null) {
      return {
        plan: fallback,
        source: 'heuristic',
        error: error || 'LLM returned no plan',
        modelId,
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

    // Merge JD-detected must-haves (CNC etc.) when LLM omitted them
    const fromJd = extractMustHaveSkillsFromText(
      [
        params.job.title,
        params.rawInput,
        params.job.description,
        ...(params.job.keywords || []),
      ]
        .filter(Boolean)
        .join(' ')
    );
    plan.mustHaveKeywords = mergeUniqueSkills(
      plan.mustHaveKeywords || [],
      fromJd,
      fallback.mustHaveKeywords || []
    ).slice(0, 2);

    plan.keywords = (plan.keywords || [])
      .filter(
        (k) =>
          k.length >= 2 &&
          k.length <= 32 &&
          !BANNED_KEYWORD_RE.test(k) &&
          k.split(/\s+/).length <= 3 &&
          !(plan.mustHaveKeywords || []).some(
            (m) => m.toLowerCase() === k.toLowerCase()
          )
      )
      .slice(0, 2);

    // Seniority only if LLM was confident — strip if titles already encode level
    if (
      plan.seniorities.length &&
      plan.titles.some((t) =>
        /\b(vp|vice president|director|chief|head of|manager)\b/i.test(t)
      )
    ) {
      plan.seniorities = [];
    }

    return { plan, source: 'llm', modelId };
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
    ((plan.mustHaveKeywords || []).length
      ? ` must=[${(plan.mustHaveKeywords || []).slice(0, 3).join(', ')}]`
      : '') +
    (plan.keywords.length
      ? ` kw=[${plan.keywords.slice(0, 5).join(', ')}]`
      : '') +
    (plan.seniorities.length
      ? ` senior=[${plan.seniorities.join(',')}]`
      : '') +
    (plan.rationale ? ` — ${plan.rationale}` : '')
  );
}
