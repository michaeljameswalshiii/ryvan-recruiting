/**
 * Migrate candidates/jobs/leads from old tenant to new tenant
 * 
 * OLD TENANT: tenant-1778593443269-u7u7dp4jo
 * NEW TENANT: tenant-2024-001
 */
const { DynamoDBClient, ScanCommand, UpdateCommand } = require('@aws-sdk/client-dynamodb');

const client = new DynamoDBClient({ region: 'us-east-1' });

const OLD_TENANT = 'tenant-1778593443269-u7u7dp4jo';
const NEW_TENANT = 'tenant-2024-001';

async function scanTable(tableName) {
  const result = await client.send(new ScanCommand({ TableName: tableName }));
  return result.Items || [];
}

async function updateTenantId(tableName, key, newTenant) {
  const keyObj = {};
  key.forEach(k => keyObj[k] = { S: key[1] });
  
  // Better: use UpdateCommand with proper params
  const params = {
    TableName: tableName,
    Key: {},
    UpdateExpression: 'set tenant_id = :tid',
    ExpressionAttributeValues: {
      ':tid': { S: newTenant }
    }
  };
  
  // Build key from item
  if (key[0] === 'id') {
    params.Key = { id: { S: key[1] } };
  } else if (key[0] === 'tenant_id' && key[2]) {
    params.Key = { tenant_id: { S: key[1] }, id: { S: key[2] } };
  }
  
  try {
    await client.send(new UpdateCommand(params));
    return true;
  } catch (e) {
    console.error('Error:', e.message);
    return false;
  }
}

async function main() {
  console.log('=== Jobs in OLD tenant ===');
  const jobs = await scanTable('turnkey-jobs');
  const oldJobs = jobs.filter(j => j.tenant_id?.S === OLD_TENANT);
  console.log(`Found ${oldJobs.length} jobs to migrate`);
  oldJobs.forEach(j => {
    console.log(`  - ${j.companyName?.S} (id: ${j.id?.S})`);
  });

  console.log('\n=== Leads in OLD tenant ===');
  const leads = await scanTable('turnkey-leads');
  const oldLeads = leads.filter(l => l.tenant_id?.S === OLD_TENANT);
  console.log(`Found ${oldLeads.length} leads to migrate`);
  oldLeads.slice(0, 10).forEach(l => {
    console.log(`  - ${l.name?.S}`);
  });
  if (oldLeads.length > 10) console.log(`  ... and ${oldLeads.length - 10} more`);
}

main().catch(console.error);
