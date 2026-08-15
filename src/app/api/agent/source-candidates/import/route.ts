import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/server-auth';
import { bulkImportCandidates, type AIRawResult } from '@/lib/candidates/import';

function importReady(candidate: AIRawResult): boolean {
  const name = String(candidate.name || '').trim();
  const title = String(candidate.title || '').trim();
  const company = String(candidate.company || '').trim();
  const linkedin = String(
    candidate.linkedin_url || (candidate as any).linkedinUrl || ''
  ).trim();
  const email = String(candidate.email || '').trim();
  const phone = String(candidate.phone || '').replace(/\D/g, '');
  const hasIdentity =
    /linkedin\.com\/in\/[a-z0-9-]+/i.test(linkedin) ||
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    phone.length >= 7;
  return (
    name.length >= 5 &&
    name.split(/\s+/).length >= 2 &&
    !name.includes('*') &&
    title.length >= 3 &&
    company.length >= 2 &&
    hasIdentity
  );
}

export async function POST(request: NextRequest) {
  const session = await getSession().catch(() => null);
  if (!session?.tenantId || !session.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const candidates = Array.isArray(body.candidates)
    ? (body.candidates as AIRawResult[])
    : [];
  const threshold = Number(body.minFitScore || 80);
  const eligible = candidates.filter(
    (candidate) =>
      Number(candidate.fitScore || 0) >= threshold && importReady(candidate)
  );

  if (!eligible.length) {
    return NextResponse.json({
      imported: 0,
      duplicates: 0,
      errors: 0,
      skipped: candidates.length,
      message:
        'No candidates met the import gate. Require 80+ fit, name, title, company, and a direct LinkedIn URL, valid email, or phone.',
    });
  }

  const result = await bulkImportCandidates(
    eligible.map((candidate) => ({
      ...candidate,
      linkedin_url: candidate.linkedinUrl || candidate.linkedin_url,
    })),
    'apollo_recruiter_agent',
    String(body.searchQuery || '').slice(0, 500)
  );
  return NextResponse.json({
    ...result,
    eligible: eligible.length,
    skipped: candidates.length - eligible.length,
    message:
      result.imported > 0
        ? `${result.imported} candidate(s) loaded into Turnkey` +
          (result.duplicates ? `; ${result.duplicates} already existed` : '') +
          (result.errors ? `; ${result.errors} failed` : '') +
          '.'
        : result.duplicates > 0 && result.errors === 0
          ? `0 candidate(s) loaded; ${result.duplicates} already existed in Turnkey.`
          : `0 candidate(s) loaded; ${result.errors} failed during import.` +
            (result.duplicates ? ` ${result.duplicates} already existed.` : ''),
  });
}
