/**
 * Amazon Bedrock AgentCore Web Search (managed public web index).
 *
 * Invokes the Web Search connector via AgentCore Gateway (MCP tools/call).
 * Cost: ~$7 / 1,000 queries (override with AGENTCORE_WEB_SEARCH_USD_PER_QUERY).
 *
 * Env:
 *   AGENTCORE_GATEWAY_URL  — full MCP URL
 *     e.g. https://gateway-xxxx.gateway.bedrock-agentcore.us-east-1.amazonaws.com/mcp
 *   AGENTCORE_GATEWAY_ID   — alternative: builds URL in us-east-1
 *   AGENTCORE_WEB_SEARCH_TOOL_NAME — MCP tool name (default WebSearch)
 *   AGENTCORE_WEB_SEARCH_USD_PER_QUERY — default 0.007
 *   AGENTCORE_WEB_SEARCH_DISABLED=true — force off
 *
 * IAM (caller): bedrock-agentcore:InvokeGateway on the gateway ARN
 * Gateway role: bedrock-agentcore:InvokeWebSearch on
 *   arn:aws:bedrock-agentcore:us-east-1:aws:tool/web-search.v1
 *
 * @serverOnly
 */

import { SignatureV4 } from '@smithy/signature-v4';
import { HttpRequest } from '@smithy/protocol-http';
import { Sha256 } from '@aws-crypto/sha256-js';
import { defaultProvider } from '@aws-sdk/credential-provider-node';

const region =
  process.env.AGENTCORE_REGION ||
  process.env.AWS_REGION ||
  process.env.NEXT_PUBLIC_AWS_REGION ||
  'us-east-1';

/** AWS list price ~$7 / 1k queries */
export const AGENTCORE_WEB_SEARCH_DEFAULT_USD = 0.007;

export type AgentCoreWebHit = {
  title?: string;
  url?: string;
  text?: string;
  publishedDate?: string;
};

export type AgentCoreWebSearchResult = {
  ok: boolean;
  results: AgentCoreWebHit[];
  query: string;
  latencyMs: number;
  estimatedCostUsd: number;
  source: 'agentcore-web-search';
  error?: string;
  configured: boolean;
  rawPreview?: string;
};

export function agentCoreWebSearchCostPerQuery(): number {
  const n = Number(process.env.AGENTCORE_WEB_SEARCH_USD_PER_QUERY);
  if (Number.isFinite(n) && n >= 0) return n;
  return AGENTCORE_WEB_SEARCH_DEFAULT_USD;
}

export function getAgentCoreGatewayUrl(): string | null {
  const explicit = (process.env.AGENTCORE_GATEWAY_URL || '').trim();
  if (explicit) return explicit.replace(/\/$/, '');

  const id = (process.env.AGENTCORE_GATEWAY_ID || '').trim();
  if (id) {
    // Accept bare id or full gateway- prefix
    const hostId = id.startsWith('gateway-') ? id : `gateway-${id}`;
    return `https://${hostId}.gateway.bedrock-agentcore.${region}.amazonaws.com/mcp`;
  }
  return null;
}

export function isAgentCoreWebSearchConfigured(): boolean {
  if (
    process.env.AGENTCORE_WEB_SEARCH_DISABLED === '1' ||
    process.env.AGENTCORE_WEB_SEARCH_DISABLED === 'true'
  ) {
    return false;
  }
  return !!getAgentCoreGatewayUrl();
}

export function agentCoreWebSearchStatus(): {
  configured: boolean;
  region: string;
  gatewayUrl?: string;
  costPerQueryUsd: number;
  toolName: string;
  message: string;
} {
  const url = getAgentCoreGatewayUrl();
  const toolName =
    (process.env.AGENTCORE_WEB_SEARCH_TOOL_NAME || 'WebSearch').trim() ||
    'WebSearch';
  if (!url) {
    return {
      configured: false,
      region,
      costPerQueryUsd: agentCoreWebSearchCostPerQuery(),
      toolName,
      message:
        'Set AGENTCORE_GATEWAY_URL (or AGENTCORE_GATEWAY_ID) to enable AgentCore Web Search. Requires an AgentCore Gateway target with connectorId "web-search" (us-east-1).',
    };
  }
  return {
    configured: true,
    region,
    gatewayUrl: url.replace(/\/\/([^/]+).*/, '//$1/…'), // host only for UI
    costPerQueryUsd: agentCoreWebSearchCostPerQuery(),
    toolName,
    message: 'AgentCore Web Search ready (AWS-resident public web index).',
  };
}

function toolName(): string {
  // Gateway prefixes target name → e.g. web-search-tool___WebSearch
  return (
    (process.env.AGENTCORE_WEB_SEARCH_TOOL_NAME || '').trim() ||
    'web-search-tool___WebSearch'
  );
}

/** Cache tools/list name resolution per process */
let cachedToolName: string | null = null;

async function resolveToolName(gatewayUrl: string): Promise<string> {
  if (process.env.AGENTCORE_WEB_SEARCH_TOOL_NAME?.trim()) {
    return process.env.AGENTCORE_WEB_SEARCH_TOOL_NAME.trim();
  }
  if (cachedToolName) return cachedToolName;

  try {
    const { status, json } = await signedMcpPost(gatewayUrl, {
      jsonrpc: '2.0',
      id: 'tools-list',
      method: 'tools/list',
      params: {},
    });
    if (status >= 200 && status < 300 && json && typeof json === 'object') {
      const tools =
        (json as any)?.result?.tools ||
        (json as any)?.tools ||
        [];
      if (Array.isArray(tools) && tools.length) {
        const names = tools
          .map((t: any) => t?.name)
          .filter((n: unknown) => typeof n === 'string') as string[];
        const preferred =
          names.find((n) => /websearch|web.?search/i.test(n)) || names[0];
        if (preferred) {
          cachedToolName = preferred;
          return preferred;
        }
      }
    }
  } catch (err) {
    console.warn('[agentcore] tools/list failed, using default tool name', err);
  }
  return toolName();
}

function clampQuery(q: string): string {
  // AgentCore limit: 200 characters
  const t = (q || '').trim().replace(/\s+/g, ' ');
  if (t.length <= 200) return t;
  return t.slice(0, 197) + '…';
}

function parseMcpResults(body: unknown): AgentCoreWebHit[] {
  const hits: AgentCoreWebHit[] = [];

  const tryParseInner = (text: string) => {
    try {
      const j = JSON.parse(text);
      const arr = Array.isArray(j?.results)
        ? j.results
        : Array.isArray(j)
          ? j
          : [];
      for (const r of arr) {
        if (!r || typeof r !== 'object') continue;
        hits.push({
          title: typeof r.title === 'string' ? r.title : undefined,
          url: typeof r.url === 'string' ? r.url : undefined,
          text:
            typeof r.text === 'string'
              ? r.text
              : typeof r.snippet === 'string'
                ? r.snippet
                : undefined,
          publishedDate:
            typeof r.publishedDate === 'string'
              ? r.publishedDate
              : typeof r.date === 'string'
                ? r.date
                : undefined,
        });
      }
    } catch {
      /* not JSON */
    }
  };

  if (!body || typeof body !== 'object') return hits;
  const b = body as Record<string, unknown>;

  // JSON-RPC error
  if (b.error) return hits;

  // MCP tools/call result shapes
  const result = (b.result ?? b) as Record<string, unknown>;
  const content = result.content ?? result;
  const blocks = Array.isArray(content)
    ? content
    : Array.isArray((content as any)?.content)
      ? (content as any).content
      : [];

  if (Array.isArray(blocks)) {
    for (const block of blocks) {
      if (block?.type === 'text' && typeof block.text === 'string') {
        tryParseInner(block.text);
        if (!hits.length && block.text.trim()) {
          hits.push({ text: block.text.slice(0, 2000) });
        }
      }
    }
  }

  // Direct results array
  if (!hits.length && Array.isArray((result as any).results)) {
    tryParseInner(JSON.stringify(result));
  }

  return hits;
}

async function signedMcpPost(
  url: string,
  body: Record<string, unknown>
): Promise<{ status: number; json: unknown; text: string }> {
  const parsed = new URL(url);
  const payload = JSON.stringify(body);
  const credentials = await defaultProvider()();
  const signer = new SignatureV4({
    credentials,
    region,
    service: 'bedrock-agentcore',
    sha256: Sha256,
  });

  const request = new HttpRequest({
    method: 'POST',
    protocol: 'https:',
    hostname: parsed.hostname,
    path: parsed.pathname + (parsed.search || ''),
    headers: {
      host: parsed.hostname,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: payload,
  });

  const signed = await signer.sign(request);
  const res = await fetch(url, {
    method: 'POST',
    headers: signed.headers as Record<string, string>,
    body: payload,
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { status: res.status, json, text };
}

/**
 * Run one AgentCore Web Search query (billed ~$0.007 by default).
 */
export async function agentCoreWebSearch(params: {
  query: string;
  maxResults?: number;
}): Promise<AgentCoreWebSearchResult> {
  const started = Date.now();
  const cost = agentCoreWebSearchCostPerQuery();
  const query = clampQuery(params.query || '');
  const maxResults = Math.min(
    25,
    Math.max(1, Number(params.maxResults) || 10)
  );

  if (!query) {
    return {
      ok: false,
      results: [],
      query: '',
      latencyMs: Date.now() - started,
      estimatedCostUsd: 0,
      source: 'agentcore-web-search',
      configured: isAgentCoreWebSearchConfigured(),
      error: 'query is required',
    };
  }

  const gatewayUrl = getAgentCoreGatewayUrl();
  if (!gatewayUrl) {
    return {
      ok: false,
      results: [],
      query,
      latencyMs: Date.now() - started,
      estimatedCostUsd: 0,
      source: 'agentcore-web-search',
      configured: false,
      error:
        'AgentCore Web Search is not configured. Set AGENTCORE_GATEWAY_URL or AGENTCORE_GATEWAY_ID (Gateway must have connectorId "web-search").',
    };
  }

  const name = await resolveToolName(gatewayUrl);
  // Prefer JSON-RPC MCP tools/call (Gateway standard)
  const rpcBody = {
    jsonrpc: '2.0',
    id: `ws-${Date.now()}`,
    method: 'tools/call',
    params: {
      name,
      arguments: {
        query,
        maxResults,
      },
    },
  };

  try {
    let { status, json, text } = await signedMcpPost(gatewayUrl, rpcBody);

    // Some gateways expect bare MCP envelope without jsonrpc
    if (status === 404 || status === 400) {
      const alt = await signedMcpPost(gatewayUrl, {
        method: 'tools/call',
        params: {
          name,
          arguments: { query, maxResults },
        },
      });
      if (alt.status < status || (alt.status >= 200 && alt.status < 300)) {
        status = alt.status;
        json = alt.json;
        text = alt.text;
      }
    }

    // Retry with alternate tool names if tool not found
    if (
      status >= 400 ||
      (json &&
        typeof json === 'object' &&
        ((json as any).error || (json as any).isError))
    ) {
      const errMsg = String(
        (json as any)?.error?.message ||
          (json as any)?.message ||
          text ||
          ''
      ).toLowerCase();
      if (
        errMsg.includes('not found') ||
        errMsg.includes('unknown tool') ||
        errMsg.includes('invalid tool')
      ) {
        for (const altName of [
          'web-search-tool___WebSearch',
          'WebSearch',
          'WebSearchTool',
          'web_search',
          'web-search',
        ]) {
          if (altName === name) continue;
          const retry = await signedMcpPost(gatewayUrl, {
            jsonrpc: '2.0',
            id: `ws-alt-${Date.now()}`,
            method: 'tools/call',
            params: {
              name: altName,
              arguments: { query, maxResults },
            },
          });
          if (retry.status >= 200 && retry.status < 300) {
            status = retry.status;
            json = retry.json;
            text = retry.text;
            cachedToolName = altName;
            break;
          }
        }
      }
    }

    const latencyMs = Date.now() - started;

    if (status < 200 || status >= 300) {
      const msg =
        (json as any)?.error?.message ||
        (json as any)?.message ||
        text.slice(0, 280) ||
        `HTTP ${status}`;
      return {
        ok: false,
        results: [],
        query,
        latencyMs,
        // Failed calls usually not billed; still report 0
        estimatedCostUsd: 0,
        source: 'agentcore-web-search',
        configured: true,
        error: `AgentCore Web Search failed (${status}): ${msg}`,
        rawPreview: text.slice(0, 400),
      };
    }

    if (
      json &&
      typeof json === 'object' &&
      (json as any).error &&
      !(json as any).result
    ) {
      return {
        ok: false,
        results: [],
        query,
        latencyMs,
        estimatedCostUsd: 0,
        source: 'agentcore-web-search',
        configured: true,
        error: String(
          (json as any).error?.message ||
            JSON.stringify((json as any).error).slice(0, 200)
        ),
      };
    }

    const results = parseMcpResults(json);
    return {
      ok: true,
      results,
      query,
      latencyMs,
      estimatedCostUsd: cost,
      source: 'agentcore-web-search',
      configured: true,
      rawPreview:
        process.env.NODE_ENV === 'development' ? text.slice(0, 500) : undefined,
    };
  } catch (err: any) {
    return {
      ok: false,
      results: [],
      query,
      latencyMs: Date.now() - started,
      estimatedCostUsd: 0,
      source: 'agentcore-web-search',
      configured: true,
      error: err?.message || 'AgentCore Web Search request failed',
    };
  }
}

/**
 * Build resume / person research queries (each ≤200 chars).
 */
export function buildResumeResearchQueries(brief: string): string[] {
  const b = (brief || '').trim().replace(/\s+/g, ' ');
  if (!b) return [];
  const base = b.length > 120 ? b.slice(0, 117) + '…' : b;
  const qs = [
    `${base} resume OR CV OR LinkedIn`,
    `${base} site:linkedin.com/in`,
    `${base} GitHub OR portfolio OR "about me"`,
  ];
  return qs.map(clampQuery).filter((q, i, a) => q && a.indexOf(q) === i);
}
