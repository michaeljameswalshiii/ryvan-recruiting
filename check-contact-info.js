const { DynamoDBClient, ScanCommand } = require('@aws-sdk/client-dynamodb');
const { unmarshall } = require('@aws-sdk/util-dynamodb');

async function main() {
  const client = new DynamoDBClient({ region: 'us-east-1' });
  const tableName = process.env.DYNAMODB_EVENTS_TABLE || 'turnkey-events';

  // First, get distinct entityTypes
  const command = new ScanCommand({
    TableName: tableName,
    Limit: 20,
    ProjectionExpression: 'entityType, #pk, title, metadata',
    ExpressionAttributeNames: { '#pk': 'PK' }
  });

  const res = await client.send(command);
  const items = (res.Items || []).map(item => unmarshall(item));
  
  console.log('Looking at entityType values in events table:');
  const entityTypes = new Set();
  items.forEach(item => {
    if (item.entityType) {
      entityTypes.add(item.entityType);
    }
  });
  console.log('Found entityTypes:', Array.from(entityTypes));
  
  console.log('\nSample items:');
  items.forEach((item, i) => {
    console.log(`\n--- Row ${i + 1} ---`);
    console.log('entityType:', item.entityType);
    console.log('title:', item.title);
    console.log('PK:', item.PK);
    console.log('metadata:', JSON.stringify(item.metadata || {}, null, 2));
  });
}

main().catch(console.error);
