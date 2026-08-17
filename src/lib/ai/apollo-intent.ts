/**
 * High-confidence "look up this person in Apollo" detector.
 * Used for pre-flight so LinkedIn/email/who-is asks hit Apollo
 * even if the model would have skipped the tool.
 * @serverOnly
 */

import type { ToolContext } from "@/lib/ai/tools/types";
import {
  APOLLO_LOOKUP_TOOL_NAME,
  executeApolloLookup,
  formatApolloLookupForModel,
} from "@/lib/ai/tools/apollo-lookup";
import { isApolloToolEnabled } from "@/lib/ai/tool-flags";

export type ApolloLookupIntent = {
  shouldPrefire: boolean;
  linkedin_url?: string;
  email?: string;
  name?: string;
  company?: string;
  reveal_contact: boolean;
};

const LINKEDIN_RE =
  /https?:\/\/(?:[\w.-]+\.)?linkedin\.com\/in\/[A-Za-z0-9_%-]+\/?/i;
const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;

function clipName(raw: string): string {
  return String(raw || "")
    .replace(/[?!.]+$/g, "")
    .replace(/^(what|who|where|when)(?:'s|s)?\s+/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

export function detectApolloLookupIntent(query: string): ApolloLookupIntent {
  const text = String(query || "").trim();
  const lower = text.toLowerCase();
  const reveal_contact = /\b(email|e-mail|phone|mobile|contact info|reach|call)\b/i.test(
    text
  );

  const linkedin = text.match(LINKEDIN_RE)?.[0];
  if (linkedin) {
    return { shouldPrefire: true, linkedin_url: linkedin, reveal_contact };
  }

  const email = text.match(EMAIL_RE)?.[0];
  if (email && /\b(who is|look up|linkedin|title|work at|company|enrich)\b/i.test(text)) {
    return { shouldPrefire: true, email, reveal_contact: true };
  }

  const who = text.match(
    /\bwho(?:'s| is)\s+([A-Za-z][A-Za-z'.-]+(?:\s+(?!at\b|from\b|with\b|@)[A-Za-z][A-Za-z'.-]+){0,3})(?:\s+(?:at|@|from|with)\s+([^?.!]{2,60}))?/i
  );
  if (who?.[1]) {
    return {
      shouldPrefire: true,
      name: clipName(who[1]),
      company: who[2] ? clipName(who[2]) : undefined,
      reveal_contact,
    };
  }

  const forPerson = text.match(
    /\b(?:linkedin(?: url| profile)?|email|phone|contact(?: info)?|title)\s+(?:for|of|on)\s+([A-Za-z][A-Za-z'.-]+(?:\s+(?!at\b|@)[A-Za-z][A-Za-z'.-]+){0,3})(?:\s+(?:at|@)\s+([^?.!]{2,60}))?/i
  );
  if (forPerson?.[1] && /linkedin|email|phone|contact|title/i.test(lower)) {
    return {
      shouldPrefire: true,
      name: clipName(forPerson[1]),
      company: forPerson[2] ? clipName(forPerson[2]) : undefined,
      reveal_contact,
    };
  }

  const possessive = text.match(
    /\b((?:[A-Za-z][A-Za-z'.-]+\s+){0,2}[A-Za-z][A-Za-z'.-]+)'s\s+(linkedin|email|phone)\b/i
  );
  if (possessive?.[1]) {
    return {
      shouldPrefire: true,
      name: clipName(possessive[1]),
      reveal_contact: possessive[2] !== "linkedin" || reveal_contact,
    };
  }

  return { shouldPrefire: false, reveal_contact };
}

export async function maybePrefireApolloLookup(
  query: string,
  context: ToolContext
): Promise<{ didRun: boolean; block?: string; toolsUsed: string[] }> {
  if (!isApolloToolEnabled()) {
    return { didRun: false, toolsUsed: [] };
  }
  const intent = detectApolloLookupIntent(query);
  if (!intent.shouldPrefire) {
    return { didRun: false, toolsUsed: [] };
  }

  const result = await executeApolloLookup(
    {
      query,
      linkedin_url: intent.linkedin_url,
      email: intent.email,
      name: intent.name,
      company: intent.company,
      reveal_contact: intent.reveal_contact,
    },
    context
  );

  const data = (result.data || {}) as {
    people?: Array<Record<string, unknown>>;
    fallbackSearch?: boolean;
  };
  const block = [
    "",
    "[APOLLO LOOKUP — already ran before this turn]",
    formatApolloLookupForModel({
      people: (data.people || []) as never,
      error: result.error,
      fallbackSearch: data.fallbackSearch,
    }),
    "Treat this as source of truth. Do not skip Apollo or invent a different LinkedIn URL.",
  ].join("\n");

  return {
    didRun: true,
    block,
    toolsUsed: [APOLLO_LOOKUP_TOOL_NAME],
  };
}

export async function applyApolloPrefire(
  query: string,
  systemPrompt: string,
  context: ToolContext
): Promise<{ query: string; systemPrompt: string; toolsUsed: string[] }> {
  const pre = await maybePrefireApolloLookup(query, context);
  if (!pre.didRun) {
    return { query, systemPrompt, toolsUsed: [] };
  }
  return {
    query: `${query}${pre.block || ""}`,
    systemPrompt: `${systemPrompt}\n\n${APOLLO_ASSISTANT_RULES}`,
    toolsUsed: pre.toolsUsed,
  };
}

export const APOLLO_ASSISTANT_RULES = `Apollo people intel (required):
- If the user wants LinkedIn, email, phone, current title, or "who is [name] at [company]", you MUST call apollo_lookup before answering.
- Pass linkedin_url, email, or name plus company when known.
- Set reveal_contact=true only when they asked for email/phone/contact info.
- Use apollo / apollo_company_search to find a list of people or companies.
- Use source_candidates to fill a job req. Use web_search only if Apollo returns nothing.
- If an [APOLLO LOOKUP — already ran] block is in the user message, use it. Do not claim you cannot access LinkedIn or Apollo.
- When you use Apollo results, say you looked them up in Apollo.
- LinkedIn /in/ URLs are people. Do not fetch_website or web_search them. If the user asked to create a company and contact, call create_company_with_primary_contact from the Apollo match.`;
