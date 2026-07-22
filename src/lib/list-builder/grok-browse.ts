/**
 * Mantle-safe browse loop for List Builder: Grok + fetch_website only.
 * No Apollo, no Tavily, no direct xAI web_search.
 * @serverOnly
 */

import {
  runMantleGrokScopedAgent,
  type MantleOpenAiTool,
} from '@/lib/ai/providers/bedrock-mantle';
import {
  extractContactSignals,
  fetchCompanyContactPages,
  fetchPageText,
} from './fetch-page';
import { logBedrockUsage } from '@/lib/aws/athena-bedrock';
import { LIST_BUILDER_GROK_MODEL } from './grok-search';

const FETCH_WEBSITE_TOOL: MantleOpenAiTool = {
  type: 'function',
  function: {
    name: 'fetch_website',
    description:
      'Fetch and read a public webpage by URL (company homepage, /contact, /about, chamber directory page, etc.). ' +
      'Returns page title, cleaned text, and any emails/phones found on the page. ' +
      'Use this to VERIFY companies and EXTRACT public contact info — do not invent contacts.',
    parameters: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description:
            'Full URL or domain, e.g. https://example.com/contact or example.com',
        },
        query: {
          type: 'string',
          description: 'Alias for url if you only have one string',
        },
      },
      required: ['url'],
    },
  },
};

function normalizeUrl(raw: string): string | null {
  let s = (raw || '').trim();
  if (!s) return null;
  if (/^[a-z0-9][a-z0-9.-]+\.[a-z]{2,}(\/.*)?$/i.test(s) && !s.includes(' ')) {
    s = `https://${s}`;
  }
  try {
    const u = new URL(s);
    if (!/^https?:$/i.test(u.protocol)) return null;
    return u.toString();
  } catch {
    return null;
  }
}

/**
 * Execute fetch_website for the scoped agent — prefers multi-page contact crawl
 * when the URL is a site root / domain.
 */
export async function executeListBuilderFetchWebsite(
  input: Record<string, unknown>
): Promise<string> {
  const raw = String(input.url || input.query || '').trim();
  const url = normalizeUrl(raw);
  if (!url) {
    return JSON.stringify({ error: 'Invalid or missing url' });
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return JSON.stringify({ error: 'Invalid url' });
  }

  const path = parsed.pathname || '/';
  const isRootish =
    path === '/' ||
    path === '' ||
    !path.includes('.') ||
    /\/(index\.html?)?$/i.test(path);

  // Root/domain → homepage + contact/about paths (best for phones/emails)
  if (isRootish && path.split('/').filter(Boolean).length <= 1) {
    const multi = await fetchCompanyContactPages(url);
    if ('error' in multi) {
      // Fall through to single page
    } else {
      const sig = extractContactSignals(multi.text);
      return JSON.stringify({
        url: multi.url,
        title: multi.title,
        emails_found: sig.emails,
        phones_found: sig.phones,
        text: multi.text.slice(0, 9000),
      });
    }
  }

  const page = await fetchPageText(url);
  if ('error' in page) {
    return JSON.stringify({ error: page.error, url });
  }
  const sig = extractContactSignals(page.text);
  return JSON.stringify({
    url: page.url,
    title: page.title,
    emails_found: sig.emails,
    phones_found: sig.phones,
    text: page.text.slice(0, 9000),
  });
}

export type GrokBrowseUsageCtx = {
  tenantId?: string;
  userId?: string;
  jobId?: string;
  purpose?: string;
  queryPreview?: string;
};

/**
 * Grok on Mantle with fetch_website only — browse real pages, then answer.
 */
export async function grokBrowseResearch(params: {
  system: string;
  user: string;
  maxIterations?: number;
  timeoutMs?: number;
  usageCtx?: GrokBrowseUsageCtx;
}): Promise<{
  text: string;
  model: string;
  toolsUsed: string[];
  error?: string;
}> {
  const model = LIST_BUILDER_GROK_MODEL;
  const timeoutMs = params.timeoutMs ?? 52_000;
  const started = Date.now();
  let fetchCount = 0;
  const MAX_FETCHES = 10;

  try {
    const work = runMantleGrokScopedAgent({
      system: params.system,
      user: params.user,
      model,
      temperature: 0.2,
      maxTokens: 4096,
      maxIterations: params.maxIterations ?? 5,
      tools: [FETCH_WEBSITE_TOOL],
      executeTool: async (name, input) => {
        if (name !== 'fetch_website') {
          return JSON.stringify({
            error: `Tool "${name}" is not available. Only fetch_website is allowed.`,
          });
        }
        if (fetchCount >= MAX_FETCHES) {
          return JSON.stringify({
            error: 'Fetch budget exhausted for this batch. Use pages already retrieved.',
          });
        }
        if (Date.now() - started > timeoutMs - 8_000) {
          return JSON.stringify({
            error: 'Time budget low. Stop fetching and return final JSON now.',
          });
        }
        fetchCount++;
        return executeListBuilderFetchWebsite(input);
      },
    });

    const result = await Promise.race([
      work,
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Grok browse timed out after ${timeoutMs}ms`)),
          timeoutMs
        )
      ),
    ]);

    try {
      await logBedrockUsage({
        modelId: result.model || model,
        inputTokens: Math.ceil((params.system + params.user).length / 4),
        outputTokens: Math.ceil((result.text || '').length / 4),
        queryPreview: `[List Builder] ${params.usageCtx?.purpose || 'browse'}${
          params.usageCtx?.jobId ? ` job=${params.usageCtx.jobId}` : ''
        }: ${(params.usageCtx?.queryPreview || params.user).slice(0, 100)}`.slice(
          0,
          200
        ),
        toolsUsed: [
          'list-builder',
          'bedrock-mantle-grok',
          'fetch_website',
          ...(result.toolsUsed || []),
          params.usageCtx?.purpose || 'browse',
        ],
        latencyMs: Date.now() - started,
        tenantId: params.usageCtx?.tenantId,
        userId: params.usageCtx?.userId,
        provider: 'bedrock',
      });
    } catch {
      /* ignore */
    }

    if (!result.text?.trim()) {
      return {
        text: '',
        model: result.model || model,
        toolsUsed: result.toolsUsed,
        error: 'Empty Grok browse response',
      };
    }

    return {
      text: result.text,
      model: result.model || model,
      toolsUsed: result.toolsUsed,
    };
  } catch (err: any) {
    console.warn('[list-builder/grok-browse]', err?.message || err);
    return {
      text: '',
      model,
      toolsUsed: [],
      error: err?.message || String(err),
    };
  }
}
