/**
 * Fire-and-forget market-source ingest after a search write.
 * Uses Next.js after() so the user response is not blocked.
 */

import type { MarketIngestBatch } from '@/lib/market-source/ingest';

export function scheduleMarketSourceIngest(batch: MarketIngestBatch) {
  const people = batch.people?.length || 0;
  const companies = batch.companies?.length || 0;
  if (people === 0 && companies === 0) return;

  const start = () => {
    void import('@/lib/market-source/ingest')
      .then((mod) =>
        mod.ingestMarketSourceBatch(batch).catch((err) => {
          console.warn('[market-source] ingest failed', err);
        })
      )
      .catch((err) => {
        console.warn('[market-source] ingest import failed', err);
      });
  };

  try {
    void import('next/server')
      .then((mod) => {
        if (typeof mod.after === 'function') mod.after(start);
        else start();
      })
      .catch(() => start());
  } catch {
    start();
  }
}
