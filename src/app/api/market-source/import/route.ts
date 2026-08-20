/**
 * Copy a market-source person/company into the current tenant CRM.
 * POST /api/market-source/import  { id, as: 'candidate' | 'contact' | 'company' }
 *
 * @serverOnly
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/server-auth';
import { isPlatformTenantId } from '@/lib/platform-tenant';
import {
  getMarketCompany,
  getMarketPerson,
} from '@/lib/db/repositories/market-source-repository';
import {
  createLead,
  getLeadByEmail,
  getLeadByLinkedIn,
} from '@/lib/db/repositories/lead-repository';
import {
  addContactToClient,
  createClient,
  findCompanyByName,
} from '@/lib/db/repositories/client-repository';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const session = await getSession().catch(() => null);
  const tenantId = session?.tenantId;
  if (!session?.userId || !tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (isPlatformTenantId(tenantId) || session.tenantScope === 'all') {
    return NextResponse.json(
      { error: 'Select a tenant before adding someone to your CRM.' },
      { status: 400 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const id = String(body.id || '').trim();
  const as = String(body.as || '').trim();
  if (!id || !['candidate', 'contact', 'company'].includes(as)) {
    return NextResponse.json(
      { error: 'id and as=candidate|contact|company are required' },
      { status: 400 }
    );
  }

  const actor = { userId: session.userId, email: session.email };

  try {
    if (as === 'company') {
      const company = await getMarketCompany(id);
      if (!company) {
        return NextResponse.json({ error: 'Company not found' }, { status: 404 });
      }
      const existing = await findCompanyByName(tenantId, company.name);
      if (existing?.id) {
        return NextResponse.json({
          ok: true,
          duplicate: true,
          companyId: existing.id,
          message: `${company.name} is already in your companies.`,
        });
      }
      const created = await createClient(
        tenantId,
        {
          name: company.name,
          website: company.website,
          domain: company.domain,
          city: company.city,
          state: company.state,
          industry: company.industry,
          source: 'market_source',
          status: 'identification',
        },
        actor
      );
      return NextResponse.json({
        ok: true,
        companyId: created.id,
        message: `Added ${company.name} to your companies.`,
      });
    }

    const person = await getMarketPerson(id);
    if (!person) {
      return NextResponse.json({ error: 'Person not found' }, { status: 404 });
    }

    if (as === 'candidate') {
      if (person.email) {
        const byEmail = await getLeadByEmail(tenantId, person.email);
        if (byEmail?.id) {
          return NextResponse.json({
            ok: true,
            duplicate: true,
            candidateId: byEmail.id,
            message: `${person.name} is already a candidate.`,
          });
        }
      }
      if (person.linkedinUrl) {
        const byLi = await getLeadByLinkedIn(tenantId, person.linkedinUrl);
        if (byLi?.id) {
          return NextResponse.json({
            ok: true,
            duplicate: true,
            candidateId: byLi.id,
            message: `${person.name} is already a candidate.`,
          });
        }
      }
      const lead = await createLead(
        tenantId,
        {
          name: person.name,
          email: person.email || '',
          phone: person.phone || '',
          title: person.title || '',
          company: person.company || '',
          location: person.location || '',
          linkedin_url: person.linkedinUrl || '',
          status: 'identification',
          source: 'market_source',
          notes: 'Added from shared sourcing library',
        } as any,
        actor
      );
      return NextResponse.json({
        ok: true,
        candidateId: lead.id,
        message: `Added ${person.name} to your candidates.`,
      });
    }

    const companyName = person.company || 'Unknown company';
    let company = await findCompanyByName(tenantId, companyName);
    if (!company?.id) {
      company = await createClient(
        tenantId,
        {
          name: companyName,
          source: 'market_source',
          status: 'identification',
        },
        actor
      );
    }
    const existingContact = (company.contacts || []).find((c: { email?: string; name?: string }) => {
      if (person.email && c.email && c.email.toLowerCase() === person.email.toLowerCase()) {
        return true;
      }
      return (c.name || '').trim().toLowerCase() === person.name.trim().toLowerCase();
    });
    if (existingContact) {
      return NextResponse.json({
        ok: true,
        duplicate: true,
        companyId: company.id,
        message: `${person.name} is already a contact at ${companyName}.`,
      });
    }
    await addContactToClient(
      tenantId,
      String(company.id),
      {
        name: person.name,
        title: person.title,
        email: person.email,
        phone: person.phone,
        notes: 'Added from shared sourcing library',
      },
      actor
    );
    return NextResponse.json({
      ok: true,
      companyId: company.id,
      message: `Added ${person.name} as a contact at ${companyName}.`,
    });
  } catch (err) {
    console.error('[POST /api/market-source/import]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Import failed' },
      { status: 500 }
    );
  }
}
