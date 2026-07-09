/**
 * Client Repository
 * Low-level DynamoDB operations for clients and contacts
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand, UpdateCommand, DeleteCommand, QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { v4 as uuidv4 } from 'uuid';

// Initialize DynamoDB client
const client = new DynamoDBClient({ region: process.env.AWS_REGION });
const docClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = 'turnkey-clients'; // Your main table

/**
 * Get all contacts (your primary records with company association)
 */
export async function getAllClients(tenantId: string) {
  console.log(`[getAllClients] Scanning for contacts in table: ${TABLE_NAME}`);

  try {
    const result = await docClient.send(new ScanCommand({
      TableName: TABLE_NAME
    }));

    const allContacts = result.Items || [];
    console.log(`[getAllClients] Found ${allContacts.length} contacts`);

    // Enrich with company info if available
    const enriched = allContacts.map(contact => ({
      ...contact,
      companyName: contact.company || contact.companyName || contact.company_id || 'Unknown Company'
    }));

    return enriched;
  } catch (error: any) {
    console.error('[getAllClients] Error:', error);
    return [];
  }
}

/**
 * Add a contact to a client
 */
export async function addContactToClient(tenantId: string, clientId: string, contactData: any) {
  if (!tenantId || !clientId) {
    throw new Error('Missing tenantId or clientId');
  }

  const contactId = contactData.id || uuidv4();

  const contact = {
    id: contactId,
    ...contactData,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  try {
    const getResult = await docClient.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { tenant_id: tenantId, id: clientId }
    }));

    const client = getResult.Item;

    if (!client) {
      throw new Error(`Client not found: ${clientId}`);
    }

    const contacts = Array.isArray(client.contacts) ? [...client.contacts] : [];
    contacts.push(contact);

    const updateResult = await docClient.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { tenant_id: tenantId, id: clientId },
      UpdateExpression: 'SET contacts = :contacts, updatedAt = :updatedAt',
      ExpressionAttributeValues: {
        ':contacts': contacts,
        ':updatedAt': new Date().toISOString()
      },
      ReturnValues: 'ALL_NEW'
    }));

    console.log(`[addContactToClient] Success - added contact ${contactId} to client ${clientId}`);
    return updateResult.Attributes;
  } catch (error: any) {
    console.error(`[addContactToClient] Error for tenant:${tenantId}, client:${clientId}`, error);
    throw error;
  }
}
