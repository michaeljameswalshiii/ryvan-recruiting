/**
 * Migrate Leads to Jobs Script
 * 
 * Safely migrates data from turnkey-leads to turnkey-jobs.
 * 
 * Features:
 * - Dry-run mode (default) - use --execute to actually migrate
 * - Verbose logging with --verbose
 * - Tenant-specific migration with --tenantId=<id>
 * - Idempotency - skips leads already migrated (checks for duplicates)
 * - Clear progress output and summary
 * 
 * Usage:
 *   npx tsx scripts/migrate-leads-to-jobs.ts           # Dry run (preview)
 *   npx tsx scripts/migrate-leads-to-jobs.ts --execute # Actually migrate
 *   npx tsx scripts/migrate-leads-to-jobs.ts --verbose   # Verbose output
 *   npx tsx scripts/migrate-leads-to-jobs.ts --tenantId=abc123 --execute
 * 
 * @serverOnly
 */

import { 
  DynamoDBClient, 
  ScanCommand,
  PutItemCommand,
  QueryCommand,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';

// ============================================================================
// Configuration
// ============================================================================

const REGION = process.env.AWS_REGION || 'us-east-1';
const LEADS_TABLE = process.env.DYNAMODB_LEADS_TABLE || 'turnkey-leads';
const JOBS_TABLE = process.env.DYNAMODB_JOBS_TABLE || 'turnkey-jobs';

const client = new DynamoDBClient({ region: REGION });

// ============================================================================
// Types
// ============================================================================

interface LeadRecord {
  id: string;
  tenant_id: string;
  name?: string;
  email?: string;
  phone?: string;
  location?: string;
  title?: string;
  company?: string;
  status?: string;
  notes?: string;
  source?: string;
  created_at?: string;
  modified_at?: string;
}

interface JobRecord {
  tenant_id: string;
  id: string;
  title: string;
  description: string;
  location: string;
  salaryRange: string;
  employmentType: string;
  companyId: string;
  companyName: string;
  status: string;
  candidates: any[];
  created_at: string;
  modified_at: string;
  migrated_from?: string;  // Track source lead ID
}

// ============================================================================
// Helper Functions
// ============================================================================

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    dryRun: true,
    verbose: false,
    tenantId: null as string | null,
  };
  
  for (const arg of args) {
    if (arg === '--execute') {
      options.dryRun = false;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--verbose') {
      options.verbose = true;
    } else if (arg.startsWith('--tenantId=')) {
      options.tenantId = arg.split('=')[1];
    } else if (arg.startsWith('--tenant=')) {
      // Support both --tenantId and --tenant
      options.tenantId = arg.split('=')[1];
    }
  }
  
  return options;
}

// Map lead status to job status
function mapStatus(leadStatus?: string): string {
  if (!leadStatus) return 'Open';
  
  const statusMap: Record<string, string> = {
    'new': 'Open',
    'identification': 'Open',
    'outreach': 'Open',
    'conversation': 'Open',
    'presented': 'Open',
    'interview': 'Open',
    'accept': 'Closed',
    'rejected': 'Closed',
    'converted': 'Closed',
    'not_interested': 'Closed',
    'duplicate': 'Closed',
    'on_hold': 'On Hold',
  };
  
  return statusMap[leadStatus.toLowerCase()] || 'Open';
}

// Generate UUID
function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Log verbose messages
function logVerbose(msg: string, options: { verbose: boolean }) {
  if (options.verbose) {
    console.log(`  [VERBOSE] ${msg}`);
  }
}

// ============================================================================
// Database Operations
// ============================================================================

// Scan all leads from DynamoDB
async function scanLeads(tenantId?: string): Promise<LeadRecord[]> {
  const items: LeadRecord[] = [];
  let lastKey: Record<string, any> | undefined;
  
  console.log(`Scanning table: ${LEADS_TABLE}${tenantId ? ` for tenant: ${tenantId}` : ''}...`);
  
  do {
    const command = new ScanCommand({
      TableName: LEADS_TABLE,
      ExclusiveStartKey: lastKey,
      // Add filter if tenantId specified
      ...(tenantId && {
        FilterExpression: 'tenant_id = :tid',
        ExpressionAttributeValues: marshall({ ':tid': tenantId }),
      }),
    });
    
    const response = await client.send(command);
    
    if (response.Items) {
      for (const item of response.Items) {
        const decoded = unmarshall(item) as LeadRecord;
        items.push(decoded);
      }
    }
    
    lastKey = response.LastEvaluatedKey;
  } while (lastKey);
  
  return items;
}

// Check if a job was already migrated from a specific lead
async function isLeadMigrated(leadId: string, tenantId: string): Promise<boolean> {
  try {
    const command = new QueryCommand({
      TableName: JOBS_TABLE,
      KeyConditionExpression: 'tenant_id = :tid',
      FilterExpression: 'migrated_from = :leadId',
      ExpressionAttributeValues: marshall({
        ':tid': tenantId,
        ':leadId': leadId,
      }),
    });
    
    const response = await client.send(command);
    return (response.Items?.length || 0) > 0;
  } catch {
    // Table might not have the field indexed yet, just proceed
    return false;
  }
}

// Create a job record in DynamoDB
async function createJob(job: JobRecord): Promise<void> {
  await client.send(new PutItemCommand({
    TableName: JOBS_TABLE,
    Item: marshall(job),
  }));
}

// ============================================================================
// Transform Lead to Job
// ============================================================================

function transformLeadToJob(lead: LeadRecord): JobRecord {
  const now = new Date().toISOString();
  
  // Create job title from lead data
  let title = '';
  if (lead.title && lead.company) {
    title = `${lead.company} - ${lead.title}`;
  } else if (lead.title) {
    title = lead.title;
  } else if (lead.company) {
    title = lead.company;
  } else if (lead.name) {
    title = lead.name;  // Use lead name as fallback
  } else {
    title = 'Unnamed Job';
  }
  
// Use company name as companyId if companyId is empty (required for GSI)
  const companyIdValue = lead.company || lead.name || 'unknown';
  
  const job: JobRecord = {
    tenant_id: lead.tenant_id,
    id: generateId(),
    title: title,
    description: lead.notes || '',
    location: lead.location || '',
    salaryRange: '',
    employmentType: 'Full-time',
    companyId: companyIdValue,  // Use non-empty value for GSI
    companyName: lead.company || '',
    status: mapStatus(lead.status),
    candidates: [],
    created_at: lead.created_at || now,
    modified_at: lead.modified_at || now,
    migrated_from: lead.id,  // Track source for idempotency
  };
  
  return job;
}

// ============================================================================
// Main Migration
// ============================================================================

async function migrateLeadsToJobs(options: {
  dryRun: boolean;
  verbose: boolean;
  tenantId: string | null;
}) {
  const { dryRun, verbose, tenantId } = options;
  
  console.log('\n' + '='.repeat(60));
  console.log('LEADS → JOBS MIGRATION');
  console.log('='.repeat(60));
  console.log(`Mode: ${dryRun ? 'DRY RUN (preview only)' : 'EXECUTE (will migrate)'}`);
  console.log(`Verbose: ${verbose ? 'Yes' : 'No'}`);
  console.log(`Tenant Filter: ${tenantId || 'All tenants'}`);
  console.log('-'.repeat(60));
  
  // Get all leads
  const leads = await scanLeads(tenantId || undefined);
  console.log(`Found ${leads.length} lead(s)\n`);
  
  if (leads.length === 0) {
    console.log('No leads to migrate. Exiting.');
    return;
  }
  
  // Track stats
  let migrated = 0;
  let skipped = 0;
  let alreadyMigrated = 0;
  let errors = 0;
  
  // Process each lead
  for (let i = 0; i < leads.length; i++) {
    const lead = leads[i];
    const progress = `[${i + 1}/${leads.length}]`;
    
    console.log(`${progress} Processing lead: ${lead.name || 'unnamed'} (${lead.id})`);
    logVerbose(`  Tenant: ${lead.tenant_id}, Status: ${lead.status}`, options);
    
    // Skip leads without company or name (can't create valid job)
    if (!lead.company && !lead.name && !lead.title) {
      console.log(`  ⚠ Skipped: No company/name/title`);
      skipped++;
      continue;
    }
    
    // Check for idempotency - was this lead already migrated?
    const alreadyMigratedCheck = await isLeadMigrated(lead.id, lead.tenant_id);
    if (alreadyMigratedCheck) {
      console.log(`  ⏭ Already migrated (skipping)`);
      alreadyMigrated++;
      continue;
    }
    
    // Transform lead to job
    const job = transformLeadToJob(lead);
    logVerbose(`  → Job: "${job.title}" (status: ${job.status})`, options);
    
    if (dryRun) {
      console.log(`  🔍 [DRY RUN] Would create job: ${job.title}`);
      migrated++;
    } else {
      try {
        await createJob(job);
        console.log(`  ✅ Created job: ${job.title}`);
        migrated++;
      } catch (error: any) {
        console.log(`  ❌ Failed: ${error.message}`);
        errors++;
      }
    }
  }
  
  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('MIGRATION SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total leads processed: ${leads.length}`);
  console.log(`  - Migrated: ${migrated}`);
  console.log(`  - Already migrated: ${alreadyMigrated}`);
  console.log(`  - Skipped (no data): ${skipped}`);
  console.log(`  - Errors: ${errors}`);
  console.log('-'.repeat(60));
  
  if (dryRun) {
    console.log('\n⚠ This was a DRY RUN. No data was actually migrated.');
    console.log('   Run with --execute to actually migrate.\n');
  } else {
    console.log('\n✅ Migration complete!\n');
  }
}

// ============================================================================
// Entry Point
// ============================================================================

const options = parseArgs();

// Show help if requested
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
Leads → Jobs Migration Script

Usage:
  npx tsx scripts/migrate-leads-to-jobs.ts           # Dry run (preview)
  npx tsx scripts/migrate-leads-to-jobs.ts --execute # Actually migrate
  npx tsx scripts/migrate-leads-to-jobs.ts --verbose   # Verbose output
  npx tsx scripts/migrate-leads-to-jobs.ts --tenantId=abc123 --execute

Options:
  --execute         Actually perform migration (default is dry-run)
  --dry-run         Explicitly run in dry-run mode
  --verbose         Show detailed verbose output
  --tenantId=<id>   Only migrate leads for specific tenant
  --help           Show this help message
`);
  process.exit(0);
}

migrateLeadsToJobs(options)
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  });
