/**
 * Shared market-source pool (search hits before a tenant imports them).
 * Stored on turnkey-profiles with market-* ids so we can fill it without a new table.
 *
 * @serverOnly
 */

import { getItem, putItem, scanItems, tableNames } from '../dynamodb';
import type {
  MarketAlias,
  MarketCompany,
  MarketPerson,
  MarketPersonRole,
  MarketSighting,
} from '../../schemas/market-source';
import {
  MARKET_COMPANY_ALIAS_TYPE,
  MARKET_COMPANY_TYPE,
  MARKET_PERSON_ALIAS_TYPE,
  MARKET_PERSON_TYPE,
  MARKET_TENANT_ID,
  canonicalCompanyId,
  canonicalPersonId,
  companyLookupKeys,
  normalizeDomain,
  normalizeEmail,
  normalizeLinkedIn,
  personLookupKeys,
  usableCompanyName,
} from '@/lib/market-source/ids';

const MAX_SIGHTINGS = 12;

type PersonPatch = {
  name: string;
  title?: string;
  company?: string;
  companyId?: string;
  location?: string;
  email?: string;
  phone?: string;
  linkedinUrl?: string;
  pdlId?: string;
  apolloId?: string;
  role: MarketPersonRole;
  source?: string;
  sighting: MarketSighting;
};

type CompanyPatch = {
  name: string;
  website?: string;
  city?: string;
  state?: string;
  location?: string;
  industry?: string;
  employeeCount?: number;
  companySize?: string;
  source?: string;
  sighting: MarketSighting;
};

function preferText(current?: string, next?: string): string | undefined {
  const n = String(next || '').trim();
  if (n) return n.slice(0, 300);
  const c = String(current || '').trim();
  return c || undefined;
}

function mergeList(current: string[] | undefined, next?: string): string[] {
  const out = [...(current || [])];
  const value = String(next || '').trim();
  if (value && !out.includes(value)) out.push(value);
  return out.slice(0, 12);
}

function mergeRoles(
  current: MarketPersonRole[] | undefined,
  role: MarketPersonRole
): MarketPersonRole[] {
  const out = [...(current || [])];
  if (!out.includes(role)) out.push(role);
  return out;
}

function isSameSighting(a: MarketSighting, b: MarketSighting): boolean {
  if (a.runKey && b.runKey) {
    return a.runKey === b.runKey && a.surface === b.surface;
  }
  return (
    a.at === b.at &&
    a.surface === b.surface &&
    a.query === b.query &&
    a.source === b.source
  );
}

function mergeSightings(
  current: MarketSighting[] | undefined,
  next: MarketSighting
): { sightings: MarketSighting[]; added: boolean } {
  const list = [...(current || [])];
  if (list.some((s) => isSameSighting(s, next))) {
    return { sightings: list.slice(0, MAX_SIGHTINGS), added: false };
  }
  list.unshift(next);
  return { sightings: list.slice(0, MAX_SIGHTINGS), added: true };
}

async function loadRecord<T extends { id: string; type?: string }>(
  id: string
): Promise<T | null> {
  try {
    return await getItem<T>(tableNames.profiles, { id });
  } catch {
    return null;
  }
}

async function resolveCanonical<T extends { id: string; type?: string }>(
  keys: string[],
  aliasType: MarketAlias['type'],
  entityType: string
): Promise<{ canonicalId: string; record: T | null; aliasKeys: string[] }> {
  const aliasKeys = keys.slice(1);
  for (const key of keys) {
    const item = await loadRecord<T & MarketAlias>(key);
    if (!item) continue;
    if (item.type === aliasType && item.canonicalId) {
      const canonical = await loadRecord<T>(item.canonicalId);
      return {
        canonicalId: item.canonicalId,
        record: canonical,
        aliasKeys: keys.filter((k) => k !== item.canonicalId),
      };
    }
    if (item.type === entityType) {
      return {
        canonicalId: item.id,
        record: item,
        aliasKeys: keys.filter((k) => k !== item.id),
      };
    }
  }
  return { canonicalId: keys[0], record: null, aliasKeys };
}

async function writeAliases(
  aliasKeys: string[],
  canonicalId: string,
  type: MarketAlias['type']
): Promise<void> {
  const now = new Date().toISOString();
  for (const id of aliasKeys) {
    if (!id || id === canonicalId) continue;
    const alias: MarketAlias = {
      id,
      tenant_id: MARKET_TENANT_ID,
      type,
      canonicalId,
      updatedAt: now,
    };
    await putItem(tableNames.profiles, alias);
  }
}

export async function upsertMarketPerson(
  patch: PersonPatch
): Promise<MarketPerson | null> {
  const name = String(patch.name || '').trim();
  if (!name) return null;
  const keys = personLookupKeys({
    linkedinUrl: patch.linkedinUrl,
    email: patch.email,
    pdlId: patch.pdlId,
    apolloId: patch.apolloId,
    name,
    company: patch.company,
  });
  const preferred = canonicalPersonId({
    linkedinUrl: patch.linkedinUrl,
    email: patch.email,
    pdlId: patch.pdlId,
    apolloId: patch.apolloId,
    name,
    company: patch.company,
  });
  if (!preferred || keys.length === 0) return null;

  const found = await resolveCanonical<MarketPerson>(
    keys,
    MARKET_PERSON_ALIAS_TYPE,
    MARKET_PERSON_TYPE
  );
  const now = patch.sighting.at || new Date().toISOString();
  const existing = found.record;
  const id = existing?.id || preferred;
  const merged = mergeSightings(existing?.sightings, patch.sighting);
  const next: MarketPerson = {
    id,
    tenant_id: MARKET_TENANT_ID,
    type: MARKET_PERSON_TYPE,
    roles: mergeRoles(existing?.roles, patch.role),
    name: preferText(existing?.name, name) || name,
    title: preferText(existing?.title, patch.title),
    company: preferText(existing?.company, usableCompanyName(patch.company)),
    companyId: preferText(existing?.companyId, patch.companyId),
    location: preferText(existing?.location, patch.location),
    email: normalizeEmail(patch.email) || existing?.email,
    phone: preferText(existing?.phone, patch.phone),
    linkedinUrl:
      normalizeLinkedIn(patch.linkedinUrl) || existing?.linkedinUrl,
    pdlId: preferText(existing?.pdlId, patch.pdlId),
    apolloId: preferText(existing?.apolloId, patch.apolloId),
    sources: mergeList(existing?.sources, patch.source),
    sightingCount: (existing?.sightingCount || 0) + (merged.added ? 1 : 0),
    sightings: merged.sightings,
    firstSeenAt: existing?.firstSeenAt || now,
    lastSeenAt: now,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
  await putItem(tableNames.profiles, next);
  await writeAliases(
    [...found.aliasKeys, ...keys],
    id,
    MARKET_PERSON_ALIAS_TYPE
  );
  if (existing && existing.id !== id) {
    await writeAliases([existing.id], id, MARKET_PERSON_ALIAS_TYPE);
  }
  await rememberPerson(next, existing && existing.id !== id ? existing.id : undefined);
  return next;
}

export async function upsertMarketCompany(
  patch: CompanyPatch
): Promise<MarketCompany | null> {
  const name = usableCompanyName(patch.name);
  if (!name) return null;
  const keys = companyLookupKeys({ website: patch.website, name });
  const preferred = canonicalCompanyId({ website: patch.website, name });
  if (!preferred || keys.length === 0) return null;

  const found = await resolveCanonical<MarketCompany>(
    keys,
    MARKET_COMPANY_ALIAS_TYPE,
    MARKET_COMPANY_TYPE
  );
  const now = patch.sighting.at || new Date().toISOString();
  const existing = found.record;
  const id = existing?.id || preferred;
  const domain = normalizeDomain(patch.website) || existing?.domain;
  const merged = mergeSightings(existing?.sightings, patch.sighting);
  const next: MarketCompany = {
    id,
    tenant_id: MARKET_TENANT_ID,
    type: MARKET_COMPANY_TYPE,
    name: preferText(existing?.name, name) || name,
    website: preferText(existing?.website, patch.website),
    domain,
    city: preferText(existing?.city, patch.city),
    state: preferText(existing?.state, patch.state),
    location: preferText(existing?.location, patch.location),
    industry: preferText(existing?.industry, patch.industry),
    employeeCount:
      typeof patch.employeeCount === 'number'
        ? patch.employeeCount
        : existing?.employeeCount,
    companySize: preferText(existing?.companySize, patch.companySize),
    sources: mergeList(existing?.sources, patch.source),
    sightingCount: (existing?.sightingCount || 0) + (merged.added ? 1 : 0),
    sightings: merged.sightings,
    firstSeenAt: existing?.firstSeenAt || now,
    lastSeenAt: now,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
  await putItem(tableNames.profiles, next);
  await writeAliases(
    [...found.aliasKeys, ...keys],
    id,
    MARKET_COMPANY_ALIAS_TYPE
  );
  if (existing && existing.id !== id) {
    await writeAliases([existing.id], id, MARKET_COMPANY_ALIAS_TYPE);
  }
  await rememberCompany(next, existing && existing.id !== id ? existing.id : undefined);
  return next;
}

export async function getMarketPerson(
  id: string
): Promise<MarketPerson | null> {
  const item = await loadRecord<MarketPerson | MarketAlias>(id);
  if (!item) return null;
  if (item.type === MARKET_PERSON_ALIAS_TYPE) {
    return loadRecord<MarketPerson>(item.canonicalId);
  }
  return item.type === MARKET_PERSON_TYPE ? item : null;
}

export async function getMarketCompany(
  id: string
): Promise<MarketCompany | null> {
  const item = await loadRecord<MarketCompany | MarketAlias>(id);
  if (!item) return null;
  if (item.type === MARKET_COMPANY_ALIAS_TYPE) {
    return loadRecord<MarketCompany>(item.canonicalId);
  }
  return item.type === MARKET_COMPANY_TYPE ? item : null;
}

export type MarketPersonSummary = {
  id: string;
  name: string;
  title?: string;
  company?: string;
  location?: string;
  roles: MarketPersonRole[];
  hasEmail: boolean;
  hasPhone: boolean;
  hasLinkedIn: boolean;
  sources: string[];
  sightingCount: number;
  lastSeenAt: string;
};

export type MarketCompanySummary = {
  id: string;
  name: string;
  website?: string;
  domain?: string;
  city?: string;
  state?: string;
  location?: string;
  industry?: string;
  sources: string[];
  sightingCount: number;
  lastSeenAt: string;
};

type MarketIndex<T> = {
  id: string;
  tenant_id: string;
  type: 'market_index';
  kind: 'people' | 'companies';
  shard: number;
  items: T[];
  nextShard?: number;
  updatedAt: string;
};

const INDEX_CAP = 1600;

let indexChain: Promise<void> = Promise.resolve();

function withIndexLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = indexChain.then(fn, fn);
  indexChain = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

function personSummary(p: MarketPerson): MarketPersonSummary {
  return {
    id: p.id,
    name: p.name,
    title: p.title,
    company: p.company,
    location: p.location,
    roles: p.roles,
    hasEmail: !!p.email,
    hasPhone: !!p.phone,
    hasLinkedIn: !!p.linkedinUrl,
    sources: (p.sources || []).slice(0, 8),
    sightingCount: p.sightingCount,
    lastSeenAt: p.lastSeenAt,
  };
}

function companySummary(c: MarketCompany): MarketCompanySummary {
  return {
    id: c.id,
    name: c.name,
    website: c.website,
    domain: c.domain,
    city: c.city,
    state: c.state,
    location: c.location,
    industry: c.industry,
    sources: (c.sources || []).slice(0, 8),
    sightingCount: c.sightingCount,
    lastSeenAt: c.lastSeenAt,
  };
}

function indexId(kind: 'people' | 'companies', shard: number): string {
  return `market-index#${kind}#${shard}`;
}

async function loadIndex<T>(
  kind: 'people' | 'companies',
  shard: number
): Promise<MarketIndex<T> | null> {
  return loadRecord<MarketIndex<T>>(indexId(kind, shard));
}

async function upsertIndexItem<T extends { id: string; lastSeenAt: string }>(
  kind: 'people' | 'companies',
  summary: T,
  previousId?: string
): Promise<void> {
  await withIndexLock(async () => {
  try {
    let shard = 0;
    let target = await loadIndex<T>(kind, 0);
    let foundShard = -1;
    while (target) {
      const hasCurrent = target.items.some((item) => item.id === summary.id);
      const hasPrev = previousId
        ? target.items.some((item) => item.id === previousId)
        : false;
      if (hasCurrent || hasPrev) {
        foundShard = shard;
        break;
      }
      if (target.nextShard == null) break;
      shard = target.nextShard;
      target = await loadIndex<T>(kind, shard);
    }

    if (foundShard < 0) {
      shard = 0;
      target = await loadIndex<T>(kind, 0);
      while (target && target.items.length >= INDEX_CAP && target.nextShard != null) {
        shard = target.nextShard;
        target = await loadIndex<T>(kind, shard);
      }
      if (target && target.items.length >= INDEX_CAP) {
        const nextShard = shard + 1;
        target.nextShard = nextShard;
        target.updatedAt = new Date().toISOString();
        await putItem(tableNames.profiles, target);
        shard = nextShard;
        target = null;
      }
    }

    const now = new Date().toISOString();
    const items = (target?.items || []).filter(
      (item) => item.id !== summary.id && item.id !== previousId
    );
    items.unshift(summary);
    const next: MarketIndex<T> = {
      id: indexId(kind, shard),
      tenant_id: MARKET_TENANT_ID,
      type: 'market_index',
      kind,
      shard,
      items: items.slice(0, INDEX_CAP),
      nextShard: target?.nextShard,
      updatedAt: now,
    };
    await putItem(tableNames.profiles, next);
  } catch (err) {
    console.warn('[market-source] index update failed', err);
  }
  });
}

export async function rebuildMarketSourceIndexes(): Promise<{
  people: number;
  companies: number;
}> {
  const peopleRows = await scanItems<MarketPerson>(
    tableNames.profiles,
    '#type = :p',
    { ':p': MARKET_PERSON_TYPE },
    { '#type': 'type' }
  );
  const companyRows = await scanItems<MarketCompany>(
    tableNames.profiles,
    '#type = :c',
    { ':c': MARKET_COMPANY_TYPE },
    { '#type': 'type' }
  );

  const people = peopleRows
    .filter((row) => row.id && row.name)
    .sort((a, b) => String(b.lastSeenAt || '').localeCompare(String(a.lastSeenAt || '')))
    .map(personSummary);
  const companies = companyRows
    .filter((row) => row.id && row.name)
    .sort((a, b) => String(b.lastSeenAt || '').localeCompare(String(a.lastSeenAt || '')))
    .map(companySummary);

  async function writeShards<T>(
    kind: 'people' | 'companies',
    items: T[]
  ) {
    const now = new Date().toISOString();
    if (items.length === 0) {
      await putItem(tableNames.profiles, {
        id: indexId(kind, 0),
        tenant_id: MARKET_TENANT_ID,
        type: 'market_index',
        kind,
        shard: 0,
        items: [],
        updatedAt: now,
      });
      return;
    }
    let shard = 0;
    for (let i = 0; i < items.length; i += INDEX_CAP) {
      const slice = items.slice(i, i + INDEX_CAP);
      const hasNext = i + INDEX_CAP < items.length;
      await putItem(tableNames.profiles, {
        id: indexId(kind, shard),
        tenant_id: MARKET_TENANT_ID,
        type: 'market_index',
        kind,
        shard,
        items: slice,
        nextShard: hasNext ? shard + 1 : undefined,
        updatedAt: now,
      });
      shard += 1;
    }
  }

  await writeShards('people', people);
  await writeShards('companies', companies);
  return { people: people.length, companies: companies.length };
}

async function rememberPerson(person: MarketPerson, previousId?: string) {
  await upsertIndexItem('people', personSummary(person), previousId);
}

async function rememberCompany(company: MarketCompany, previousId?: string) {
  await upsertIndexItem('companies', companySummary(company), previousId);
}

async function listIndexItems<T extends { lastSeenAt: string }>(
  kind: 'people' | 'companies'
): Promise<T[]> {
  const out: T[] = [];
  const seen = new Set<string>();
  let shard = 0;
  let guard = 0;
  while (guard < 40) {
    const page = await loadIndex<T>(kind, shard);
    if (!page) break;
    for (const item of page.items || []) {
      const id = (item as { id?: string }).id;
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push(item);
    }
    if (page.nextShard == null) break;
    shard = page.nextShard;
    guard++;
  }
  out.sort((a, b) => String(b.lastSeenAt).localeCompare(String(a.lastSeenAt)));
  return out;
}

function matchesQuery(q: string, fields: Array<string | undefined>): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const tokens = needle.split(/\s+/).filter(Boolean);
  const hay = fields
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return tokens.every((token) => hay.includes(token));
}

export async function listMarketPeople(options?: {
  query?: string;
  role?: MarketPersonRole | 'all';
  contactOnly?: boolean;
}): Promise<MarketPersonSummary[]> {
  const rows = await listIndexItems<MarketPersonSummary>('people');
  const role = options?.role || 'all';
  return rows.filter((row) => {
    if (role !== 'all' && !(row.roles || []).includes(role)) return false;
    return matchesQuery(options?.query || '', [
      row.name,
      row.title,
      row.company,
      row.location,
      ...(row.sources || []),
      ...(row.roles || []),
    ]);
  });
}

export async function listMarketCompanies(options?: {
  query?: string;
}): Promise<MarketCompanySummary[]> {
  const rows = await listIndexItems<MarketCompanySummary>('companies');
  return rows.filter((row) =>
    matchesQuery(options?.query || '', [
      row.name,
      row.website,
      row.domain,
      row.city,
      row.state,
      row.location,
      row.industry,
      ...(row.sources || []),
    ])
  );
}

export async function countMarketSources(): Promise<{
  people: number;
  companies: number;
  aliases: number;
}> {
  const rows = await scanItems<{ type?: string }>(
    tableNames.profiles,
    '#type IN (:p, :c, :pa, :ca)',
    {
      ':p': MARKET_PERSON_TYPE,
      ':c': MARKET_COMPANY_TYPE,
      ':pa': MARKET_PERSON_ALIAS_TYPE,
      ':ca': MARKET_COMPANY_ALIAS_TYPE,
    },
    { '#type': 'type' }
  );
  let people = 0;
  let companies = 0;
  let aliases = 0;
  for (const row of rows) {
    if (row.type === MARKET_PERSON_TYPE) people++;
    else if (row.type === MARKET_COMPANY_TYPE) companies++;
    else aliases++;
  }
  return { people, companies, aliases };
}
