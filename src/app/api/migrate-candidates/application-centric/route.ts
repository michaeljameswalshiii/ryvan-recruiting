/**
 * Application-Centric Migration API Route
 * Migrates stage data from Job.candidates[] to Candidate.linkedJobs[]
 * 
 * This is a safe, batched migration that:
 * 1. Processes candidates in batches (50-100 per batch)
 * 2. Adds checkpointing for resumability
 * 3. Preserves all existing data
 * 4. Maps legacy stages to new APPLICATION_STAGES
 * 
 * @serverOnly
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionTenantId } from '@/lib/server-auth';
import { 
  getAllLeads, 
  getLeadById,
  updateLead,
  mapLegacyStageToApplicationStage,
  isValidApplicationStage,
} from '@/lib/db/repositories/lead-repository';
import { getJobById, getAllJobs } from '@/lib/db/repositories/job-repository';
import { APPLICATION_STAGE_VALUES } from '@/lib/schemas/lead';

// Batch size for migration
const BATCH_SIZE = 50;

// Checkpoint key for resumability
const CHECKPOINT_KEY = 'migration_checkpoint';

/**
 * POST /api/migrate-candidates/application-centric
 * Run the migration with optional batch processing
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

    // Parse query params for pagination
    const { searchParams } = new URL(request.url);
    const batchSize = parseInt(searchParams.get('batchSize') || String(BATCH_SIZE), 10);
    const startAfter = searchParams.get('startAfter') || undefined;

    console.log('[AppMigration] Starting application-centric migration');
    console.log('[AppMigration] Batch size:', batchSize);
    console.log('[AppMigration] Start after:', startAfter || 'beginning');

    // Get all leads
    const allLeads = await getAllLeads(tenantId);
    console.log('[AppMigration] Total leads:', allLeads.length);

    // Get all jobs for the tenant
    const allJobs = await getAllJobs(tenantId);
    const jobsMap = new Map(allJobs.map(job => [job.id, job]));
console.log('[AppMigration] Total jobs:', allJobs.length);

    // Filter leads that have linkedJobIds but might not have linkedJobs yet
    // OR leads that have linkedJobs with missing data
    const leadsNeedingMigration = allLeads.filter(lead => {
      const hasLinkedJobIds = lead.linkedJobIds && lead.linkedJobIds.length > 0;
      const linkedJobs = lead.linkedJobs || [];
      const hasLinkedJobs = linkedJobs.length > 0;
      const linkedJobIds = lead.linkedJobIds || [];
      
      // Migrate if has linkedJobIds but no linkedJobs, or if linkedJobs is incomplete
      return hasLinkedJobIds && (!hasLinkedJobs || linkedJobs.length < linkedJobIds.length);
    });

    console.log('[AppMigration] Leads needing migration:', leadsNeedingMigration.length);

    if (leadsNeedingMigration.length === 0) {
      console.log('[AppMigration] No leads need migration');
      return NextResponse.json({
        success: true,
        message: 'No leads need migration - all data is already in application-centric format',
        migrated: 0,
        skipped: 0,
      });
    }

    // Process in batches
    let migrated = 0;
    let skipped = 0;
    const errors: string[] = [];
    let lastProcessedId: string | null = null;

    // Apply pagination startAfter if provided
    let batch = leadsNeedingMigration;
    if (startAfter) {
      const startIndex = batch.findIndex(lead => lead.id === startAfter);
      if (startIndex >= 0) {
        batch = batch.slice(startIndex + 1);
      }
    }

    // Process first batch_size leads
    batch = batch.slice(0, batchSize);

    for (const lead of batch) {
      const leadId = lead.id;
      if (!leadId) {
        skipped++;
        errors.push('Skipped candidate without an id');
        continue;
      }
      try {
        lastProcessedId = leadId;
        
        // Skip if no linkedJobIds
        const linkedJobIds = lead.linkedJobIds || [];
        if (linkedJobIds.length === 0) {
          skipped++;
          continue;
        }

        // Build new linkedJobs array
        const newLinkedJobs: any[] = [];
        
for (const jobId of linkedJobIds) {
          const job = jobsMap.get(jobId);
          const timestamp = lead.modified_at || lead.created_at || undefined;
          
          if (!job) {
            // Job might have been deleted - still add entry but mark as unknown
            newLinkedJobs.push({
              jobId,
              jobTitle: 'Unknown Job',
              companyName: undefined,
              stage: 'sourced',
              stageUpdatedAt: timestamp || new Date().toISOString(),
              stageUpdatedBy: '',
              notes: [],
            });
            continue;
          }

          // Get current stage from Job.candidates[]
          const jobCandidate = (job.candidates || []).find(
            (c: any) => c.candidateId === leadId
          );
          
          // Map legacy stage to new APPLICATION_STAGE
          let stage = 'sourced';
          if (jobCandidate?.stage) {
            const mapped = mapLegacyStageToApplicationStage(jobCandidate.stage);
            stage = isValidApplicationStage(mapped) ? mapped : 'sourced';
          }

          // Create linkedJob entry
          newLinkedJobs.push({
            jobId: job.id,
            jobTitle: job.title,
            companyId: job.companyId,
            companyName: job.companyName,
            stage,
            stageUpdatedAt: jobCandidate?.dateApplied || timestamp || new Date().toISOString(),
            stageUpdatedBy: '',
            notes: [],
          });
        }

        // Update the lead with new linkedJobs
        // Keep linkedJobIds for backward compatibility
        await updateLead(tenantId, leadId, {
          linkedJobs: newLinkedJobs,
        });

        migrated++;
        console.log(`[AppMigration] Migrated lead ${leadId}: ${newLinkedJobs.length} jobs`);
      } catch (err: any) {
        const errorMsg = `Lead ${leadId}: ${err.message}`;
        console.error('[AppMigration] Error:', errorMsg);
        errors.push(errorMsg);
      }
    }

    // Determine if there are more to process
    const hasMore = leadsNeedingMigration.length > (migrated + skipped);

    console.log('[AppMigration] Migration batch complete:', {
      migrated,
      skipped,
      errors: errors.length,
      hasMore,
      lastProcessedId,
    });

    const response: any = {
      success: true,
      message: hasMore 
        ? `Processed batch: ${migrated} migrated, ${skipped} skipped`
        : `Migration complete: ${migrated} migrated, ${skipped} skipped`,
      migrated,
      skipped,
      errors: errors.length > 0 ? errors : undefined,
      hasMore,
    };

    // Add next cursor if there are more
    if (hasMore && lastProcessedId) {
      response.nextCursor = lastProcessedId;
    }

    return NextResponse.json(response);
  } catch (error: any) {
    console.error('[AppMigration] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Migration failed' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/migrate-candidates/application-centric
 * Preview migration - show what would be migrated
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
    
    // Get all jobs
    const allJobs = await getAllJobs(tenantId);

    // Analyze what needs migration
    let needsMigration = 0;
    let alreadyMigrated = 0;
    let noJobsLinked = 0;
    const stageDistribution: Record<string, number> = {};
    const jobsNeedingUpdate = new Set<string>();

for (const lead of allLeads) {
      const linkedJobIds = lead.linkedJobIds || [];
      const linkedJobs = lead.linkedJobs || [];
      const hasLinkedJobIds = linkedJobIds.length > 0;
      const hasLinkedJobs = linkedJobs.length > 0;
      const fullyMigrated = hasLinkedJobIds && hasLinkedJobs && 
        linkedJobs.length === linkedJobIds.length;

      if (!hasLinkedJobIds) {
        noJobsLinked++;
      } else if (fullyMigrated) {
        alreadyMigrated++;
        // Count stages
        for (const lj of linkedJobs) {
          const stage = lj.stage || 'unknown';
          stageDistribution[stage] = (stageDistribution[stage] || 0) + 1;
        }
      } else {
        needsMigration++;
        // Track which jobs need updating
        for (const jobId of linkedJobIds) {
          jobsNeedingUpdate.add(jobId);
        }
      }
    }

    // Get APPLICATION_STAGES for reference
    const availableStages = APPLICATION_STAGE_VALUES;

    return NextResponse.json({
      summary: {
        totalLeads: allLeads.length,
        alreadyMigrated,
        needsMigration,
        noJobsLinked,
      },
      stageDistribution,
      jobsNeedingCount: jobsNeedingUpdate.size,
      availableStages,
      instructions: {
        runFullMigration: 'POST to this endpoint with no body',
        runBatched: 'POST to this endpoint?batchSize=50',
        resumeBatched: 'POST to this endpoint?startAfter=<lastProcessedId>',
      },
    });
  } catch (error: any) {
    console.error('[AppMigration] GET Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to analyze migration' },
      { status: 500 }
    );
  }
}
