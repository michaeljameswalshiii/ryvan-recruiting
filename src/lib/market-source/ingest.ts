/**
 * Map search result rows into the shared market-source pool.
 * Never throws to the caller. Does not read tenant CRM records.
 *
 * @serverOnly
 */

import type { MarketPersonRole, MarketSurface } from '@/lib/schemas/market-source';
import {
  upsertMarketCompany,
  upsertMarketPerson,
} from '@/lib/db/repositories/market-source-repository';
import { shouldSkipAtsSource, usableCompanyName } from '@/lib/market-source/ids';

export type MarketIngestPerson = {
  name?: string;
  title?: string;
  company?: string;
  location?: string;
  email?: string;
  phone?: string;
  linkedinUrl?: string;
  pdlId?: string;
  apolloId?: string;
  source?: string;
  role?: MarketPersonRole;
};

export type MarketIngestCompany = {
  name?: string;
  website?: string;
  city?: string;
  state?: string;
  location?: string;
  industry?: string;
  employeeCount?: number;
  companySize?: string;
  source?: string;
};

export type MarketIngestBatch = {
  surface: MarketSurface;
  query?: string;
  title?: string;
  location?: string;
  source?: string;
  runKey?: string;
  people?: MarketIngestPerson[];
  companies?: MarketIngestCompany[];
};

async function mapPool<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  const queue = [...items];
  const workers = Math.max(1, Math.min(limit, queue.length));
  await Promise.all(
    Array.from({ length: workers }, async () => {
      while (queue.length) {
        const item = queue.shift();
        if (item) await fn(item);
      }
    })
  );
}

export async function ingestMarketSourceBatch(
  batch: MarketIngestBatch
): Promise<{ people: number; companies: number }> {
  const at = new Date().toISOString();
  const sightingBase = {
    at,
    surface: batch.surface,
    query: batch.query ? String(batch.query).slice(0, 400) : undefined,
    title: batch.title ? String(batch.title).slice(0, 200) : undefined,
    location: batch.location
      ? String(batch.location).slice(0, 200)
      : undefined,
    runKey: batch.runKey ? String(batch.runKey).slice(0, 200) : undefined,
  };

  let people = 0;
  let companies = 0;

  await mapPool(batch.companies || [], 4, async (row) => {
    const company = await upsertMarketCompany({
      name: row.name || '',
      website: row.website,
      city: row.city,
      state: row.state,
      location: row.location || [row.city, row.state].filter(Boolean).join(', '),
      industry: row.industry,
      employeeCount: row.employeeCount,
      companySize: row.companySize,
      source: row.source || batch.source,
      sighting: { ...sightingBase, source: row.source || batch.source },
    });
    if (company) companies++;
  });

  await mapPool(batch.people || [], 4, async (row) => {
    if (shouldSkipAtsSource(row.source)) return;
    const name = String(row.name || '').trim();
    if (!name) return;
    const companyName = usableCompanyName(row.company);
    let companyId: string | undefined;
    if (companyName) {
      const company = await upsertMarketCompany({
        name: companyName,
        source: row.source || batch.source,
        location: row.location,
        sighting: { ...sightingBase, source: row.source || batch.source },
      });
      companyId = company?.id;
      if (company) companies++;
    }
    const person = await upsertMarketPerson({
      name,
      title: row.title,
      company: companyName,
      companyId,
      location: row.location,
      email: row.email,
      phone: row.phone,
      linkedinUrl: row.linkedinUrl,
      pdlId: row.pdlId,
      apolloId: row.apolloId,
      role: row.role || 'candidate',
      source: row.source || batch.source,
      sighting: { ...sightingBase, source: row.source || batch.source },
    });
    if (person) people++;
  });

  return { people, companies };
}
