/**
 * Route Goal-agent / chat goals: market BD lists vs named CRM writes.
 */

export const MARKET_REACH_OPTIONS = [
  "Owner / founder",
  "HR / People",
  "Hiring manager",
  "Plant / ops manager",
] as const;

export type MarketReachOption = (typeof MARKET_REACH_OPTIONS)[number];

/** Named "create these companies: A, B, C" is not a market list. */
export function isNamedCompanyCreateGoal(text: string): boolean {
  const q = String(text || "").toLowerCase();
  if (!q.trim()) return false;
  if (
    /\b(create|add|save)\b.{0,40}\b(these|this|the following|named)\b/.test(q)
  ) {
    return true;
  }
  // "Create CRM companies for: Grace Aerospace, Matrix Composites"
  if (
    /\bcreate\b/.test(q) &&
    /:\s*\S+,.+\S/.test(text) &&
    !/\b(in |near |industry|florida|texas)\b/i.test(q)
  ) {
    return true;
  }
  return false;
}

/**
 * Industry + location sourcing so Trio can be their recruiter.
 * Those goals should start a list-builder job, not dump companies into CRM.
 */
export function isMarketSourcingGoal(text: string): boolean {
  const q = String(text || "").toLowerCase();
  if (!q.trim() || isNamedCompanyCreateGoal(text)) return false;

  const wantsCompanies =
    /\b(compan(y|ies)|firms?|business(es)?|clients?|accounts?|prospects?)\b/.test(
      q
    );
  const sourceVerb =
    /\b(source|find|search|list|prospect|discover|build (a )?list|identify|locate|look for)\b/.test(
      q
    );
  const geo =
    /\b(in |near |around |based in |located|florida|texas|georgia|carolina|ohio|alabama|tennessee|city|state|county|metro|region|nationwide|united states|\busa\b)\b/.test(
      q
    );
  const industry =
    /\b(industry|hvac|construction|manufactur|aerospace|medical|healthcare|staffing|logistics|warehouse|food|beverage|automotive|energy|oil|gas|pharma|biotech|software|saas|retail|hospitality|marine|composites|industrial|filtration)\b/.test(
      q
    );
  const recruiterIntent =
    /\b(recruiter|recruiting|their recruiter|become their|win (the )?account|business development|\bbd\b)\b/.test(
      q
    );
  const listBuilderCue =
    /\b(list[- ]builder|start_list_builder|review (and|&) import|do not create crm)\b/.test(
      q
    );

  if (listBuilderCue) return true;
  if (recruiterIntent && (wantsCompanies || industry || geo)) return true;
  if (sourceVerb && wantsCompanies && (geo || industry)) return true;
  if (wantsCompanies && geo && industry) return true;
  return false;
}

export function composeMarketSourcingGoal(input: {
  industry?: string;
  location?: string;
  targetCount?: number;
  reach?: string[];
  extra?: string;
}): string {
  const industry = String(input.industry || "").trim();
  const location = String(input.location || "").trim();
  const extra = String(input.extra || "").trim();
  const reach = (input.reach || []).map((r) => String(r).trim()).filter(Boolean);
  const n = Number(input.targetCount);
  const targetCount = Number.isFinite(n) && n > 0 ? Math.min(100, Math.round(n)) : 25;

  const hasMarket = !!(industry || location);
  if (!hasMarket && extra) return extra;
  if (!hasMarket) return "";

  const lines = [
    "Source companies so we can be their recruiter.",
    industry ? `Industry: ${industry}` : "",
    location ? `Location: ${location}` : "",
    `Target: about ${targetCount} companies`,
    reach.length ? `Who to reach: ${reach.join(", ")}` : "",
    extra ? `Notes: ${extra}` : "",
    "",
    "Start a list-builder job (start_list_builder) with this brief.",
    "Do not create CRM company or contact records in this run.",
    "The user will review the table and import what they want.",
  ].filter((line) => line !== "");

  return lines.join("\n");
}

export const MARKET_SOURCING_RULES = `
MARKET SOURCING (industry + location / "be their recruiter" / find companies in a geo):
- Call start_list_builder ONCE with brief, industry, geography, and target_size.
- Do NOT call create_company, create_contact, or create_company_with_primary_contact for a market list.
- Do NOT ask the user to Approve writes so you can dump companies into Identification.
- After the job starts, tell them it is running in the background. They review and import from Company list builder.
- End with GOAL_COMPLETE after start_list_builder returns a job id.
`.trim();

export function withMarketSourcingGuidance(
  systemPrompt: string,
  query: string
): string {
  if (!isMarketSourcingGoal(query)) return systemPrompt;
  return `${systemPrompt}\n\n${MARKET_SOURCING_RULES}`;
}
