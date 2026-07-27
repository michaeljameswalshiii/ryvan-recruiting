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
  type ApolloSearchPlan,
} from '@/lib/sourcing/apollo-search-plan';

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
  apolloPlanSource?: 'llm' | 'heuristic';
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
    const key = (
      c.linkedinUrl ||
      c.email ||
      `${c.name}|${c.title}|${c.company}`
    )
      .toLowerCase()
      .trim();
    if (!key || seen.has(key)) return;
    seen.add(key);
    candidates.push(c);
  };

  // --- 0) LLM reviews full JD → structured Apollo filters (not people) ---
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

  let plan = planResult.plan;
  // User location still wins over plan if explicitly set above
  if (params.location === '') {
    plan = { ...plan, personLocations: [] };
  } else if (searchLocation) {
    plan = { ...plan, personLocations: [searchLocation] };
  } else {
    // Drop any LLM locations that are JD prose
    plan = {
      ...plan,
      personLocations: plan.personLocations.filter(isValidPersonLocation),
    };
  }

  notes.push(formatPlanForNotes(plan, planResult.source));
  if (planResult.error && planResult.source === 'heuristic') {
    notes.push(`Plan LLM fallback: ${planResult.error}`);
  }

  const titles = plan.titles.length ? plan.titles : [job.title].filter(Boolean);
  const locations = plan.personLocations.length
    ? plan.personLocations
    : searchLocation
      ? [searchLocation]
      : [];
  const keywords = plan.keywords.length
    ? plan.keywords
    : job.keywords.slice(0, 8);
  const seniorities = plan.seniorities || [];

  /**
   * Short keywords only — long multi-skill q_keywords AND'd with title+location
   * routinely returns 0 people (e.g. "Swiss machining wire EDM" on a Dir Ops).
   */
  const lightKeywords = keywords
    .map((k) => k.trim())
    .filter((k) => k.length >= 3 && k.length <= 40)
    .filter((k) => !/\s{2,}/.test(k))
    .slice(0, 2);

  // --- 1) Apollo: progressive passes (search = 0 credits each) ---
  // Tight LLM plan (titles+loc+many keywords+seniority) often zeros out.
  // Broaden until we have people, then stop.
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

  // Broad → slightly alternate → geography broaden.
  // Never start with keywords+seniority: they AND with titles and often return 0.
  const apolloPasses: ApolloPass[] = [
    {
      label: 'titles+location',
      titles: titles.slice(0, 5),
      locations,
    },
    ...(titles.length > 1
      ? [
          {
            label: 'alt-titles+location',
            titles: titles.slice(1, 5),
            locations,
          } satisfies ApolloPass,
        ]
      : []),
    // Simpler title set (first 2 only) — sometimes long title lists over-narrow Apollo
    {
      label: 'primary-title+location',
      titles: titles.slice(0, 2),
      locations,
    },
    // Geography broaden when state/city is empty
    ...(locations.length &&
    !locations.some((l) => /united states|usa|u\.s\./i.test(l))
      ? [
          {
            label: 'titles+US',
            titles: titles.slice(0, 3),
            locations: ['United States'],
          } satisfies ApolloPass,
        ]
      : []),
    // Light industry kw ONLY if still thin (subset of prior — may still help different Apollo ranking)
    ...(lightKeywords.length
      ? [
          {
            label: 'titles+location+kw',
            titles: titles.slice(0, 3),
            locations,
            keywords: lightKeywords.slice(0, 1),
          } satisfies ApolloPass,
        ]
      : []),
  ];
  // seniorities reserved in plan for notes/UI; not forced on search (too many false zeros)

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
          locations: pass.locations,
          // Only send keywords when this pass intends them — never dump full skill list
          keywords: pass.keywords,
          seniorities: pass.seniorities,
          per_page: limit,
          page: 1,
          auth: apolloAuth,
        });

        if (apolloRes.error && !apolloRes.people.length) {
          lastApolloError = apolloRes.error;
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
        if (!apolloSlice) apolloSlice = slice;
        else
          apolloSlice = {
            ...apolloSlice,
            results: apolloSlice.results + slice.results,
          };
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
          `Apollo ${pass.label}: ${apolloRes.people.length} returned · +${added} new`
        );
        passIdx++;

        // If first (broad) pass already filled the list, skip tighter/alt passes
        if (passIdx === 1 && candidates.length >= Math.min(5, limit)) break;
      }

      if (!candidates.length && lastApolloError) {
        notes.push(`Apollo had no people after broaden passes: ${lastApolloError}`);
      } else if (!candidates.filter((c) => c.source === 'apollo').length) {
        notes.push(
          'Apollo returned 0 people even after broader filters (titles+location). Try Anywhere, or a shorter title list.'
        );
      }
    } else {
      notes.push(
        'Apollo not configured — add company key in Settings or platform APOLLO_API_KEY'
      );
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
        keywords: keywords.slice(0, 6),
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
  // LLM-suggested /in/ URLs often 404 — strip direct profile links; UI uses Find on LinkedIn.
  const dbCount = candidates.filter(
    (c) => c.source === 'apollo' || c.source === 'pdl'
  ).length;

  if (dbCount >= Math.min(5, limit)) {
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

  const usageBreakdown = sumBreakdown({
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
      .filter((c) => c.engine !== 'apollo')
      .map((c) => ({
        engine: c.engine,
        results: c.count,
        estimatedUsd: c.estimatedCostUsd,
      })),
  });
  // Avoid double-counting engines already in llmUsd
  usageBreakdown.totalEstimatedUsd = estimatedCostUsd;
  const usageLine = formatBreakdownLine(usageBreakdown);

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
    toolsUsed: costs.map((c) => c.engine),
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

  // Quality filter: drop thin / placeholder / likely-hallucinated profiles
  const beforeQ = candidates.length;
  const ranked = filterAndRankByQuality(candidates, {
    minScore: 45,
    preferDbSources: true,
  });
  droppedLowQuality += beforeQ - ranked.length;
  if (droppedLowQuality > 0) {
    notes.push(
      `Quality filter removed ${droppedLowQuality} thin or suspicious profile(s)`
    );
  }

  const jobOut = { ...job, location: searchLocation || job.location };

  if (ranked.length === 0) {
    return {
      ok: false,
      job: jobOut,
      candidates: [],
      estimatedCostUsd,
      costs,
      usageBreakdown,
      usageLine,
      apolloPlan: plan,
      apolloPlanSource: planResult.source,
      notes,
      error:
        'No real candidates found. Use a careers job URL or a clear title (e.g. "Operations Manager"). Soft-skill JD text alone is not enough. Apollo returned no matches for this filter — try Anywhere or a different location.',
    };
  }

  const finalCandidates: SourcedCandidate[] = ranked
    .slice(0, limit)
    .map((c) => ({
      ...c,
      qualityScore: c.qualityScore,
      qualityFlags: c.qualityFlags,
      snippet:
        c.snippet ||
        (c.source === 'llm' || c.source === 'web'
          ? 'Verify on LinkedIn/Google before outreach'
          : undefined),
    }));

  return {
    ok: true,
    job: jobOut,
    candidates: finalCandidates,
    estimatedCostUsd,
    costs,
    usageBreakdown,
    usageLine,
    apolloPlan: plan,
    apolloPlanSource: planResult.source,
    notes,
  };
}
