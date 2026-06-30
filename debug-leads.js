/**
 * Debug script to view leads table - has contact names
 */

const { DynamoDBClient, ScanCommand } = require('@aws-sdk/client-dynamodb');
const { unmarshall } = require('@aws-sdk/util-dynamodb');

const client = new DynamoDBClient({ region: 'us-east-1' });

async function main() {
  console.log('=== Leads Table Sample ===\n');
  
  const command = new ScanCommand({
    TableName: 'turnkey-leads',
    Limit: 5
  });
  
  const response = await client.send(command);
  
  response.Items?.forEach((item, i) => {
    const data = unmarshall(item);
    console.log(`--- Lead ${i + 1} ---`);
    console.log('ID:', data.id);
    console.log('Name:', data.name);
    console.log('Email:', data.email);
    console.log('Status:', data.status);
    console.log('Full:', JSON.stringify(data, null, 2));
    console.log();
  });
}

main().catch(console.error);
