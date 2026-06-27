const { DynamoDBClient, ListTablesCommand } = require('@aws-sdk/client-dynamodb');

const client = new DynamoDBClient({ 
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY ? {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  } : undefined
});

(async () => {
  try {
    const tables = await client.send(new ListTablesCommand({}));
    console.log('Tables:', tables.TableNames.join(', '));
  } catch(e) { 
    console.log('Error:', e.message); 
  }
})();
