import { DynamoDBClient, ScanCommand } from '@aws-sdk/client-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';

const client = new DynamoDBClient({
  region: process.env.AWS_REGION,
});

export async function getAllContactsFromEvents() {
  const tableName = process.env.DYNAMODB_EVENTS_TABLE || 'turnkey-events';

  const command = new ScanCommand({
    TableName: tableName,
    FilterExpression: "begins_with(PK, :contact) OR begins_with(PK, :candidate)",
    ExpressionAttributeValues: {
      ":contact": { S: "CONTACT#" },
      ":candidate": { S: "CANDIDATE#" },
    },
  });

  const response = await client.send(command);
  const items = (response.Items || []).map(item => unmarshall(item));

  // Keep latest version per entity
  const latestMap = new Map();
  items.forEach(item => {
    const key = item.entityId || item.PK?.split('#')[1] || item.id;
    if (key) {
      const existing = latestMap.get(key);
      const newTime = item.updatedAt || item.createdAt || '0';
      const oldTime = existing?.updatedAt || existing?.createdAt || '0';
      if (!existing || newTime > oldTime) {
        latestMap.set(key, item);
      }
    }
  });

  return Array.from(latestMap.values()).sort((a, b) => 
    String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || ''))
  );
}
