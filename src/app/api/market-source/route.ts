/**
 * Shared sourcing library (pre-decision Apollo / AI / PDL hits).
 * GET /api/market-source?kind=people|companies&q=&role=&page=
 *
 * @serverOnly
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/server-auth';
import {
  getMarketCompany,
  getMarketPerson,
  listMarketCompanies,
  listMarketPeople,
} from '@/lib/db/repositories/market-source-repository';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const session = await getSession().catch(() => null);
  if (!session?.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const kind = String(request.nextUrl.searchParams.get('kind') || 'people');
  const query = String(request.nextUrl.searchParams.get('q') || '').trim();
  const roleRaw = String(request.nextUrl.searchParams.get('role') || 'all');
  const role =
    roleRaw === 'candidate' || roleRaw === 'contact' ? roleRaw : 'all';
  const page = Math.max(1, Number(request.nextUrl.searchParams.get('page') || 1));
  const pageSize = Math.min(
    100,
    Math.max(10, Number(request.nextUrl.searchParams.get('pageSize') || 50))
  );
  const id = String(request.nextUrl.searchParams.get('id') || '').trim();

  try {
    if (id) {
      const person = await getMarketPerson(id);
      if (person) return NextResponse.json({ kind: 'people', record: person });
      const company = await getMarketCompany(id);
      if (company) return NextResponse.json({ kind: 'companies', record: company });
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    if (kind === 'companies') {
      const rows = await listMarketCompanies({ query });
      const start = (page - 1) * pageSize;
      return NextResponse.json({
        kind: 'companies',
        total: rows.length,
        page,
        pageSize,
        items: rows.slice(start, start + pageSize),
      });
    }

    const rows = await listMarketPeople({ query, role });
    const start = (page - 1) * pageSize;
    const candidates = rows.filter((r) => r.roles?.includes('candidate')).length;
    const contacts = rows.filter((r) => r.roles?.includes('contact')).length;
    const withEmail = rows.filter((r) => r.hasEmail).length;
    return NextResponse.json({
      kind: 'people',
      total: rows.length,
      candidates,
      contacts,
      withEmail,
      page,
      pageSize,
      items: rows.slice(start, start + pageSize),
    });
  } catch (err) {
    console.error('[GET /api/market-source]', err);
    return NextResponse.json(
      { error: 'Failed to load sourcing library' },
      { status: 500 }
    );
  }
}
