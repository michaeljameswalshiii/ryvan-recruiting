const { DynamoDBClient, ScanCommand } = require('@aws-sdk/client-dynamodb');
const { unmarshall } = require('@aws-sdk/util-dynamodb');

const client = new DynamoDBClient({ region: 'us-east-1' });

async function analyze() {
  const cmd = new ScanCommand({ TableName: 'turnkey-events', Limit: 10 });
  const res = await client.send(cmd);
  
  const items = res.Items.map(i => unmarshall(i));
  
  console.log('Sample items from turnkey-events:\n');
  items.forEach((item, i) => {
    console.log(`--- Item ${i + 1} ---`);
    console.log(JSON.stringify(item, null, 2));
    console.log('');
  });
  
  // Show unique PK prefixes
  const pks = items.map(i => i.PK).filter(Boolean);
  const prefixes = [...new Set(pks.map(pk => pk.split('#')[0]))];
  console.log('PK prefixes:', prefixes);
}

analyze();
