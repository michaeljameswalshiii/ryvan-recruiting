const { DynamoDBClient, ScanCommand } = require('@aws-sdk/client-dynamodb');
const { unmarshall } = require('@aws-sdk/util-dynamodb');

async function main() {
  const client = new DynamoDBClient({ region: 'us-east-1' });
  const tableName = process.env.DYNAMODB_CLIENTS_TABLE || 'turnkey-clients';

  const command = new ScanCommand({
    TableName: tableName,
    Limit: 5
  });

  const res = await client.send(command);
  const items = (res.Items || []).map(item => unmarshall(item));
  
  console.log('Sample rows from clients table:');
  items.forEach((item, i) => {
    console.log(`\n--- Row ${i + 1} ---`);
    console.log('Company Name:', item.name);
    console.log('Contacts:', JSON.stringify(item.contacts || [], null, 2));
  });
}

main().catch(console.error);
