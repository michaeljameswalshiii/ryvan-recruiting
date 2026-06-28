/**
 * Check pipeline table
 */
const { DynamoDBClient, ScanCommand } = require('@aws-sdk/client-dynamodb');

const region = process.env.AWS_REGION || 'us-east-1';
const client = new DynamoDBClient({ region });

async function main() {
  console.log('=== turnkey-pipeline ===');
  const result = await client.send(new ScanCommand({
    TableName: 'turnkey-pipeline',
  }));
  console.log('Items:', result.Items?.length || 0);
(result.Items || []).forEach((item, i) => {
    console.log(`--- Item ${i + 1} ---`);
    console.log(JSON.stringify(item, null, 2));
  });
}

main().catch(console.error);
