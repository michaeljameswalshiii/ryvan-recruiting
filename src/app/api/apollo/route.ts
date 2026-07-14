import { NextRequest, NextResponse } from 'next/server';
import { logApolloUsage, logBedrockUsage } from '@/lib/aws/athena-bedrock';
import {
  searchPeople,
  searchCompanies,
  heuristicParseQuery,
  isApolloConfigured,
  type ApolloPerson,
} from '@/lib/apollo/client';

/**
 * POST /api/apollo
 *
 * Chat + sourcing:
 * - If message looks like a people/company search → run real Apollo search
 * - Otherwise → Bedrock chat
 * - Also supports explicit { query } people search
 */

const APOLLO_COST_PER_RESULT = 0.01;

function isPeopleSourcingIntent(text: string): boolean {
  const t = text.toLowerCase();
  // Explicit non-sourcing chat
  if (
    /weather|news|write (an |a )?email|outreach email|strategy|how (do|can|should)|what is|explain/.test(
      t
    ) &&
    !/(find|search|looking for|source|recruit|hire|developer|engineer|manager|candidate)/.test(t)
  ) {
    return false;
  }
  return (
    /(find|search|looking for|source|recruit|hire|need|want)\b/.test(t) ||
    /\b(developer|engineer|manager|director|recruiter|candidate|talent|python|react|java|devops|analyst|designer|sales|marketing)\b/.test(
      t
    ) ||
    /\b(in |near |around )[a-z]/.test(t)
  );
}

function isCompanySourcingIntent(text: string): boolean {
  const t = text.toLowerCase();
  return (
    /\b(companies|company|businesses|accounts|firms|startups|agencies)\b/.test(t) &&
    /(find|search|looking for|source|list|show)/.test(t)
  );
}

function formatPeopleResponse(
  people: ApolloPerson[],
  query: string,
  total: number
): string {
  if (people.length === 0) {
    return (
      `I ran a real Apollo people search for **"${query}"** and got **0 matches** with the current filters.\n\n` +
      `**Try next:**\n` +
      `1. Use the **People Search** tab (better filters + Add to Candidates)\n` +
      `2. Broaden location (e.g. Florida / remote) or title (Software Engineer, Backend Developer)\n` +
      `3. Turn **Smart Search** on in People Search for AI expansion\n\n` +
      `If this keeps failing, check the green/red **Apollo Connected** badge — a 403 usually means the API key needs master access for People Search.`
    );
  }

  const lines = people.slice(0, 12).map((p, i) => {
    const loc = [p.city, p.state].filter(Boolean).join(', ');
    const parts = [
      `**${i + 1}. ${p.name || 'Unknown'}**`,
      p.title ? ` — ${p.title}` : '',
      p.company ? ` @ ${p.company}` : '',
      loc ? ` (${loc})` : '',
      p.linkedin_url ? `\n   LinkedIn: ${p.linkedin_url}` : '',
      p.email ? `\n   Email: ${p.email}` : '',
    ];
    return parts.join('');
  });

  return (
    `Found **${people.length}** people on Apollo for **"${query}"**` +
    (total > people.length ? ` (${total} total available)` : '') +
    `:\n\n` +
    lines.join('\n\n') +
    `\n\n---\n💡 Tip: Open the **People Search** tab and run the same query to **Add to Candidates** with one click.`
  );
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      query,
      message,
      messages,
      page = 1,
      per_page = 15,
    } = body;

    const text = (query || message || '').trim();
    if (!text) {
      return NextResponse.json(
        { error: 'Query or message is required' },
        { status: 400 }
      );
    }

    // Explicit search mode OR chat that is clearly a sourcing request
    const wantsPeople =
      !!query || (message && isPeopleSourcingIntent(message) && !isCompanySourcingIntent(message));
    const wantsCompanies = message && isCompanySourcingIntent(message);

    // ── Real Apollo people search ──────────────────────────────────────────
    if (wantsPeople) {
      if (!isApolloConfigured()) {
        return NextResponse.json({
          success: false,
          results: [],
          count: 0,
          response:
            'Apollo is not configured. Set **APOLLO_API_KEY** (master key) in Vercel environment variables.',
          source: 'config',
          error: 'APOLLO_API_KEY not set',
        });
      }

      const parsed = heuristicParseQuery(text);
      const result = await searchPeople({
        q: text,
        titles: parsed.titles.length ? parsed.titles : undefined,
        locations: parsed.locations.length ? parsed.locations : undefined,
        keywords: parsed.keywords,
        per_page: Math.min(per_page || 15, 25),
        page: page || 1,
      });

      if (result.error && result.people.length === 0) {
        // Retry once broader: title only, no location
        const broader = await searchPeople({
          q: parsed.titles[0] || text,
          titles: parsed.titles.length
            ? parsed.titles
            : ['Python Developer', 'Software Engineer', 'Backend Developer'],
          locations: [],
          keywords: ['python'],
          per_page: 15,
        });

        if (broader.people.length > 0) {
          logApolloUsage({
            modelId: 'apollo-chat-people-broad',
            resultsCount: broader.people.length,
            estimatedCost: broader.people.length * APOLLO_COST_PER_RESULT,
            queryPreview: text,
            tenantId: request.headers.get('x-tenant-id') || undefined,
            userId: request.headers.get('x-user-id') || undefined,
          }).catch(() => {});

          return NextResponse.json({
            success: true,
            results: broader.people,
            people: broader.people,
            count: broader.people.length,
            total: broader.total,
            source: 'apollo',
            response:
              formatPeopleResponse(broader.people, text, broader.total) +
              `\n\n_(Broadened search — original location filter returned 0 results.)_`,
          });
        }

        return NextResponse.json({
          success: false,
          results: [],
          people: [],
          count: 0,
          source: 'apollo',
          error: result.error,
          response:
            `Apollo people search failed: **${result.error}**\n\n` +
            `Check the connection badge on this page. People Search requires a **master API key** on a plan that includes the People API.`,
        });
      }

      if (result.people.length > 0) {
        logApolloUsage({
          modelId: 'apollo-chat-people',
          resultsCount: result.people.length,
          estimatedCost: result.people.length * APOLLO_COST_PER_RESULT,
          queryPreview: text,
          tenantId: request.headers.get('x-tenant-id') || undefined,
          userId: request.headers.get('x-user-id') || undefined,
        }).catch(() => {});
      }

      return NextResponse.json({
        success: true,
        results: result.people,
        people: result.people,
        count: result.people.length,
        total: result.total,
        source: 'apollo',
        response: formatPeopleResponse(result.people, text, result.total),
      });
    }

    // ── Company sourcing from chat ─────────────────────────────────────────
    if (wantsCompanies) {
      if (!isApolloConfigured()) {
        return NextResponse.json({
          success: false,
          response: 'Apollo is not configured. Set APOLLO_API_KEY in Vercel.',
          source: 'config',
        });
      }

      const parsed = heuristicParseQuery(text);
      const result = await searchCompanies({
        q: text,
        keywords: parsed.keywords,
        locations: parsed.locations,
        per_page: 15,
      });

      if (result.error && result.companies.length === 0) {
        return NextResponse.json({
          success: false,
          response: `Company search failed: ${result.error}`,
          error: result.error,
          source: 'apollo',
        });
      }

      const lines = result.companies.slice(0, 12).map((c, i) => {
        const loc = [c.city, c.state].filter(Boolean).join(', ') || c.headquarters_location;
        return `**${i + 1}. ${c.name}**${c.industry ? ` — ${c.industry}` : ''}${loc ? ` (${loc})` : ''}${c.website ? `\n   ${c.website}` : ''}`;
      });

      return NextResponse.json({
        success: true,
        companies: result.companies,
        count: result.companies.length,
        source: 'apollo',
        response:
          result.companies.length === 0
            ? `No companies found for **"${text}"**. Try industry + city (e.g. software Miami).`
            : `Found **${result.companies.length}** companies:\n\n${lines.join('\n\n')}\n\nOpen the **Companies** tab for full results.`,
      });
    }

    // ── General chat (Bedrock) ─────────────────────────────────────────────
    if (message) {
      const chatMessages = [
        {
          role: 'system' as const,
          content:
            'You are a recruiting AI assistant for RyVan Recruiting. Help with sourcing strategy, outreach, and pipeline advice. ' +
            'Do NOT claim you searched Apollo unless results were provided. If the user wants to find people, tell them you will search when they ask clearly, or direct them to the People Search tab.',
        },
        ...(messages?.slice(-6) || []),
        { role: 'user' as const, content: message },
      ];

      try {
        const origin = new URL(request.url).origin;
        const bedrockRes = await fetch(`${origin}/api/bedrock`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: chatMessages,
            useSearch: false,
            useTools: false,
          }),
        });

        const bedrockResult = await bedrockRes.json();

        if (bedrockResult.response) {
          logBedrockUsage({
            modelId: 'anthropic-claude-3-haiku-20240307',
            inputTokens: Math.ceil(message.length / 4),
            outputTokens: Math.ceil(String(bedrockResult.response).length / 4),
            queryPreview: message.substring(0, 100),
            toolsUsed: ['bedrock-chat'],
            latencyMs: 0,
          }).catch(() => {});

          return NextResponse.json({
            success: true,
            response: bedrockResult.response,
            source: 'bedrock',
          });
        }

        throw new Error(bedrockResult.error || 'No response from Bedrock');
      } catch (bedrockErr: any) {
        return NextResponse.json({
          success: false,
          error: bedrockErr.message,
          response: `AI chat unavailable: ${bedrockErr.message}. For candidate search, use the **People Search** tab.`,
          source: 'fallback',
        });
      }
    }

    return NextResponse.json(
      { error: 'Query or message is required' },
      { status: 400 }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to process request';
    console.error('Apollo API error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
