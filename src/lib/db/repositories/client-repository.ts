import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({ region: process.env.AWS_REGION });
const docClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = 'turnkey-clients';

export async function getAllClients(tenantId: string) {
  try {
    const result = await docClient.send(new ScanCommand({
      TableName: TABLE_NAME
    }));

    const companies = result.Items || [];
    console.log(`[getAllClients] Found ${companies.length} companies`);

    // Flatten contacts from companies
    const allContacts = companies.flatMap((company: any) => {
      const contacts = Array.isArray(company.contacts) ? company.contacts : [];
      return contacts.map((contact: any) => ({
        ...contact,
        companyId: company.id,
        companyName: company.name || company.title || 'Unknown Company'
      }));
    });

    console.log(`[getAllClients] Flattened ${allContacts.length} contacts`);
    return allContacts;
  } catch (error: any) {
    console.error('[getAllClients] Error:', error);
    return [];
  }
}

export async function addContactToClient(tenantId: string, clientId: string, contactData: any) {
  // keep your existing addContactToClient function here
  // (you can leave it as is)
}
