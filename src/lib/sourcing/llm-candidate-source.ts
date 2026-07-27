/**
 * LLM-native candidate sourcing for a job req.
 * Uses Nova Web Grounding + AgentCore search + Haiku JSON extraction
 * so results are *people* (name/title/company/LinkedIn), not blog posts.
 *
 * @serverOnly
 */

import {
  BedrockRuntimeClient,
  ConverseCommand,
} from '@aws-sdk/client-bedrock-runtime';
import { completeJson } from '@/lib/list-builder/llm-json';
import {
  agentCoreWebSearch,
  isAgentCoreWebSearchConfigured,
} from '@/lib/agentcore/web-search';
import { logBedrockUsage, logAgentCoreWebSearchUsage } from '@/lib/aws/athena-bedrock';
import type { JobContext, SourcedCandidate } from './job-candidate-search';

const region =
  process.env.AWS_REGION ||
  process.env.NEXT_PUBLIC_AWS_REGION ||
  'us-east-1';

const client = new BedrockRuntimeClient({ region });

const NOVA_MODELS = [
  process.env.SOURCE_CANDIDATES_NOVA_MODEL,
  'us.amazon.nova-2-lite-v1:0',
  'us.amazon.nova-lite-v1:0',
  'amazon.nova-2-lite-v1:0',
  'amazon.nova-lite-v1:0',
].filter(Boolean) as string[];

const GROUNDING_USD = Number(
  process.env.SOURCE_CANDIDATES_NOVA_GROUNDING_USD || '0.01'
);

export type LlmSourceResult = {
  candidates: SourcedCandidate[];
  estimatedCostUsd: number;
  notes: string[];
  costs: Array<{ engine: string; estimatedCostUsd: number; count: number }>;
  tokenUsage?: {
    inputTokens: number;
    outputTokens: number;
    modelId?: string;
  };
};

/** Reject article titles / how-tos masquerading as people */
export function looksLikePersonName(name: string): boolean {
  const n = (name || '').trim();
  if (n.length < 4 || n.length > 80) return false;
  if (
    /resume examples|how to|careers|guide for|deep dive|examples &|with example|linkedin careers|open positions|sample teaching|job fit|pattern recognition|write an? |tips for|best practices|\d+\s+(finance|resume|ways)/i.test(
      n
    )
  ) {
    return false;
  }
  // Must have at least first + last (allow middle initial)
  const parts = n.replace(/[.,]/g, ' ').split(/\s+/).filter(Boolean);
  if (parts.length < 2 || parts.length > 5) return false;
  // Each part mostly letters
  if (!parts.every((p) => /^[A-Za-z][A-Za-z'.-]{0,30}$/.test(p))) return false;
  // Reject title-case product-y strings
  if (/^(the|a|an)\s/i.test(n)) return false;
  return true;
}

function parsePeopleJson(raw: unknown, source: SourcedCandidate['source']): SourcedCandidate[] {
  let arr: any[] = [];
  if (Array.isArray(raw)) arr = raw;
  else if (raw && typeof raw === 'object') {
    const o = raw as any;
    arr = o.candidates || o.people || o.results || [];
  }
  if (!Array.isArray(arr)) return [];

  const out: SourcedCandidate[] = [];
  for (let i = 0; i < arr.length; i++) {
    const r = arr[i] || {};
    const name = String(r.name || r.full_name || r.person || '').trim();
    if (!looksLikePersonName(name)) continue;
    const linkedinUrl = String(
      r.linkedinUrl || r.linkedin_url || r.linkedin || ''
    ).trim();
    const url = String(r.url || r.profile_url || r.profileUrl || '').trim();
    out.push({
      id: `llm-${source}-${i}-${name.slice(0, 12).replace(/\s/g, '')}`,
      name,
      title: r.title || r.job_title || r.role || undefined,
      company: r.company || r.organization || r.org || undefined,
      location: r.location || r.geo || undefined,
      email: r.email || undefined,
      phone: r.phone || undefined,
      linkedinUrl: linkedinUrl || undefined,
      url: url || linkedinUrl || undefined,
      snippet: r.snippet || r.why || r.rationale || r.reason || undefined,
      source,
    });
  }
  return out;
}

function extractJsonFromText(text: string): unknown {
  const m =
    text.match(/```(?:json)?\s*([\s\S]*?)```/i) ||
    text.match(/(\[[\s\S]*\])/);
  const raw = m ? m[1].trim() : text.trim();
  try {
    return JSON.parse(raw);
  } catch {
    // try to find array substring
    const start = text.indexOf('[');
    const end = text.lastIndexOf(']');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

async function novaPeopleGrounding(params: {
  job: JobContext;
  need: number;
  tenantId?: string | null;
  userId?: string | null;
}): Promise<{
  candidates: SourcedCandidate[];
  cost: number;
  note: string;
  inputTokens: number;
  outputTokens: number;
  modelId?: string;
}> {
  const job = params.job;
  const system = `You are a recruiting researcher with live web grounding.
Find REAL individual professionals (not job posts, not how-to articles, not company career pages)
who match the hiring need below. Prefer people with public LinkedIn or portfolio presence.

Return ONLY a JSON array (no markdown) of objects:
[
  {
    "name": "First Last",
    "title": "current or recent title",
    "company": "employer",
    "location": "city/region or Remote",
    "linkedin_url": "https://linkedin.com/in/..." or "",
    "url": "profile or public page",
    "why": "one sentence why they fit"
  }
]
Rules:
- Only real people names (First Last). Never article titles.
- Target ~${params.need} people.
- Prefer LinkedIn profile URLs when known.
- Do not invent emails or phones.`;

  const user = `Hiring need:
Title: ${job.title}
Location: ${job.location || 'flexible / remote ok'}
Company hiring: ${job.companyName || 'n/a'}
Keywords: ${job.keywords.slice(0, 10).join(', ') || 'n/a'}
Description excerpt: ${(job.description || '').slice(0, 1200)}

Search the live web for professionals who would be strong candidates for this role.
Return the JSON array only.`;

  let lastErr = '';
  for (const modelId of NOVA_MODELS) {
    try {
      const started = Date.now();
      const command = new ConverseCommand({
        modelId,
        system: [{ text: system }],
        messages: [{ role: 'user', content: [{ text: user }] }],
        inferenceConfig: { maxTokens: 4096, temperature: 0.25 },
        toolConfig: {
          tools: [{ systemTool: { name: 'nova_grounding' } } as any],
        } as any,
      });
      const response = await client.send(command);
      const parts = (response.output?.message?.content || []) as any[];
      let text = '';
      for (const b of parts) {
        if (typeof b?.text === 'string') text += b.text + '\n';
      }
      const usage = response.usage || ({} as any);
      const inputTokens = Number(usage.inputTokens || 0);
      const outputTokens = Number(usage.outputTokens || 0);
      const tokenCost =
        (inputTokens / 1e6) * 0.06 + (outputTokens / 1e6) * 0.24; // rough nova-ish
      const cost = GROUNDING_USD + tokenCost;

      void logBedrockUsage({
        modelId: `nova-grounding:${modelId}`,
        inputTokens,
        outputTokens,
        queryPreview: `[Source Candidates] nova: ${job.title}`.slice(0, 200),
        toolsUsed: ['source_candidates', 'nova_grounding'],
        latencyMs: Date.now() - started,
        tenantId: params.tenantId || undefined,
        userId: params.userId || undefined,
        provider: 'bedrock',
        estimatedCostUsd: cost,
      }).catch(() => {});

      const parsed = extractJsonFromText(text);
      const people = parsePeopleJson(parsed, 'llm');
      // tag as nova-sourced llm
      for (const p of people) {
        p.source = 'llm';
        p.snippet = p.snippet || 'Discovered via Nova web grounding';
      }
      if (people.length) {
        return {
          candidates: people,
          cost,
          note: `Nova grounding: ${people.length} people (${modelId})`,
          inputTokens,
          outputTokens,
          modelId,
        };
      }
      lastErr = `Nova returned no parseable people (text ${text.length} chars)`;
    } catch (err: any) {
      lastErr = err?.message || String(err);
      console.warn('[llm-candidate-source] nova', modelId, lastErr);
    }
  }
  return {
    candidates: [],
    cost: 0,
    note: `Nova grounding: ${lastErr || 'no results'}`,
    inputTokens: 0,
    outputTokens: 0,
  };
}

async function agentCoreThenExtract(params: {
  job: JobContext;
  need: number;
  tenantId?: string | null;
  userId?: string | null;
}): Promise<{
  candidates: SourcedCandidate[];
  cost: number;
  note: string;
}> {
  if (!isAgentCoreWebSearchConfigured()) {
    return {
      candidates: [],
      cost: 0,
      note: 'AgentCore web not configured',
    };
  }

  const job = params.job;
  const loc = job.location || 'United States';
  const queries = [
    `"${job.title}" "${loc}" site:linkedin.com/in`,
    `${job.title} ${loc} LinkedIn profile -jobs -hiring -careers`,
    `${job.keywords.slice(0, 3).join(' ')} ${job.title} professional LinkedIn`.slice(
      0,
      200
    ),
  ].map((q) => q.slice(0, 200));

  const snippets: string[] = [];
  let webCost = 0;
  let webHits = 0;

  for (const q of queries.slice(0, 3)) {
    const res = await agentCoreWebSearch({ query: q, maxResults: 10 });
    if (res.ok) {
      webCost += res.estimatedCostUsd;
      webHits += res.results.length;
      void logAgentCoreWebSearchUsage({
        resultsCount: res.results.length,
        estimatedCost: res.estimatedCostUsd,
        queryPreview: q,
        latencyMs: res.latencyMs,
        tenantId: params.tenantId || undefined,
        userId: params.userId || undefined,
      }).catch(() => {});
      for (const h of res.results) {
        snippets.push(
          `TITLE: ${h.title || ''}\nURL: ${h.url || ''}\nSNIPPET: ${(h.text || '').slice(0, 400)}`
        );
      }
    }
  }

  if (!snippets.length) {
    return {
      candidates: [],
      cost: webCost,
      note: 'AgentCore web: 0 usable snippets',
    };
  }

  const system = `You extract REAL people (professionals) from web search snippets for recruiting.
Return ONLY a JSON array of people objects:
[{"name":"First Last","title":"...","company":"...","location":"...","linkedin_url":"https://linkedin.com/in/...","url":"...","why":"..."}]
Rules:
- Only include entries that are clearly individual people (First Last names).
- Skip articles, job postings, career pages, "resume examples", how-to guides.
- Prefer linkedin.com/in/ URLs.
- If a snippet only mentions a company or blog, skip it.
- Max ${params.need} people.`;

  const user = `Job to fill: ${job.title} · ${loc}
Keywords: ${job.keywords.slice(0, 8).join(', ')}

Web search results:
${snippets.slice(0, 24).join('\n---\n')}`;

  const { data, error } = await completeJson<unknown>(system, user, {
    tenantId: params.tenantId || undefined,
    userId: params.userId || undefined,
    purpose: 'source-candidates-extract',
    queryPreview: job.title,
  });

  // estimate haiku cost ~$0.001–0.01; completeJson already logged tokens
  const llmCost = 0.005;
  const people = parsePeopleJson(data, 'llm');
  for (const p of people) {
    p.snippet = p.snippet || 'Extracted from public web via LLM';
  }

  return {
    candidates: people,
    cost: webCost + llmCost,
    note: error
      ? `AgentCore+LLM extract: ${error} (${webHits} hits, $${webCost.toFixed(4)} web)`
      : `AgentCore+LLM extract: ${people.length} people from ${webHits} hits`,
  };
}

/**
 * Direct LLM path: always try to produce person-shaped candidates.
 */
export async function llmSourceCandidates(params: {
  job: JobContext;
  limit?: number;
  tenantId?: string | null;
  userId?: string | null;
}): Promise<LlmSourceResult> {
  const need = Math.min(Math.max(params.limit || 12, 5), 20);
  const notes: string[] = [];
  const costs: LlmSourceResult['costs'] = [];
  let estimatedCostUsd = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let modelId: string | undefined;
  const all: SourcedCandidate[] = [];
  const seen = new Set<string>();

  const addAll = (list: SourcedCandidate[]) => {
    for (const c of list) {
      if (!looksLikePersonName(c.name)) continue;
      const key = (
        c.linkedinUrl ||
        c.email ||
        `${c.name}|${c.company || ''}`
      )
        .toLowerCase()
        .trim();
      if (seen.has(key)) continue;
      seen.add(key);
      all.push(c);
    }
  };

  // 1) Nova grounded people search (best LLM+web combo)
  const nova = await novaPeopleGrounding({
    job: params.job,
    need,
    tenantId: params.tenantId,
    userId: params.userId,
  });
  notes.push(nova.note);
  inputTokens += nova.inputTokens || 0;
  outputTokens += nova.outputTokens || 0;
  if (nova.modelId) modelId = nova.modelId;
  if (nova.cost > 0) {
    costs.push({
      engine: 'nova-grounding',
      estimatedCostUsd: nova.cost,
      count: nova.candidates.length,
    });
    estimatedCostUsd += nova.cost;
  }
  addAll(nova.candidates);

  // 2) AgentCore + Haiku extract if still thin
  if (all.length < Math.min(6, need)) {
    const ac = await agentCoreThenExtract({
      job: params.job,
      need,
      tenantId: params.tenantId,
      userId: params.userId,
    });
    notes.push(ac.note);
    if (ac.cost > 0) {
      costs.push({
        engine: 'agentcore+llm',
        estimatedCostUsd: ac.cost,
        count: ac.candidates.length,
      });
      estimatedCostUsd += ac.cost;
    }
    addAll(ac.candidates);
  }

  // Pure LLM "invent names" fallback is intentionally DISABLED.
  // Invented people (James Richardson @ Advanced Metal Fabrication, etc.)
  // fail LinkedIn search and waste recruiter time. Only keep people from
  // grounded web/Nova extracts that include a real profile or employer signal.

  // Keep only candidates with a LinkedIn /in/ URL or a non-placeholder company
  const verified = all.filter((c) => {
    const li = (c.linkedinUrl || c.url || '').toLowerCase();
    if (/linkedin\.com\/in\/[a-z0-9_-]{3,}/i.test(li)) return true;
    const co = (c.company || '').trim();
    if (co.length >= 3 && !/fabrication inc|components manufacturing|precision dynamics/i.test(co)) {
      // still weak without Apollo — require linkedin for web path
      return false;
    }
    return false;
  });

  if (all.length && !verified.length) {
    notes.push(
      `Dropped ${all.length} web/LLM names without verifiable LinkedIn profile URLs`
    );
  }

  return {
    candidates: verified.slice(0, need),
    estimatedCostUsd,
    notes,
    costs,
    tokenUsage: {
      inputTokens,
      outputTokens,
      modelId,
    },
  };
}
