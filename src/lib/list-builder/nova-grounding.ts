/**
 * List Builder discovery via Amazon Nova Web Grounding (Bedrock Converse).
 *
 * Agent-style batch search:
 *  - Round 1: grounded search for companies in market
 *  - Round 2 (optional): follow-up for more specialty firms excluding known names
 *  - Citations supply real domains; JSON supplies structured company rows
 *
 * Usage is logged to DynamoDB via logBedrockUsage (AI Usage dashboard).
 * @serverOnly
 */

import {
  BedrockRuntimeClient,
  ConverseCommand,
} from '@aws-sdk/client-bedrock-runtime';
import { logBedrockUsage } from '@/lib/aws/athena-bedrock';
import { parseJsonFromText } from './grok-search';
import type { DiscoverCandidate } from './discover-sources';

const region =
  process.env.AWS_REGION ||
  process.env.NEXT_PUBLIC_AWS_REGION ||
  'us-east-1';

const client = new BedrockRuntimeClient({
  region,
  // Grounding can take a while
  requestHandler: undefined,
});

/** Prefer Nova 2 Lite (grounding-capable CRIS); fall back to other US Nova IDs. */
export const LIST_BUILDER_NOVA_MODELS = [
  process.env.LIST_BUILDER_NOVA_MODEL,
  'us.amazon.nova-2-lite-v1:0',
  'us.amazon.nova-lite-v1:0',
  'amazon.nova-2-lite-v1:0',
  'amazon.nova-lite-v1:0',
  'us.amazon.nova-pro-v1:0',
].filter(Boolean) as string[];

/**
 * Rough add-on for web grounding (token cost still logged separately).
 * Override with LIST_BUILDER_NOVA_GROUNDING_USD_PER_CALL.
 * AWS bills grounding as an additional Bedrock charge — confirm in console.
 */
const GROUNDING_USD_PER_CALL = Number(
  process.env.LIST_BUILDER_NOVA_GROUNDING_USD_PER_CALL || '0.01'
);

export type NovaGroundingUsage = {
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  estimatedTokenCost: number;
  estimatedGroundingCost: number;
  estimatedTotalCost: number;
  groundingCalls: number;
  rounds: number;
};

export type NovaDiscoverResult = {
  candidates: DiscoverCandidate[];
  text: string;
  citationUrls: string[];
  usage: NovaGroundingUsage;
  error?: string;
};

function extractTextAndUrls(content: any[] | undefined): {
  text: string;
  urls: string[];
} {
  const urls: string[] = [];
  let text = '';
  if (!Array.isArray(content)) return { text: '', urls: [] };

  for (const block of content) {
    if (!block || typeof block !== 'object') continue;
    if (typeof block.text === 'string') {
      text += (text ? '\n' : '') + block.text;
    }
    // SDK may nest citations differently across versions
    const cites =
      block.citationsContent?.citations ||
      block.citations ||
      block.citation ||
      [];
    const citeList = Array.isArray(cites) ? cites : [cites];
    for (const c of citeList) {
      const url =
        c?.location?.web?.url ||
        c?.web?.url ||
        c?.url ||
        c?.source?.url;
      if (typeof url === 'string' && url.startsWith('http')) {
        urls.push(url);
      }
    }
    // citationsContent as array of { citations: [...] }
    if (Array.isArray(block.citationsContent)) {
      for (const cc of block.citationsContent) {
        const inner = cc?.citations || [];
        for (const c of inner) {
          const url = c?.location?.web?.url || c?.url;
          if (typeof url === 'string' && url.startsWith('http')) urls.push(url);
        }
      }
    }
  }
  return { text: text.trim(), urls: [...new Set(urls)] };
}

function domainToCompanyGuess(url: string): DiscoverCandidate | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '').toLowerCase();
    if (
      /linkedin|facebook|yelp|wikipedia|google|bing|youtube|instagram|twitter|x\.com|bloomberg|crunchbase|zoominfo|apollo|bbb\.org|yellowpages|mapquest|apple\.com|microsoft/i.test(
        host
      )
    ) {
      return null;
    }
    const base = host.split('.')[0] || host;
    if (base.length < 3) return null;
    const name = base
      .replace(/[-_]+/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
    return {
      companyName: name,
      website: `https://${host}`,
      source: 'nova-grounding',
    };
  } catch {
    return null;
  }
}

function mapRows(rows: any[], source: DiscoverCandidate['source']): DiscoverCandidate[] {
  const out: DiscoverCandidate[] = [];
  if (!Array.isArray(rows)) return out;
  for (const x of rows) {
    if (!x || typeof x !== 'object') continue;
    const companyName = String(
      x.companyName || x.name || x.company || ''
    ).trim();
    if (!companyName) continue;
    const website = x.website || x.url || x.domain || x.site;
    out.push({
      companyName,
      website: website ? String(website).trim() : undefined,
      city: x.city ? String(x.city).trim() : undefined,
      state: x.state ? String(x.state).trim() : undefined,
      phone: x.phone ? String(x.phone).trim() : undefined,
      email: x.email ? String(x.email).trim() : undefined,
      industry: x.industry ? String(x.industry).trim() : undefined,
      source,
    });
  }
  return out;
}

/** Rough token cost (mirrors dashboard heuristics for Nova). */
function estimateTokenCost(
  modelId: string,
  inputTokens: number,
  outputTokens: number
): number {
  const lower = modelId.toLowerCase();
  // Nova Lite ~ $0.06 / $0.24 per 1M (approx); Pro higher
  let inPer1k = 0.00006;
  let outPer1k = 0.00024;
  if (lower.includes('pro')) {
    inPer1k = 0.0008;
    outPer1k = 0.0032;
  }
  return (inputTokens / 1000) * inPer1k + (outputTokens / 1000) * outPer1k;
}

async function converseWithGrounding(params: {
  modelId: string;
  system: string;
  user: string;
  maxTokens?: number;
}): Promise<{
  text: string;
  urls: string[];
  inputTokens: number;
  outputTokens: number;
  modelId: string;
}> {
  const command = new ConverseCommand({
    modelId: params.modelId,
    system: [{ text: params.system }],
    messages: [
      {
        role: 'user',
        content: [{ text: params.user }],
      },
    ],
    inferenceConfig: {
      maxTokens: params.maxTokens ?? 4096,
      temperature: 0.2,
    },
    // Nova Web Grounding — built-in system tool (not a custom toolSpec)
    toolConfig: {
      tools: [
        {
          systemTool: {
            name: 'nova_grounding',
          },
        } as any,
      ],
    } as any,
  });

  const response = await client.send(command);
  const content = response.output?.message?.content as any[] | undefined;
  const { text, urls } = extractTextAndUrls(content);
  const usage = response.usage || ({} as any);
  return {
    text,
    urls,
    inputTokens: Number(usage.inputTokens || usage.input_tokens || 0),
    outputTokens: Number(usage.outputTokens || usage.output_tokens || 0),
    modelId: params.modelId,
  };
}

/**
 * Multi-round agent-style grounded discovery for one list-builder tick.
 */
export async function novaGroundingDiscoverBatch(params: {
  brief: string;
  targetGeo: string;
  keywords: string[];
  focusCity: string;
  focusKw: string;
  need: number;
  excludeNames: string[];
  batch: number;
  already: number;
  target: number;
  /** Max grounding rounds this tick (default 2) */
  maxRounds?: number;
  tenantId?: string;
  userId?: string;
  jobId?: string;
  preferenceMemory?: string;
}): Promise<NovaDiscoverResult> {
  const maxRounds = Math.min(Math.max(params.maxRounds ?? 2, 1), 3);
  const need = Math.min(Math.max(params.need, 4), 16);
  const excludeList =
    params.excludeNames.slice(0, 80).join(', ') || '(none yet)';
  const industry =
    params.keywords.slice(0, 10).join(', ') || 'construction contractors';

  const system = `You are a B2B research agent for a recruiting CRM (list builder).
Use web grounding to find REAL companies operating in or near ${params.targetGeo}, Florida.

Return a JSON array ONLY (no markdown prose outside JSON). Each object:
{"companyName":"...","website":"https://...","city":"...","state":"FL","industry":"...","phone":"...","email":"..."}

Rules:
- Prefer companies with a public website and ideally a phone or email on the open web
- Include general contractors AND specialty trades (electrical, mechanical, roofing, concrete, civil, remodeling) matching: ${industry}
- South Florida market OK (Palm Beach, Broward, Miami-Dade) when relevant to the brief
- NEVER invent phone/email — omit if not found in sources
- website should be the company official domain when known
- Do not repeat: ${excludeList}
- Max ${need} companies this response
${params.preferenceMemory ? `- Honor recruiter preference memory. Do not repeat rejected kinds of firms.` : ''}`;

  let allCandidates: DiscoverCandidate[] = [];
  let allUrls: string[] = [];
  let allText = '';
  let totalIn = 0;
  let totalOut = 0;
  let usedModel = LIST_BUILDER_NOVA_MODELS[0];
  let groundingCalls = 0;
  let roundsDone = 0;
  const started = Date.now();
  let lastError: string | undefined;

  for (let round = 1; round <= maxRounds; round++) {
    const alreadyNames = allCandidates.map((c) => c.companyName);
    const exclude =
      [...params.excludeNames, ...alreadyNames].slice(0, 80).join(', ') ||
      '(none yet)';
    const remaining = Math.max(need - allCandidates.length, 4);

    const user =
      round === 1
        ? `User brief: ${params.brief}

Location: ${params.targetGeo}, Florida
Batch #${params.batch} focus: ${params.focusKw} near ${params.focusCity}
Progress: ${params.already}/${params.target} usable leads already kept.

Search the web and return up to ${need} NEW companies as a JSON array.
Emphasize ${params.focusKw} firms with contact info or company websites.${
            params.preferenceMemory ? `\n\n${params.preferenceMemory}` : ''
          }`
        : `Follow-up search (round ${round}): we still need more companies.

Already have: ${alreadyNames.slice(0, 40).join(', ') || 'none'}
Exclude: ${exclude}

Find ${remaining} ADDITIONAL ${params.focusKw} / specialty construction firms near ${params.focusCity}, ${params.targetGeo} not already listed.
JSON array only.`;

    let roundOk = false;
    for (const modelId of LIST_BUILDER_NOVA_MODELS) {
      try {
        const result = await converseWithGrounding({
          modelId,
          system,
          user,
          maxTokens: 4096,
        });
        usedModel = result.modelId;
        totalIn += result.inputTokens || Math.ceil((system + user).length / 4);
        totalOut +=
          result.outputTokens || Math.ceil((result.text || '').length / 4);
        groundingCalls += 1;
        roundsDone = round;
        allText += (allText ? '\n\n' : '') + result.text;
        allUrls.push(...result.urls);

        const parsed = parseJsonFromText<any[]>(result.text);
        if (Array.isArray(parsed.data)) {
          allCandidates.push(
            ...mapRows(parsed.data, 'nova-grounding')
          );
        }
        // Citation domains as soft candidates
        for (const url of result.urls) {
          const guess = domainToCompanyGuess(url);
          if (guess) allCandidates.push(guess);
        }

        roundOk = true;

        // Usage log per round (shows in AI Usage dashboard)
        const tokenCost = estimateTokenCost(
          usedModel,
          result.inputTokens || 0,
          result.outputTokens || 0
        );
        try {
          await logBedrockUsage({
            modelId: usedModel,
            inputTokens: result.inputTokens || 0,
            outputTokens: result.outputTokens || 0,
            queryPreview: `[List Builder Nova Grounding r${round}] ${params.targetGeo}: ${params.brief}`.slice(
              0,
              200
            ),
            toolsUsed: [
              'list-builder',
              'nova-grounding',
              'discover-agent',
              `round-${round}`,
              params.jobId ? `job=${params.jobId}` : 'job=unknown',
            ],
            latencyMs: Date.now() - started,
            tenantId: params.tenantId,
            userId: params.userId,
            provider: 'bedrock-nova-grounding',
          });
        } catch {
          /* never block */
        }

        console.log(
          '[list-builder/nova-grounding]',
          `round=${round}`,
          `model=${usedModel}`,
          `in=${result.inputTokens}`,
          `out=${result.outputTokens}`,
          `urls=${result.urls.length}`,
          `rows≈${Array.isArray(parsed.data) ? parsed.data.length : 0}`,
          `tokenCost≈$${tokenCost.toFixed(4)}`,
          `groundingAddOn≈$${GROUNDING_USD_PER_CALL.toFixed(4)}`
        );
        break;
      } catch (err: any) {
        lastError = err?.message || String(err);
        console.warn(
          '[list-builder/nova-grounding] model failed',
          modelId,
          lastError
        );
        // Try next model
        continue;
      }
    }

    if (!roundOk) {
      break;
    }
    // Enough structured candidates — skip extra grounding cost
    if (allCandidates.length >= need) break;
  }

  // Dedupe by name/domain
  const seen = new Set<string>();
  const deduped: DiscoverCandidate[] = [];
  for (const c of allCandidates) {
    const key = (c.companyName || '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
    const d = (c.website || '')
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .split('/')[0];
    const k = key || d;
    if (!k || seen.has(k)) continue;
    if (d && seen.has(d)) continue;
    seen.add(k);
    if (d) seen.add(d);
    deduped.push(c);
  }

  const tokenCost = estimateTokenCost(usedModel, totalIn, totalOut);
  const groundingCost = groundingCalls * GROUNDING_USD_PER_CALL;
  const usage: NovaGroundingUsage = {
    modelId: usedModel,
    inputTokens: totalIn,
    outputTokens: totalOut,
    latencyMs: Date.now() - started,
    estimatedTokenCost: tokenCost,
    estimatedGroundingCost: groundingCost,
    estimatedTotalCost: tokenCost + groundingCost,
    groundingCalls,
    rounds: roundsDone,
  };

  if (deduped.length === 0 && lastError) {
    return {
      candidates: [],
      text: allText,
      citationUrls: [...new Set(allUrls)],
      usage,
      error: lastError,
    };
  }

  return {
    candidates: deduped.slice(0, need * 3),
    text: allText,
    citationUrls: [...new Set(allUrls)],
    usage,
  };
}
