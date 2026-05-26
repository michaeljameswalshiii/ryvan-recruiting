/**
 * Seed Test Data API Route
 * Creates sample test data for the current tenant
 * 
 * @serverOnly
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionTenantId, getSessionUserId } from '@/lib/server-auth';
import { createClient as createClientRepo } from '@/lib/db/repositories/client-repository';
import { createLead as createLeadRepo } from '@/lib/db/repositories/lead-repository';

/**
 * POST /api/seed-test-data
 * Create test companies and leads for the current tenant
 */
export async function POST(request: NextRequest) {
  try {
    // Get tenant from verified session
    const tenantId = await getSessionTenantId();
    const userId = await getSessionUserId();
    
    if (!tenantId || !userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    console.log('Seeding test data for tenant:', tenantId);

// Create test companies
    const testCompanies = [
      {
        name: 'TechCorp Solutions',
        domain: 'techcorp.example.com',
        industry: 'Technology',
        city: 'San Francisco',
        state: 'CA',
        country: 'US',
        employee_count: 250,
        revenue: '$50M-$100M',
        description: 'Enterprise software solutions company',
        status: 'identification' as const,
      },
      {
        name: 'Innovate Health',
        domain: 'innovatehealth.example.com',
        industry: 'Healthcare',
        city: 'Boston',
        state: 'MA',
        country: 'US',
        employee_count: 500,
        revenue: '$100M-$250M',
        description: 'Digital health platform',
        status: 'outreach' as const,
      },
      {
        name: 'FinanceFlow Inc',
        domain: 'financeflow.example.com',
        industry: 'FinTech',
        city: 'New York',
        state: 'NY',
        country: 'US',
        employee_count: 150,
        revenue: '$25M-$50M',
        description: 'Financial technology services',
        status: 'conversation' as const,
      },
    ];

    const createdCompanies = [];
    for (const company of testCompanies) {
      const created = await createClientRepo(tenantId, company);
      createdCompanies.push(created);
    }

// Create test leads (candidates) - status must be valid enum
    const testLeads = [
      {
        name: 'John Smith',
        email: 'john.smith@techcorp.example.com',
        phone: '555-123-4567',
        title: 'Senior Software Engineer',
        company: 'TechCorp Solutions',
        location: 'San Francisco, CA',
        status: 'new' as const,
        source: 'linkedin',
      },
      {
        name: 'Sarah Johnson',
        email: 'sarah.j@innovatehealth.example.com',
        phone: '555-234-5678',
        title: 'Product Manager',
        company: 'Innovate Health',
        location: 'Boston, MA',
        status: 'contacted' as const,
        source: 'referral',
      },
      {
        name: 'Michael Chen',
        email: 'mchen@financeflow.example.com',
        phone: '555-345-6789',
        title: 'VP of Engineering',
        company: 'FinanceFlow Inc',
        location: 'New York, NY',
        status: 'qualified' as const,
        source: 'website',
      },
    ];

    const createdLeads = [];
    for (const lead of testLeads) {
      const created = await createLeadRepo(tenantId, lead);
      createdLeads.push(created);
    }

    return NextResponse.json({
      success: true,
      message: `Created ${createdCompanies.length} companies and ${createdLeads.length} leads`,
      companies: createdCompanies.length,
      leads: createdLeads.length,
      tenantId,
    });
  } catch (error: any) {
    console.error('Seed test data error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to seed test data' },
      { status: 500 }
    );
  }
}
