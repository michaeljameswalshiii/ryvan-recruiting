// src/lib/db/repositories/client-repository.ts
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({ region: process.env.AWS_REGION });
const docClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = 'turnkey-clients';

export async function getAllClients(tenantId: string) {
  try {
    console.log(`[getAllClients] Fetching for tenant: ${tenantId}`);

    const result = await docClient.send(new ScanCommand({
      TableName: TABLE_NAME
    }));

    const companies = result.Items || [];

    console.log(`[getAllClients] Loaded ${companies.length} companies from DynamoDB`);
    
    // Return companies directly (this was the bug)
    return companies;
  } catch (error: any) {
    console.error('[getAllClients] Error:', error);
    return [];
  }
}

export async function addContactToClient(tenantId: string, clientId: string, contactData: any) {
  // Keep as placeholder for now
  console.log(`[addContactToClient] Placeholder called for ${clientId}`);
  return { success: true };
}
