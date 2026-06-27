const { DynamoDBClient, ScanCommand } = require('@aws-sdk/client-dynamodb');
const { unmarshall } = require('@aws-sdk/util-dynamodb');

const client = new DynamoDBClient({ 
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY ? {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  } : undefined
});

async function scanTable(tableName, limit = 5) {
  try {
    const command = new ScanCommand({ TableName: tableName, Limit: limit });
    const response = await client.send(command);
    
    if (!response.Items || response.Items.length === 0) {
      console.log(`\n=== ${tableName}: EMPTY ===`);
      return;
    }
    
    console.log(`\n=== ${tableName} (${response.Count} items) ===`);
    response.Items.forEach((item, i) => {
      const data = unmarshall(item);
      console.log(`\n--- Item ${i+1} ---`);
      console.log(JSON.stringify(data, null, 2));
    });
  } catch(e) { 
    console.log(`Error scanning ${tableName}:`, e.message); 
  }
}

(async () => {
  console.log("=== CHECKING DYNAMODB DATA ===");
  await scanTable('turnkey-profiles', 3);
  await scanTable('turnkey-leads', 5);
  await scanTable('turnkey-jobs', 5);
  await scanTable('turnkey-clients', 3);
})();
