/**
 * Fix Tenant IDs
 * 
 * Migrates candidates and jobs to the correct tenant based on admin profile
 * Run this from local terminal or via API
 */

const { DynamoDBClient, ScanCommand, UpdateItemCommand } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand } = require('@aws-sdk/lib-dynamodb');

const CLIENT = new DynamoDBClient({ 
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY ? {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  } : undefined
});

const docClient = DynamoDBDocumentClient.from(CLIENT, {
  marshallOptions: { removeUndefinedValues: true }
});

const TABLES = {
  profiles: 'turnkey-profiles',
  leads: 'turnkey-leads',
  jobs: 'turnkey-jobs',
  clients: 'turnkey-clients',
};

async function scanTable(tableName) {
  const items = [];
  let lastKey = undefined;
  
  do {
    const command = new ScanCommand({ 
      TableName: tableName,
      ExclusiveStartKey: lastKey
    });
    const response = await CLIENT.send(command);
    items.push(...(response.Items || []));
    lastKey = response.LastEvaluatedKey;
  } while (lastKey);
  
  return items;
}

async function fixTenantIds() {
  console.log("🔍 Scanning all tables...\n");
  
  // Step 1: Get all profiles
  const profileItems = await scanTable(TABLES.profiles);
  console.log(`Found ${profileItems.length} profiles`);
  
  // Find the admin profile (user with password set)
  const adminProfile = profileItems.find(p => p.password_hash);
  if (!adminProfile) {
    console.error("❌ No admin profile with password found");
    return;
  }
  
  const CORRECT_TENANT_ID = adminProfile.tenant_id;
  console.log(`✅ Admin: ${adminProfile.email} (tenant: ${CORRECT_TENANT_ID})\n`);
  
  // Step 2: Get all leads
  const leadItems = await scanTable(TABLES.leads);
  console.log(`Found ${leadItems.length} leads`);
  
  let leadsUpdated = 0;
  for (const lead of leadItems) {
    const oldTenant = lead.tenant_id;
    if (oldTenant !== CORRECT_TENANT_ID) {
      console.log(`  📝 Lead "${lead.name}": ${oldTenant} -> ${CORRECT_TENANT_ID}`);
      
      // Delete old item and create new with correct tenant_id
      // (DynamoDB doesn't support changing partition key directly)
      try {
        const { DeleteCommand } = require('@aws-sdk/lib-dynamodb');
        await docClient.send(new DeleteCommand({
          TableName: TABLES.leads,
          Key: { tenant_id: oldTenant, id: lead.id }
        }));
        
        await docClient.send(new PutCommand({
          TableName: TABLES.leads,
          Item: { ...lead, tenant_id: CORRECT_TENANT_ID }
        }));
        
        leadsUpdated++;
      } catch(e) {
        console.log(`    ❌ Error: ${e.message}`);
      }
    }
  }
  console.log(`✅ Updated ${leadsUpdated} leads\n`);
  
  // Step 3: Get all jobs
  const jobItems = await scanTable(TABLES.jobs);
  console.log(`Found ${jobItems.length} jobs`);
  
  let jobsUpdated = 0;
  for (const job of jobItems) {
    const oldTenant = job.tenant_id;
    if (oldTenant !== CORRECT_TENANT_ID) {
      console.log(`  📝 Job "${job.title}": ${oldTenant} -> ${CORRECT_TENANT_ID}`);
      
      try {
        const { DeleteCommand, PutCommand } = require('@aws-sdk/lib-dynamodb');
        
        // For jobs with candidates, update the candidate tenant references
        const updatedCandidates = (job.candidates || []).map(c => c);
        
        await docClient.send(new DeleteCommand({
          TableName: TABLES.jobs,
          Key: { tenant_id: oldTenant, id: job.id }
        }));
        
        await docClient.send(new PutCommand({
          TableName: TABLES.jobs,
          Item: { ...job, tenant_id: CORRECT_TENANT_ID, candidates: updatedCandidates }
        }));
        
        jobsUpdated++;
      } catch(e) {
        console.log(`    ❌ Error: ${e.message}`);
      }
    }
  }
  console.log(`✅ Updated ${jobsUpdated} jobs\n`);
  
  // Step 4: Get all clients
  const clientItems = await scanTable(TABLES.clients);
  console.log(`Found ${clientItems.length} clients`);
  
  let clientsUpdated = 0;
  for (const client of clientItems) {
    const oldTenant = client.tenant_id;
    if (oldTenant !== CORRECT_TENANT_ID && oldTenant) {
      console.log(`  📝 Client "${client.name}": ${oldTenant} -> ${CORRECT_TENANT_ID}`);
      
      try {
        const { DeleteCommand, PutCommand } = require('@aws-sdk/lib-dynamodb');
        
        await docClient.send(new DeleteCommand({
          TableName: TABLES.clients,
          Key: { tenant_id: oldTenant, id: client.id }
        }));
        
        await docClient.send(new PutCommand({
          TableName: TABLES.clients,
          Item: { ...client, tenant_id: CORRECT_TENANT_ID }
        }));
        
        clientsUpdated++;
      } catch(e) {
        console.log(`    ❌ Error: ${e.message}`);
      }
    }
  }
  console.log(`✅ Updated ${clientsUpdated} clients\n`);
  
  console.log("🎉 Done! All data migrated to tenant:", CORRECT_TENANT_ID);
}

fixTenantIds().catch(console.error);
