/**
 * Shared rules so "create company + contact from a LinkedIn /in/ URL"
 * does not burn the tool-iteration budget on fetch_website / extra search.
 */

export const LINKEDIN_PROFILE_RE =
  /https?:\/\/(?:[\w.-]+\.)?linkedin\.com\/in\/[A-Za-z0-9_%-]+\/?/i;

export function isLinkedInProfileUrl(text: string): boolean {
  return LINKEDIN_PROFILE_RE.test(String(text || ""));
}

export function wantsCrmCreateFromQuery(text: string): boolean {
  const q = String(text || "").toLowerCase();
  return (
    /\bcreate\b/.test(q) &&
    /\b(company|contact|client|record|page)\b/.test(q)
  ) || /\b(add|save|make)\b.{0,40}\b(company|contact|client)\b/.test(q);
}

export function wantsCreateFromLinkedInProfile(text: string): boolean {
  return isLinkedInProfileUrl(text) && wantsCrmCreateFromQuery(text);
}

/** Extra rounds when the user asked to write CRM records. */
export function toolLoopBudget(query: string, fallback = 6): number {
  if (wantsCreateFromLinkedInProfile(query) || wantsCrmCreateFromQuery(query)) {
    return 8;
  }
  return fallback;
}

export const LINKEDIN_PROFILE_CREATE_RULES = `
LINKEDIN PROFILE URLs (linkedin.com/in/...) are PEOPLE, not company websites.
- Do NOT call fetch_website or web_search on a LinkedIn /in/ URL. LinkedIn blocks scrapers.
- Use Apollo (apollo_lookup / the [APOLLO LOOKUP] block already in this turn) as source of truth.
- If the user asked to create a company and contact: immediately call create_company_with_primary_contact
  using the Apollo person (name, title) and their organization (company name, domain). Preview first,
  then confirmed:true only after the user confirms (or write is already approved).
- Do not spend more tool rounds researching once Apollo has a match.
`.trim();

export const CRM_WRITE_NOW_NUDGE =
  "SYSTEM: Stop fetch_website, web_search, and further Apollo searches. " +
  "Call create_company_with_primary_contact now using the Apollo/person data already in this conversation. " +
  "Preview unless the user already said confirmed. Never fetch linkedin.com/in/ pages.";

export function shouldNudgeCrmWrite(
  query: string,
  iteration: number,
  maxIter: number,
  toolsUsed: Iterable<string>
): boolean {
  if (iteration !== maxIter - 1) return false;
  if (!wantsCrmCreateFromQuery(query) && !wantsCreateFromLinkedInProfile(query)) {
    return false;
  }
  return ![...toolsUsed].some((t) =>
    /create_company|create_contact/.test(String(t))
  );
}

export function maxIterationsFallback(query: string): string {
  if (wantsCreateFromLinkedInProfile(query) || wantsCrmCreateFromQuery(query)) {
    return (
      "I looked this person up but used all tool rounds on research before saving. " +
      'Reply "confirmed — create the company and contact" and I will write them from the Apollo result. ' +
      "I will not fetch LinkedIn again."
    );
  }
  return "Maximum tool iterations reached. Please refine your query.";
}

export function withLinkedInCreateGuidance(
  systemPrompt: string,
  query: string
): string {
  if (!isLinkedInProfileUrl(query) && !wantsCrmCreateFromQuery(query)) {
    return systemPrompt;
  }
  return `${systemPrompt}\n\n${LINKEDIN_PROFILE_CREATE_RULES}`;
}
