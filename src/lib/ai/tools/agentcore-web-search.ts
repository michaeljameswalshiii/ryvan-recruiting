/**
 * AI tool: AgentCore Web Search (public web / resume research)
 * @serverOnly
 */

import type { ToolContext, ToolParams, ToolResult } from './types';
import {
  agentCoreWebSearch,
  agentCoreWebSearchCostPerQuery,
  buildResumeResearchQueries,
  isAgentCoreWebSearchConfigured,
  agentCoreWebSearchStatus,
} from '@/lib/agentcore/web-search';
import { logAgentCoreWebSearchUsage } from '@/lib/aws/athena-bedrock';

export const AGENTCORE_WEB_SEARCH_TOOL_NAME = 'web_search';
export const AGENTCORE_WEB_SEARCH_TOOL_DESCRIPTION =
  'Search the live public web via Amazon Bedrock AgentCore (AWS-resident). ' +
  'Best for researching a person or company, finding public resumes, LinkedIn/GitHub/personal sites, ' +
  'news mentions, and citations. Not a people database (no emails/phones). ' +
  'Always cite title + URL in your answer. Cost ~$0.007 per query.';

export interface AgentCoreWebSearchToolData {
  results: Array<{
    title?: string;
    url?: string;
    snippet?: string;
    publishedDate?: string;
  }>;
  count: number;
  query: string;
  estimatedCostUsd: number;
  costPerQueryUsd: number;
  queriesRun: number;
  latencyMs: number;
  source: 'agentcore-web-search';
  citationsRequired: true;
  note?: string;
}

function recordSpend(
  context: ToolContext,
  entry: {
    tool: string;
    estimatedCostUsd: number;
    queries: number;
    label?: string;
  }
) {
  if (!context.toolSpend) context.toolSpend = [];
  context.toolSpend.push(entry);
}

/**
 * Execute web_search tool.
 * params:
 *   query — main search (required unless purpose=resume_research with person/brief)
 *   max_results — 1–25 (default 10)
 *   purpose — general | resume_research | person_research
 *   multi — if true (default for resume_research), run up to 3 focused queries
 */
export async function executeAgentCoreWebSearch(
  params: ToolParams,
  context: ToolContext
): Promise<ToolResult> {
  const p = (params || {}) as Record<string, unknown>;
  const purpose = String(p.purpose || p.mode || 'general')
    .toLowerCase()
    .trim();
  const isResume =
    purpose.includes('resume') ||
    purpose.includes('person') ||
    purpose === 'public_footprint';

  let query = String(p.query || p.q || '').trim();
  if (!query && p.person) {
    query = String(p.person);
    if (p.company) query += ` ${p.company}`;
    if (p.title) query += ` ${p.title}`;
  }
  if (!query && p.brief) query = String(p.brief);

  if (!query) {
    return {
      success: false,
      error:
        'query is required (e.g. person name + role, or "Jane Doe Python engineer Miami resume")',
    };
  }

  if (!isAgentCoreWebSearchConfigured()) {
    const st = agentCoreWebSearchStatus();
    return {
      success: false,
      error: st.message,
      data: {
        configured: false,
        costPerQueryUsd: st.costPerQueryUsd,
      },
    };
  }

  const maxResults = Math.min(
    25,
    Math.max(1, Number(p.max_results ?? p.maxResults ?? 10) || 10)
  );

  const multiDefault = isResume;
  const multi =
    p.multi === true ||
    p.multi === 'true' ||
    (multiDefault && p.multi !== false && p.multi !== 'false');

  const queries = multi
    ? buildResumeResearchQueries(query).slice(0, 3)
    : [query.slice(0, 200)];

  const allHits: AgentCoreWebSearchToolData['results'] = [];
  const seen = new Set<string>();
  let totalCost = 0;
  let totalLatency = 0;
  let queriesRun = 0;
  let lastError: string | undefined;

  for (const q of queries) {
    const res = await agentCoreWebSearch({ query: q, maxResults });
    totalLatency += res.latencyMs;
    if (res.ok) {
      queriesRun += 1;
      totalCost += res.estimatedCostUsd;
      for (const h of res.results) {
        const key = (h.url || h.title || h.text || '').toLowerCase();
        if (!key || seen.has(key)) continue;
        seen.add(key);
        allHits.push({
          title: h.title,
          url: h.url,
          snippet: h.text,
          publishedDate: h.publishedDate,
        });
      }
      // Log each successful billed query
      void logAgentCoreWebSearchUsage({
        resultsCount: res.results.length,
        estimatedCost: res.estimatedCostUsd,
        queryPreview: q,
        latencyMs: res.latencyMs,
        tenantId: context.tenantId || undefined,
        userId: context.userId || undefined,
      }).catch(() => {});
    } else {
      lastError = res.error;
      // If first query fails hard (auth), stop
      if (
        res.error?.includes('403') ||
        res.error?.includes('401') ||
        res.error?.includes('not configured')
      ) {
        break;
      }
    }
  }

  recordSpend(context, {
    tool: AGENTCORE_WEB_SEARCH_TOOL_NAME,
    estimatedCostUsd: totalCost,
    queries: queriesRun,
    label: isResume ? 'resume/person research' : 'web search',
  });

  if (allHits.length === 0) {
    return {
      success: false,
      error:
        lastError ||
        'No public web results. Try a more specific name + company/title, or check AgentCore Gateway config.',
      data: {
        results: [],
        count: 0,
        query,
        estimatedCostUsd: totalCost,
        costPerQueryUsd: agentCoreWebSearchCostPerQuery(),
        queriesRun,
        latencyMs: totalLatency,
        source: 'agentcore-web-search',
        citationsRequired: true,
      } satisfies AgentCoreWebSearchToolData,
    };
  }

  const data: AgentCoreWebSearchToolData = {
    results: allHits.slice(0, maxResults * (multi ? 2 : 1)),
    count: allHits.length,
    query,
    estimatedCostUsd: totalCost,
    costPerQueryUsd: agentCoreWebSearchCostPerQuery(),
    queriesRun,
    latencyMs: totalLatency,
    source: 'agentcore-web-search',
    citationsRequired: true,
    note: isResume
      ? 'Public web only — not a people database. Cite URLs. For emails/phones use Apollo or PDL when enabled.'
      : 'Cite source titles and URLs in your answer (AgentCore acceptable use).',
  };

  return {
    success: true,
    data,
    metadata: {
      estimatedCostUsd: totalCost,
      queriesRun,
      source: 'agentcore-web-search',
    },
  };
}

export function formatAgentCoreWebSearchForModel(
  data: AgentCoreWebSearchToolData
): string {
  const lines = data.results.map((r, i) => {
    const parts = [
      `${i + 1}. ${r.title || 'Untitled'}`,
      r.url ? `   URL: ${r.url}` : null,
      r.publishedDate ? `   Date: ${r.publishedDate}` : null,
      r.snippet ? `   ${r.snippet.slice(0, 500)}` : null,
    ].filter(Boolean);
    return parts.join('\n');
  });

  return [
    `AgentCore Web Search — ${data.count} hit(s) for "${data.query}"`,
    `Cost: ~$${data.estimatedCostUsd.toFixed(4)} (${data.queriesRun} quer${data.queriesRun === 1 ? 'y' : 'ies'} × ~$${data.costPerQueryUsd.toFixed(4)})`,
    data.note || '',
    '',
    ...lines,
    '',
    'IMPORTANT: Include source titles and clickable URLs when summarizing for the user.',
  ]
    .filter((x) => x !== '')
    .join('\n');
}
