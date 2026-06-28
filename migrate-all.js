/**
 * Migrate jobs and leads from old tenant to new tenant
 * Uses DynamoDBDocumentClient for proper type conversion
 */
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand, PutCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient({ region: 'us-east-1' });
const docClient = DynamoDBDocumentClient.from(client);

const OLD_TENANT = 'tenant-1778593443269-u7u7dp4jo';
const NEW_TENANT = 'tenant-2024-001';

async function scanTable(tableName) {
  const result = await docClient.send(new ScanCommand({ TableName: tableName }));
  return result.Items || [];
}

async function migrateJobs() {
  console.log('\n=== Migrating JOBS ===');
  const jobs = await scanTable('turnkey-jobs');
  const oldJobs = jobs.filter(j => j.tenant_id === OLD_TENANT);
  
  let migrated = 0;
  for (const job of oldJobs) {
    const jobId = job.id;
    if (!jobId) continue;
    
    // Create new item with new tenant
    const newItem = { ...job, tenant_id: NEW_TENANT };
    
    try {
      // Put new item
      await docClient.send(new PutCommand({
        TableName: 'turnkey-jobs',
        Item: newItem
      }));
      
      // Delete old item using old tenant_id as key
      await docClient.send(new DeleteCommand({
        TableName: 'turnkey-jobs',
        Key: { tenant_id: OLD_TENANT, id: jobId }
      }));
      
      migrated++;
      console.log(`  Migrated: ${job.companyName || jobId}`);
    } catch (e) {
      console.error(`  Error: ${e.message}`);
    }
  }
  console.log(`  ✅ Migrated ${migrated} jobs`);
  return migrated;
}

async function migrateLeads() {
  console.log('\n=== Migrating LEADS (candidates) ===');
  const leads = await scanTable('turnkey-leads');
  const oldLeads = leads.filter(l => l.tenant_id === OLD_TENANT);
  
  let migrated = 0;
  for (const lead of oldLeads) {
    const leadId = lead.id;
    if (!leadId) continue;
    
    // Create new item with new tenant
    const newItem = { ...lead, tenant_id: NEW_TENANT };
    
    try {
      // Put new item
      await docClient.send(new PutCommand({
        TableName: 'turnkey-leads',
        Item: newItem
      }));
      
      // Delete old item using old tenant_id as key
      await docClient.send(new DeleteCommand({
        TableName: 'turnkey-leads',
        Key: { tenant_id: OLD_TENANT, id: leadId }
      }));
      
      migrated++;
      console.log(`  Migrated: ${lead.name || leadId}`);
    } catch (e) {
      console.error(`  Error: ${e.message}`);
    }
  }
  console.log(`  ✅ Migrated ${migrated} leads`);
  return migrated;
}

async function main() {
  console.log(`Migrating from ${OLD_TENANT} → ${NEW_TENANT}`);
  
  const jobsMigrated = await migrateJobs();
  const leadsMigrated = await migrateLeads();
  
  console.log(`\n✅ DONE! Migrated ${jobsMigrated} jobs and ${leadsMigrated} leads`);
}

main().catch(console.error);
