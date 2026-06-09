const { DynamoDBClient, ScanCommand } = require('@aws-sdk/client-dynamodb');
const { unmarshall } = require('@aws-sdk/util-dynamodb');

const client = new DynamoDBClient({ region: 'us-east-1' });

async function scanProfiles() {
  const response = await client.send(new ScanCommand({ TableName: 'turnkey-profiles' }));
  const profiles = response.Items?.map(i => unmarshall(i)) || [];
  console.log('Profiles:', JSON.stringify(profiles, null, 2));
}

scanProfiles().catch(console.error);
