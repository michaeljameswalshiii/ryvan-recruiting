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
 * Get all contacts by pulling from companies (matches your data model)
 */
export async function getAllClients(tenantId: string) {
  console.log(`[getAllClients] Scanning companies for tenant: ${tenantId || 'all'}`);

  try {
    const result = await docClient.send(new ScanCommand({
      TableName: TABLE_NAME
    }));

    const companies = result.Items || [];
    console.log(`[getAllClients] Found ${companies.length} companies in table`);

    // Flatten contacts from all companies
    const allContacts = companies.flatMap(company => {
      const contacts = Array.isArray(company.contacts) ? company.contacts : [];
      return contacts.map(contact => ({
        ...contact,
        companyId: company.id,
        companyName: company.name || company.title || 'Unknown Company',
        tenantId: company.tenant_id || tenantId
      }));
    });

    console.log(`[getAllClients] Flattened ${allContacts.length} contacts`);
    return allContacts;
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
