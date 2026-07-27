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
  notes: string[];
  error?: string;
};

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

  // 3) Free-text brief (not a URL)
  if (input && !input.includes('http') && !input.includes('/careers/')) {
    const titleGuess =
      input.split(/[–—\-|]/)[0]?.trim().slice(0, 80) || input.slice(0, 80);
    return {
      title: titleGuess,
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
  let searchLocation: string | undefined;
  if (params.location === '') {
    searchLocation = undefined;
    notes.push('Location filter: off (worldwide)');
  } else if (params.location != null && String(params.location).trim()) {
    searchLocation = String(params.location).trim();
    notes.push(`Location filter: ${searchLocation}`);
  } else if (job.location) {
    searchLocation = job.location;
    notes.push(`Location filter: ${searchLocation} (from job)`);
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

  const titles = [job.title].filter(Boolean);
  const locations = searchLocation ? [searchLocation] : [];
  const keywords = job.keywords.slice(0, 8);

  // --- 1) Apollo (tenant BYOK or platform) ---
  const apolloAuth = params.tenantId
    ? { tenantId: params.tenantId }
    : undefined;
  try {
    if (await resolveApolloConfigured(apolloAuth)) {
      const apolloRes = await apolloSearchPeople({
        q: [job.title, job.location, keywords.slice(0, 4).join(' ')]
          .filter(Boolean)
          .join(' '),
        titles,
        locations,
        keywords: keywords.slice(0, 6),
        per_page: limit,
        page: 1,
        auth: apolloAuth,
      });
      if (apolloRes.error && !apolloRes.people.length) {
        notes.push(`Apollo: ${apolloRes.error}`);
      } else {
        for (let i = 0; i < apolloRes.people.length; i++) {
          add(mapApollo(apolloRes.people[i], i));
        }
        apolloSlice = buildApolloSearchSlice({
          results: apolloRes.people.length,
          endpoint: 'mixed_people/api_search',
        });
        estimatedCostUsd += apolloSlice.estimatedUsd;
        costs.push({
          engine: 'apollo',
          estimatedCostUsd: apolloSlice.estimatedUsd,
          count: apolloRes.people.length,
        });
        void logApolloUsage({
          modelId: 'apollo-source-for-job',
          resultsCount: apolloRes.people.length,
          estimatedCost: apolloSlice.estimatedUsd,
          credits: apolloSlice.credits,
          endpoint: apolloSlice.endpoint,
          queryPreview: job.title,
          tenantId: params.tenantId || undefined,
          userId: params.userId || undefined,
          surface: 'fill-job',
        }).catch(() => {});
        notes.push(
          `Apollo: ${apolloRes.people.length} people · ${apolloSlice.credits} credits · $${apolloSlice.estimatedUsd.toFixed(4)}`
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

  // --- 3) LLM only if Apollo/PDL did not yield enough *quality* people
  // (reduces fake/hallucinated LinkedIn-looking profiles)
  const preferSkipLlm =
    params.preferApolloOnlyWhenEnough !== false &&
    candidates.filter((c) => c.source === 'apollo' || c.source === 'pdl')
      .length >= Math.min(6, limit);

  if (preferSkipLlm) {
    notes.push(
      'Skipped LLM path — enough database matches (reduces fake profiles)'
    );
  } else if (candidates.length < Math.min(8, limit)) {
    try {
      const jobForLlm = {
        ...job,
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
        // Treat nova-grounding / agentcore+llm / llm-fallback as LLM-side spend
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
      for (const p of llm.candidates) add(p);
      notes.push(
        `LLM sourcing: ${llm.candidates.length} people · ~$${llmUsd.toFixed(4)}`
      );
    } catch (err: any) {
      notes.push(`LLM sourcing error: ${err?.message || err}`);
    }
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
      notes,
      error:
        'No quality candidates found. Try another location, broaden location (leave blank), or check Apollo results.',
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
    notes,
  };
}
