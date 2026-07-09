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

const TABLE_NAME = process.env.DYNAMODB_TABLE || 'TurnkeyOptimization';

/**
 * Add a contact to a client
 * Returns the updated client or throws on failure
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
    // Get current client
    const getResult = await docClient.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { tenant_id: tenantId, id: clientId }
    }));

    const client = getResult.Item;

    if (!client) {
      throw new Error(`Client not found: ${clientId}`);
    }

    // Add contact to contacts array (or create if doesn't exist)
    const contacts = Array.isArray(client.contacts) ? [...client.contacts] : [];
    contacts.push(contact);

    // Update client with new contacts array
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
    throw error;  // Critical: throw instead of returning null
  }
}

/* 
  Keep all your other repository functions (getAllClients, createClient, updateClient, etc.) unchanged below.
  Only the addContactToClient function was updated for better error handling.
*/

export {
  // ... export your other functions ...
  addContactToClient,
  // updateClientContact, removeClientContact, etc.
};
