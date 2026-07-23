/**
 * GET  /api/list-builder — list jobs for current user
 * POST /api/list-builder — start a new BD list-builder job
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/server-auth';
import {
  createListBuilderJob,
  listJobsForUser,
} from '@/lib/db/repositories/list-builder-repository';
import { processListBuilderBatch } from '@/lib/list-builder/runner';
import type { ListBuilderSeedRow } from '@/lib/schemas/list-builder';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function parseSeedCsv(csv: string): ListBuilderSeedRow[] {
  const lines = csv
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];
  const header = lines[0].toLowerCase().split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
  const idx = (names: string[]) =>
    header.findIndex((h) => names.some((n) => h === n || h.includes(n)));
  const iName = idx(['company', 'company_name', 'companyname', 'name']);
  const iWeb = idx(['website', 'url', 'domain', 'web']);
  const iCity = idx(['city', 'location']);
  const iContact = idx(['contact', 'contact_name', 'contactname', 'person']);
  const iEmail = idx(['email', 'e-mail']);
  const iPhone = idx(['phone', 'tel', 'mobile']);
  if (iName < 0 || iWeb < 0) return [];

  const rows: ListBuilderSeedRow[] = [];
  for (const line of lines.slice(1)) {
    const cols = line.match(/("([^"]|"")*"|[^,]*)/g)?.map((c) =>
      c.replace(/^"|"$/g, '').replace(/""/g, '"').trim()
    ) || line.split(',').map((c) => c.trim());
    const companyName = cols[iName] || '';
    const website = cols[iWeb] || '';
    if (!companyName || !website) continue;
    rows.push({
      companyName,
      website,
      city: iCity >= 0 ? cols[iCity] : undefined,
      contactName: iContact >= 0 ? cols[iContact] : undefined,
      email: iEmail >= 0 ? cols[iEmail] : undefined,
      phone: iPhone >= 0 ? cols[iPhone] : undefined,
    });
  }
  return rows;
}

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session?.tenantId || !session?.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  // Default: slim list (no full results) so the panel loads instantly
  const full = request.nextUrl.searchParams.get('full') === '1';
  const jobs = await listJobsForUser(session.tenantId, session.userId, {
    includeResults: full,
  });
  // Annotate ownership so UI can hide pause/cancel on shared public lists
  const annotated = jobs.map((j) => ({
    ...j,
    isOwner: j.userId === session.userId,
  }));
  return NextResponse.json({ jobs: annotated });
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session?.tenantId || !session?.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  let seedRows: ListBuilderSeedRow[] = Array.isArray(body.seedRows)
    ? body.seedRows
    : [];
  if (typeof body.seedCsv === 'string' && body.seedCsv.trim()) {
    seedRows = [...seedRows, ...parseSeedCsv(body.seedCsv)];
  }

  const visibilityRaw = String(body.visibility || body.sharing || '')
    .toLowerCase()
    .trim();
  const visibility =
    visibilityRaw === 'public' || visibilityRaw === 'shared'
      ? 'public'
      : visibilityRaw === 'private'
        ? 'private'
        : undefined;

  const { job, error } = await createListBuilderJob(
    session.tenantId,
    session.userId,
    {
      brief: body.brief || body.description || '',
      industry: body.industry,
      geography: body.geography,
      targetSize: body.targetSize ? Number(body.targetSize) : undefined,
      visibility,
      seedRows,
    }
  );

  if (error || !job) {
    return NextResponse.json({ error: error || 'Failed to create job' }, { status: 400 });
  }

  // Kick first batch immediately (user continues; more via cron)
  try {
    await processListBuilderBatch(session.tenantId, job.id);
  } catch (err) {
    console.error('[list-builder] first batch error', err);
  }

  const jobs = await listJobsForUser(session.tenantId, session.userId);
  const fresh = jobs.find((j) => j.id === job.id) || job;
  return NextResponse.json({ job: fresh, jobs });
}
