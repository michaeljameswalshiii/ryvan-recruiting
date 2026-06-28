/**
 * Check all data by tenant
 */
const { DynamoDBClient, ScanCommand } = require('@aws-sdk/client-dynamodb');

const client = new DynamoDBClient({ region: 'us-east-1' });

async function scanTable(tableName) {
  const result = await client.send(new ScanCommand({ TableName: tableName }));
  return result.Items || [];
}

async function main() {
  const oldTenant = 'tenant-1778593443269-u7u7dp4jo';
  const newTenant = 'tenant-2024-001';

  console.log('=== JOBS by tenant ===');
  const jobs = await scanTable('turnkey-jobs');
  jobs.forEach(j => {
    console.log(`  ${j.companyName?.S || j.companyId?.S} - tenant: ${j.tenant_id?.S}`);
  });

  console.log('\n=== LEADS by tenant ===');
  const leads = await scanTable('turnkey-leads');
  leads.forEach(l => {
    console.log(`  ${l.name?.S} - tenant: ${l.tenant_id?.S}`);
  });
}

main().catch(console.error);
