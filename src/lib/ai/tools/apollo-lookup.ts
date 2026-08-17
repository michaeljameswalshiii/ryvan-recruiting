/**
 * Look up one person in Apollo (LinkedIn URL, email, or name + company).
 * @serverOnly
 */

import {
  matchPeople,
  searchPeople,
  type ApolloPerson,
} from "@/lib/apollo/client";
import type { ToolContext, ToolParams, ToolResult } from "./types";

export const APOLLO_LOOKUP_TOOL_NAME = "apollo_lookup";
export const APOLLO_LOOKUP_TOOL_DESCRIPTION =
  "Look up a specific person in Apollo.io. Use when the user wants LinkedIn, email, phone, current title, or 'who is X at Company'. Pass linkedin_url, email, or name plus company. Prefer this over web_search for people contact intel. Do not use to fill a job req (use source_candidates).";

export type ApolloLookupParams = {
  linkedin_url?: string;
  email?: string;
  name?: string;
  company?: string;
  domain?: string;
  reveal_contact?: boolean;
  query?: string;
};

function asPerson(p: ApolloPerson) {
  return {
    id: p.id,
    name: p.name,
    title: p.title,
    company: p.company,
    linkedin_url: p.linkedin_url,
    email: p.email,
    phone: p.phone,
    location: [p.city, p.state, p.country].filter(Boolean).join(", ") || undefined,
    headline: p.headline,
  };
}

export function formatApolloLookupForModel(data: {
  people?: Array<{
    name?: string;
    title?: string;
    company?: string;
    linkedin_url?: string;
    email?: string;
    phone?: string;
    location?: string;
    headline?: string;
  }>;
  error?: string;
  fallbackSearch?: boolean;
}): string {
  if (data.error && !data.people?.length) {
    return `Apollo lookup failed: ${data.error}. You may try web_search as a fallback.`;
  }
  if (!data.people?.length) {
    return "Apollo lookup found no matching person. You may try web_search as a fallback.";
  }
  const lines = data.people.slice(0, 5).map((p, i) => {
    return [
      `${i + 1}. ${p.name || "Unknown"}`,
      p.title ? `   Title: ${p.title}` : null,
      p.company ? `   Company: ${p.company}` : null,
      p.linkedin_url ? `   LinkedIn: ${p.linkedin_url}` : "   LinkedIn: not on file",
      p.email ? `   Email: ${p.email}` : "   Email: not revealed or not on file",
      p.phone ? `   Phone: ${p.phone}` : "   Phone: not revealed or not on file",
      p.location ? `   Location: ${p.location}` : null,
    ]
      .filter(Boolean)
      .join("\n");
  });
  return [
    "Looked up in Apollo.",
    data.fallbackSearch ? "(Exact match empty — showing closest Apollo search hits.)" : null,
    ...lines,
    "Cite Apollo as the source. Do not invent a LinkedIn URL if it is missing.",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function executeApolloLookup(
  params: ToolParams,
  context: ToolContext
): Promise<ToolResult> {
  const input = params as ToolParams & ApolloLookupParams;
  const linkedin_url = String(input.linkedin_url || "").trim();
  const email = String(input.email || "").trim();
  const name = String(input.name || "").trim();
  const company = String(input.company || "").trim();
  const domain = String(input.domain || "").trim();
  const reveal =
    input.reveal_contact === true ||
    /email|phone|contact|reach/i.test(String(input.query || ""));

  if (!linkedin_url && !email && !name) {
    return {
      success: false,
      error: "Provide linkedin_url, email, or name (optionally with company).",
    };
  }

  const auth = context.tenantId ? { tenantId: context.tenantId } : undefined;

  try {
    const matched = await matchPeople(
      [{ linkedin_url, email, name, organization_name: company, domain }],
      auth,
      { revealPersonalEmails: reveal, revealPhoneNumber: reveal }
    );

    let people = matched.people || [];
    let fallbackSearch = false;

    if (!people.length && name) {
      const search = await searchPeople({
        q: [name, company].filter(Boolean).join(" "),
        per_page: 5,
        auth,
      });
      if (search.people?.length) {
        people = search.people;
        fallbackSearch = true;
      } else if (search.error && !matched.error) {
        return {
          success: false,
          error: search.error,
          metadata: { source: "apollo_lookup", tenantId: context.tenantId },
        };
      }
    }

    if (matched.error && !people.length) {
      return {
        success: false,
        error: matched.error,
        metadata: { source: "apollo_lookup", tenantId: context.tenantId },
      };
    }

    const data = {
      lookedUpInApollo: true,
      people: people.map(asPerson),
      count: people.length,
      fallbackSearch,
      creditsConsumed: matched.creditsConsumed,
      revealContact: reveal,
    };

    if (context.toolSpend && (matched.creditsConsumed || people.length)) {
      context.toolSpend.push({
        tool: APOLLO_LOOKUP_TOOL_NAME,
        estimatedCostUsd: 0.05 * Math.max(1, people.length || 1),
        queries: 1,
        label: "Apollo person lookup",
      });
    }

    return {
      success: true,
      data,
      metadata: { source: "apollo_lookup", tenantId: context.tenantId },
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Apollo lookup failed",
    };
  }
}
