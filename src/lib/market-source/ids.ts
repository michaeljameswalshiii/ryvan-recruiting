/**
 * Stable ids for the shared market-source pool (pre-decision search hits).
 * Not tenant CRM records — those stay on leads / clients / contacts.
 */

export const MARKET_TENANT_ID = 'market';

export const MARKET_PERSON_TYPE = 'market_person';
export const MARKET_COMPANY_TYPE = 'market_company';
export const MARKET_PERSON_ALIAS_TYPE = 'market_person_alias';
export const MARKET_COMPANY_ALIAS_TYPE = 'market_company_alias';

const SKIP_COMPANY =
  /^(n\/?a|none|null|undefined|self[- ]?employed|freelance|retired|unknown|n\.a\.|-|–|—)$/i;

export function slugToken(value: string): string {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export function normalizeEmail(value?: string | null): string | undefined {
  const email = String(value || '')
    .trim()
    .toLowerCase();
  if (!email || !email.includes('@') || email.length > 160) return undefined;
  return email;
}

export function normalizeLinkedIn(value?: string | null): string | undefined {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return undefined;
  const stripped = raw
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/+$/, '')
    .split(/[?#]/)[0];
  const inbound = stripped.match(/linkedin\.com\/in\/([^/]+)/);
  if (inbound?.[1]) return `linkedin.com/in/${inbound[1]}`;
  if (stripped.includes('linkedin.com/')) return stripped;
  return undefined;
}

export function normalizeDomain(website?: string | null): string | undefined {
  const raw = String(website || '').trim().toLowerCase();
  if (!raw) return undefined;
  const stripped = raw
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split(/[/?#]/)[0]
    .replace(/\/+$/, '');
  if (!stripped || !stripped.includes('.') || stripped.length > 120) return undefined;
  if (stripped.startsWith('linkedin.com')) return undefined;
  return stripped;
}

export function usableCompanyName(name?: string | null): string | undefined {
  const trimmed = String(name || '').trim();
  if (trimmed.length < 2 || trimmed.length > 200) return undefined;
  if (SKIP_COMPANY.test(trimmed)) return undefined;
  return trimmed;
}

export function personLookupKeys(input: {
  linkedinUrl?: string;
  email?: string;
  pdlId?: string;
  apolloId?: string;
  name?: string;
  company?: string;
}): string[] {
  const keys: string[] = [];
  const li = normalizeLinkedIn(input.linkedinUrl);
  const email = normalizeEmail(input.email);
  const pdl = String(input.pdlId || '').trim();
  const apollo = String(input.apolloId || '').trim();
  if (li) keys.push(`market-person#li#${li}`);
  if (email) keys.push(`market-person#em#${email}`);
  if (pdl) keys.push(`market-person#pdl#${pdl.slice(0, 80)}`);
  if (apollo) keys.push(`market-person#ap#${apollo.slice(0, 80)}`);
  const name = slugToken(input.name || '');
  const company = slugToken(usableCompanyName(input.company) || '');
  if (name) {
    keys.push(
      company
        ? `market-person#nm#${name}#${company}`
        : `market-person#nm#${name}`
    );
  }
  return [...new Set(keys)];
}

export function companyLookupKeys(input: {
  website?: string;
  name?: string;
}): string[] {
  const keys: string[] = [];
  const domain = normalizeDomain(input.website);
  const name = slugToken(usableCompanyName(input.name) || '');
  if (domain) keys.push(`market-company#dom#${domain}`);
  if (name) keys.push(`market-company#nm#${name}`);
  return [...new Set(keys)];
}

export function canonicalPersonId(input: {
  linkedinUrl?: string;
  email?: string;
  pdlId?: string;
  apolloId?: string;
  name?: string;
  company?: string;
}): string | null {
  return personLookupKeys(input)[0] || null;
}

export function canonicalCompanyId(input: {
  website?: string;
  name?: string;
}): string | null {
  return companyLookupKeys(input)[0] || null;
}

export function shouldSkipAtsSource(source?: string | null): boolean {
  return String(source || '').trim().toLowerCase() === 'ats';
}
