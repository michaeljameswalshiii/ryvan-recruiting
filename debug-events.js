/**
 * Debug script to view events table data structure
 */

const { DynamoDBClient, ScanCommand } = require('@aws-sdk/client-dynamodb');
const { unmarshall } = require('@aws-sdk/util-dynamodb');

const client = new DynamoDBClient({ region: 'us-east-1' });
const tableName = process.env.DYNAMODB_EVENTS_TABLE || 'turnkey-events';

async function main() {
  console.log('=== Events Table Sample ===\n');
  
  const command = new ScanCommand({
    TableName: tableName,
    Limit: 5
  });
  
  const response = await client.send(command);
  
  response.Items?.forEach((item, i) => {
    const data = unmarshall(item);
    console.log(`--- Event ${i + 1} ---`);
    console.log(JSON.stringify(data, null, 2));
    console.log();
  });
}

main().catch(console.error);
