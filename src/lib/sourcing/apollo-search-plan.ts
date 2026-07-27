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

function normalizePlan(raw: unknown, fallback: ApolloSearchPlan): ApolloSearchPlan {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const titles = asStringArray(
    o.titles || o.person_titles || o.job_titles,
    8
  );
  const personLocations = asStringArray(
    o.personLocations ||
      o.person_locations ||
      o.locations ||
      o.location,
    6
  );
  const keywords = asStringArray(
    o.keywords || o.skills || o.q_keywords,
    10
  );
  const seniorities = asStringArray(
    o.seniorities || o.person_seniorities,
    6
  ).map((s) => s.toLowerCase().replace(/\s+/g, '_'));

  return {
    titles: titles.length ? titles : fallback.titles,
    personLocations:
      personLocations.length > 0
        ? personLocations
        : fallback.personLocations,
    keywords: keywords.length ? keywords : fallback.keywords,
    seniorities: seniorities.length ? seniorities : fallback.seniorities,
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
    personLocations = [String(locationOverride).trim()];
  } else if (job.location) {
    personLocations = [job.location];
  }

  const titles = [job.title].filter(
    (t) =>
      t &&
      t !== 'Open role' &&
      t.length <= 80 &&
      !/demonstrated|ability to|integrity|commitment/i.test(t)
  );

  return {
    titles: titles.length ? titles : ['Software Engineer'],
    personLocations,
    keywords: (job.keywords || []).slice(0, 8),
    seniorities: [],
    rationale: 'Heuristic filters from job title/location/keywords',
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

  const system = `You are a recruiting search strategist. Convert a job posting into
Apollo.io People API Search filters. Output ONLY valid JSON (no markdown).

Schema:
{
  "titles": ["primary title", "alt title 1", "alt title 2"],
  "personLocations": ["City, ST", "State", "Remote"],
  "keywords": ["skill1", "skill2", "domain"],
  "seniorities": ["manager"],
  "query": "short free-text assist phrase",
  "rationale": "one sentence"
}

Rules:
- titles: 1–6 REAL job titles people would put on LinkedIn (not soft skills, not company culture).
  Include close variants (e.g. "ERP Implementation Specialist", "Finance Systems Implementation Manager").
- personLocations: only if geography is specified or implied. Use Apollo-friendly places
  (e.g. "Florida", "Miami, Florida", "United States"). Empty array if role is clearly worldwide/unspecified
  and no override. If user forces a location, put only that location.
- keywords: hard skills, tools, industries (NetSuite, SAP, manufacturing) — NOT soft skills
  like "integrity" or "fast-paced".
- seniorities: only if clear (entry, senior, manager, director, vp, c_suite, founder). Else [].
- Never invent candidate names. You only design the search.`;

  const locNote =
    params.locationOverride === ''
      ? 'USER LOCATION CHOICE: anywhere (no personLocations).'
      : params.locationOverride != null &&
          String(params.locationOverride).trim()
        ? `USER LOCATION CHOICE (must use): ${String(params.locationOverride).trim()}`
        : 'USER LOCATION CHOICE: use job location if present, else infer or leave empty.';

  const user = `JOB TITLE (may be wrong if pasted prose): ${params.job.title}
JOB LOCATION FIELD: ${params.job.location || '(none)'}
COMPANY: ${params.job.companyName || '(none)'}
${locNote}

FULL JOB TEXT / DESCRIPTION:
${(params.rawInput || params.job.description || params.job.title || '').slice(0, 6000)}

Return JSON only.`;

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

    // Drop garbage titles
    plan.titles = plan.titles.filter(
      (t) =>
        t.length >= 3 &&
        t.length <= 80 &&
        !/demonstrated|ability to|integrity|commitment|fast-paced|performance-driven/i.test(
          t
        )
    );
    if (!plan.titles.length) plan.titles = fallback.titles;

    plan.keywords = plan.keywords.filter(
      (k) =>
        k.length >= 2 &&
        !/integrity|humility|accountability|fast-paced|thrive|commitment/i.test(
          k
        )
    );

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
