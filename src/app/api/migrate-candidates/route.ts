/**
 * Migrate Candidates API Route
 * Moves candidates with legacy/non-pipeline status to 'identification' stage
 * 
 * @serverOnly
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionTenantId } from '@/lib/server-auth';
import { 
  getAllLeads, 
  PIPELINE_STAGES, 
  updateLeadsToIdentification 
} from '@/lib/db/repositories/lead-repository';

/**
 * POST /api/migrate-candidates
 * Migrate leads with old status values to 'identification' stage
 */
export async function POST(request: NextRequest) {
  try {
    const tenantId = await getSessionTenantId();
    
    if (!tenantId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    console.log('[Migrate] Starting migration for tenant:', tenantId);

    // Get all leads
    const allLeads = await getAllLeads(tenantId);
    
// Find leads that are NOT in the current pipeline stages
    const leadsToMigrate = allLeads.filter(lead => {
      const status = lead.status;
      // Lead needs migration if status is not in pipeline stages or is undefined
      return !status || !PIPELINE_STAGES.includes(status);
    });

    if (leadsToMigrate.length === 0) {
      console.log('[Migrate] No leads need migration');
      return NextResponse.json({
        success: true,
        message: 'No leads need migration',
        migrated: 0,
      });
    }

    console.log(`[Migrate] Found ${leadsToMigrate.length} leads needing migration`);

// Get their IDs (filter out undefined)
    const leadIds = leadsToMigrate
      .map(lead => lead.id)
      .filter((id): id is string => !!id);
    
    // Update them all to 'identification'
    const result = await updateLeadsToIdentification(tenantId, leadIds);

    console.log('[Migrate] Migration complete:', result);

    return NextResponse.json({
      success: true,
      message: `Migrated ${result.updated} leads to identification stage`,
      migrated: result.updated,
      errors: result.errors.length > 0 ? result.errors : undefined,
    });
  } catch (error: any) {
    console.error('[Migrate] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Migration failed' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/migrate-candidates
 * Get count of leads that need migration (for preview)
 */
export async function GET(request: NextRequest) {
  try {
    const tenantId = await getSessionTenantId();
    
    if (!tenantId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get all leads
    const allLeads = await getAllLeads(tenantId);
    
// Find leads that are NOT in the current pipeline stages
    const leadsToMigrate = allLeads.filter(lead => {
      const status = lead.status;
      return !status || !PIPELINE_STAGES.includes(status);
    });

    // Group by their current status for display
    const byStatus: Record<string, number> = {};
    for (const lead of leadsToMigrate) {
      const status = lead.status || '(empty)';
      byStatus[status] = (byStatus[status] || 0) + 1;
    }

    return NextResponse.json({
      totalLeads: allLeads.length,
      needMigration: leadsToMigrate.length,
      byStatus,
      pipelineStages: PIPELINE_STAGES,
    });
  } catch (error: any) {
    console.error('[Migrate] GET Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to check migration status' },
      { status: 500 }
    );
  }
}
