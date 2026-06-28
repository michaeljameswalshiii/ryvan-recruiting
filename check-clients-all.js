/**
 * Scan ALL clients without tenant filter
 */
const { DynamoDBClient, ScanCommand } = require('@aws-sdk/client-dynamodb');

const client = new DynamoDBClient({ region: 'us-east-1' });

async function main() {
  const result = await client.send(new ScanCommand({ TableName: 'turnkey-clients' }));
  console.log('Total in turnkey-clients:', result.Count || 0);
  result.Items?.forEach((item, i) => {
    console.log(`--- ${i+1}. ${item.name?.S || 'unnamed'} ---`);
    console.log(`  tenant_id: ${item.tenant_id?.S}`);
    console.log(`  id: ${item.id?.S}`);
  });
}

main().catch(console.error);
