/**
 * Shared rules so "create company + contact from a LinkedIn /in/ URL"
 * does not burn the tool-iteration budget on fetch_website / extra search.
 */

import { withMarketSourcingGuidance } from "./goal-routing";

export const LINKEDIN_PROFILE_RE =
  /https?:\/\/(?:[\w.-]+\.)?linkedin\.com\/in\/[A-Za-z0-9_%-]+\/?/i;

export function isLinkedInProfileUrl(text: string): boolean {
  return LINKEDIN_PROFILE_RE.test(String(text || ""));
}

export function wantsCrmCreateFromQuery(text: string): boolean {
  const q = String(text || "").toLowerCase();
  return (
    (/\bcreate\b/.test(q) &&
      /\b(company|contact|client|record|page)\b/.test(q)) ||
    /\b(add|save|make)\b.{0,40}\b(company|contact|client)\b/.test(q) ||
    wantsMissingContactPosted(text)
  );
}

/**
 * User says the company already exists but the person never landed on Contacts.
 * Example: "company is there but David is not" / "no contact was posted".
 */
export function wantsMissingContactPosted(text: string): boolean {
  const q = String(text || "").toLowerCase();
  if (!q) return false;
  if (
    /\b(no contact (was )?(posted|created|added|saved)|contact (was )?not (posted|created|added|saved)|isn't on (the )?contacts?|not on (the )?contact list|contact (is )?missing)\b/.test(
      q
    )
  ) {
    return true;
  }
  if (
    /\b(company|client)\b.{0,60}\b(is there|exists|already (there|exists)|is already)\b.{0,40}\b(but|and)\b.{0,60}\b(not|no |missing)\b/.test(
      q
    )
  ) {
    return true;
  }
  if (
    /\b(but|and)\b.{0,40}\b(is not|isn't there|is missing|was not posted)\b/.test(q) &&
    /\b(company|contact|client)\b/.test(q)
  ) {
    return true;
  }
  return false;
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

export const MISSING_CONTACT_WRITE_NUDGE =
  "SYSTEM: The company already exists. The person is NOT on Contacts. " +
  "Do NOT look up invented contact IDs and do NOT create a second company. " +
  "Immediately call create_contact with name + company_name (or company_id from internal_data clients list). " +
  "Pass confirmed:true — the user is reporting a missing post, not asking for research. " +
  "Only say they are saved after the tool returns status \"created\" with a real contact id.";

export function crmWriteNudgeForQuery(query: string): string {
  if (wantsMissingContactPosted(query)) return MISSING_CONTACT_WRITE_NUDGE;
  return CRM_WRITE_NOW_NUDGE;
}

export function alreadyUsedCrmWrite(toolsUsed: Iterable<string>): boolean {
  return [...toolsUsed].some((t) =>
    /create_company|create_contact/.test(String(t))
  );
}

export function shouldNudgeCrmWrite(
  query: string,
  iteration: number,
  maxIter: number,
  toolsUsed: Iterable<string>
): boolean {
  if (alreadyUsedCrmWrite(toolsUsed)) return false;

  if (wantsMissingContactPosted(query)) {
    // First turn, and again after a lookup that did not write.
    const used = [...toolsUsed].map((t) => String(t));
    return (
      iteration === 0 ||
      used.includes("internal_data") ||
      used.includes("apollo") ||
      used.includes("apollo_lookup")
    );
  }

  if (iteration !== maxIter - 1) return false;
  if (!wantsCrmCreateFromQuery(query) && !wantsCreateFromLinkedInProfile(query)) {
    return false;
  }
  return true;
}

export function shouldRetryCrmWrite(
  query: string,
  toolsUsed: Iterable<string>
): boolean {
  if (alreadyUsedCrmWrite(toolsUsed)) return false;
  return wantsMissingContactPosted(query) || wantsCrmCreateFromQuery(query);
}

export function maxIterationsFallback(query: string): string {
  if (wantsMissingContactPosted(query)) {
    return (
      "I used all tool rounds without posting the contact. " +
      'Reply with the person and company (for example: "Add David Marinelli at Cascade — confirmed") ' +
      "and I will call create_contact on the existing company."
    );
  }
  if (wantsCreateFromLinkedInProfile(query) || wantsCrmCreateFromQuery(query)) {
    return (
      "I looked this person up but used all tool rounds on research before saving. " +
      'Reply "confirmed — create the company and contact" and I will write them from the Apollo result. ' +
      "I will not fetch LinkedIn again."
    );
  }
  return "Maximum tool iterations reached. Please refine your query.";
}

const MISSING_CONTACT_RULES = `
COMPANY EXISTS / CONTACT MISSING:
- If the user says the company is there but the person is not on Contacts, call create_contact.
- Reuse the existing company (company_name or company_id). Never create a duplicate company.
- Never invent a contact_id. Never claim a contact was posted unless create_contact returned status "created" with an id.
`.trim();

/** Exact user-facing line for contact/company create previews. */
export const CONTACT_COMPANY_CONFIRM_LINE =
  "**Does this look correct? Confirm and I'll create the contact/company**";

/** Fallback line for other write previews (candidate, job, updates). */
export const GENERIC_WRITE_CONFIRM_LINE =
  "**Does this look correct? Confirm and I'll save this.**";

export function userFacingConfirmLine(action?: string): string {
  if (/contact|company/i.test(String(action || ""))) {
    return CONTACT_COMPANY_CONFIRM_LINE;
  }
  return GENERIC_WRITE_CONFIRM_LINE;
}

export function confirmGateMessage(action: string): string {
  return (
    "Do NOT invent that this was saved. Show the user this preview. " +
    `End your message with exactly this bold line and nothing about how to reply: ${userFacingConfirmLine(action)} ` +
    "Do not list yes / confirm / go ahead. Those words still confirm if the user types them. " +
    "When they confirm, call this tool again with the same fields and confirmed: true."
  );
}

export const WRITE_CONFIRM_PROMPT_RULES = `
CRITICAL confirmation rules for ALL write tools:
1. First call the tool WITHOUT confirmed (or confirmed:false). You will get status "needs_confirmation" and a preview.
2. Show the user a clear summary of what will change. Then end with this exact bold line (contact or company creates):
   ${CONTACT_COMPANY_CONFIRM_LINE}
   For other writes (candidate, job, update), end with:
   ${GENERIC_WRITE_CONFIRM_LINE}
   Do NOT list reply options such as yes / confirm / go ahead. Do not write "Reply **yes**, **confirm**, or **go ahead**".
3. Only after the user agrees (yes / confirm / go ahead / do it / ok / sure still count), call the SAME tool again with the same fields AND confirmed:true.
4. NEVER claim data was saved until a tool returns status created/updated/linked/stage_updated in the tool result JSON.
5. If the user only says "yes" or "ok", you STILL must re-invoke the write tool with confirmed:true — do not answer from memory.
`.trim();

export function withLinkedInCreateGuidance(
  systemPrompt: string,
  query: string
): string {
  let next = systemPrompt;
  if (isLinkedInProfileUrl(query) || wantsCrmCreateFromQuery(query)) {
    next = `${next}\n\n${LINKEDIN_PROFILE_CREATE_RULES}`;
  }
  if (wantsMissingContactPosted(query)) {
    next = `${next}\n\n${MISSING_CONTACT_RULES}`;
  }
  return withMarketSourcingGuidance(next, query);
}
