/**
 * Guards + helpers for create_company from a website URL.
 * Prevents inventing Brazil from "br" in brand domains, and invented
 * industry/location when the page could not be read.
 */

/** True if hostname is the Brazil country TLD (example.com.br), not "br" inside a brand. */
export function domainHasBrazilTld(domainOrUrl: string): boolean {
  const host = hostnameFrom(domainOrUrl);
  if (!host) return false;
  // .br or .com.br, .org.br, etc.
  return /\.br$/i.test(host) || /\.br\./i.test(host);
}

/**
 * True when "br" appears in the brand/label but is NOT a Brazil TLD.
 * e.g. structuralbr.com, brighthouse.com — must not imply Brazil.
 */
export function domainHasBrBrandButNotBrazilTld(domainOrUrl: string): boolean {
  const host = hostnameFrom(domainOrUrl);
  if (!host) return false;
  if (domainHasBrazilTld(host)) return false;
  // brand label contains "br" as substring (structuralbr, brcorp, etc.)
  const labels = host.split(".").slice(0, -1); // drop TLD
  return labels.some((l) => /br/i.test(l));
}

export function hostnameFrom(domainOrUrl: string): string {
  const s = String(domainOrUrl || "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .split("/")[0]
    .split("?")[0]
    .toLowerCase();
  return s.replace(/\.$/, "");
}

/** Location / description text that claims Brazil or São Paulo */
export function textClaimsBrazil(parts: Array<string | undefined | null>): boolean {
  const blob = parts.filter(Boolean).join(" ").toLowerCase();
  if (!blob.trim()) return false;
  return (
    /\bbrazil\b/.test(blob) ||
    /\bbrasil\b/.test(blob) ||
    /\bs[aã]o\s*paulo\b/.test(blob) ||
    /\brio\s+de\s+janeiro\b/.test(blob) ||
    /\bcountry\s*:\s*br\b/.test(blob)
  );
}

/**
 * Reject Brazil location when the only "Brazil signal" is letters "br" in the domain.
 * Allow when TLD is .br or page/user text clearly supports Brazil.
 */
export function shouldRejectInferredBrazil(params: {
  domain?: string;
  city?: string;
  state?: string;
  description?: string;
  /** True only if fetch_website page text explicitly supports Brazil */
  pageSupportsBrazil?: boolean;
}): { reject: boolean; reason?: string } {
  const domain = params.domain || "";
  const claimsBrazil = textClaimsBrazil([
    params.city,
    params.state,
    params.description,
  ]);
  if (!claimsBrazil) return { reject: false };
  if (params.pageSupportsBrazil) return { reject: false };
  if (domainHasBrazilTld(domain)) return { reject: false };

  // structuralbr.com + São Paulo/Brazil without page proof → hard reject
  if (domainHasBrBrandButNotBrazilTld(domain)) {
    return {
      reject: true,
      reason:
        "Do not set Brazil / São Paulo from a domain name. " +
        'Letters like "br" inside a brand (e.g. structuralbr.com) are NOT the Brazil TLD. ' +
        "Only use Brazil when the website text says so, or the domain ends in .br. " +
        "Clear city/state/description Brazil claims, or set page_supports_brazil:true only if fetch_website text confirms it.",
    };
  }

  return { reject: false };
}

/**
 * When website fetch failed, only name + domain are allowed (no invented industry/location/description).
 */
export function shouldRejectUngroundedCompanyFields(params: {
  websiteFetchFailed?: boolean;
  industry?: string;
  city?: string;
  state?: string;
  description?: string;
}): { reject: boolean; reason?: string } {
  if (!params.websiteFetchFailed) return { reject: false };
  const invented = [
    params.industry,
    params.city,
    params.state,
    params.description,
  ].some((x) => String(x || "").trim().length > 0);
  if (!invented) return { reject: false };
  return {
    reject: true,
    reason:
      "Website could not be read (fetch failed or blocked). " +
      "Do not invent industry, city, state, or description. " +
      "Retry create_company with only name + domain, or paste text from the site / try again after a successful fetch_website.",
  };
}

/** Suggested minimal name from domain when page unreadable */
export function guessNameFromDomain(domainOrUrl: string): string {
  const host = hostnameFrom(domainOrUrl);
  if (!host) return "";
  const label = host.split(".")[0] || host;
  // structuralbr → Structuralbr (user can edit)
  return label
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

export const COMPANY_FROM_WEBSITE_RULES = `
COMPANY FROM WEBSITE — grounding rules (critical):
1. ALWAYS call fetch_website on the URL before create_company when the user gives a website.
2. If fetch_website fails (HTTP 403/timeout/blocked) or returns insufficient text:
   - Do NOT invent industry, city, state, country, or a long description.
   - Offer a MINIMAL draft only: name (from page title if any, else domain label) + domain.
   - Tell the user the site could not be read and ask them to paste About-page text or confirm a minimal record.
3. NEVER infer country from letters inside a domain brand:
   - structuralbr.com is NOT Brazil ( "br" is part of the brand, TLD is .com ).
   - Only treat as Brazil if TLD is .br (e.g. empresa.com.br) OR the PAGE TEXT says Brazil/Brasil/São Paulo.
4. Extract name, industry, location, phone, description ONLY from returned page title/text (or user-pasted text).
5. When calling create_company after a successful fetch, set website_fetch_failed:false and page_supports_brazil:true only if the page text supports Brazil.
6. When fetch failed, set website_fetch_failed:true and leave industry/city/state/description empty.
7. LinkedIn profile URLs (linkedin.com/in/...) are people, not company websites. Do NOT fetch_website them. Use Apollo, then create_company_with_primary_contact.
`.trim();
