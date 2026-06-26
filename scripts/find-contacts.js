const { DynamoDBClient, ScanCommand } = require('@aws-sdk/client-dynamodb');
const { unmarshall } = require('@aws-sdk/util-dynamodb');

const client = new DynamoDBClient({ region: 'us-east-1' });

async function findContacts() {
  // Scan for all items with entityType = "candidate" or "contact"
  const cmd = new ScanCommand({ 
    TableName: 'turnkey-events',
    FilterExpression: "entityType = :type",
    ExpressionAttributeValues: {
      ":type": { S: "candidate" }
    },
    Limit: 20
  });
  const res = await client.send(cmd);
  const items = res.Items.map(i => unmarshall(i));
  
  console.log('Found', items.length, 'candidates\n');
  items.forEach((item, i) => {
    console.log(`${i+1}. PK: ${item.PK}`);
    console.log(`   entityId: ${item.entityId}`);
    console.log(`   tenantId: ${item.tenantId}`);
    console.log(`   title: ${item.title}`);
    console.log(`   metadata:`, JSON.stringify(item.metadata));
    console.log('');
  });
}

findContacts().catch(console.error);
