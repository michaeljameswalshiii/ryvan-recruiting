/**
 * Email Connection Repository
 * Server-only data access for user email OAuth connections
 * 
 * @serverOnly
 */

import {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  UpdateItemCommand,
  DeleteItemCommand,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { type UserEmailConnection, type EmailProvider, getConnectionId } from '../../schemas/email-connection';

// Configuration
const region = process.env.AWS_REGION || 'us-east-1';
const emailConnectionsTable = process.env.DYNAMODB_EMAIL_CONNECTIONS_TABLE || 'turnkey-email-connections';

// DynamoDB client
function isMissingTable(error: unknown): boolean {
  const name =
    error && typeof error === "object" && "name" in error
      ? String((error as { name?: string }).name)
      : "";
  const message = error instanceof Error ? error.message : String(error || "");
  return (
    name === "ResourceNotFoundException" ||
    /Requested resource not found/i.test(message)
  );
}

function getClient(): DynamoDBClient {
  const accessKeyId =
    process.env.AWS_ACCESS_KEY_ID || process.env.MY_AWS_ACCESS_KEY_ID;
  const secretAccessKey =
    process.env.AWS_SECRET_ACCESS_KEY || process.env.MY_AWS_SECRET_ACCESS_KEY;
  return new DynamoDBClient({
    region,
    credentials:
      accessKeyId && secretAccessKey
        ? { accessKeyId, secretAccessKey }
        : undefined,
  });
}

const client = getClient();

/**
 * Get an email connection by user ID and provider
 */
export async function getEmailConnection(
  userId: string,
  provider: EmailProvider
): Promise<UserEmailConnection | null> {
  const connectionId = getConnectionId(userId, provider);
  
  const command = new GetItemCommand({
    TableName: emailConnectionsTable,
    Key: marshall({ connectionId }),
  });
  
  try {
    const response = await client.send(command);
    if (!response.Item) return null;
    return unmarshall(response.Item) as unknown as UserEmailConnection;
  } catch (error) {
    if (isMissingTable(error)) {
      console.warn(
        "[email-connections] table missing; treating as no connection",
        emailConnectionsTable
      );
      return null;
    }
    throw error;
  }
}

/**
 * Get all email connections for a user.
 *
 * Table PK is connectionId = `${userId}#${provider}` (no GSI on userId),
 * so we GetItem per known provider instead of an invalid begins_with Query.
 */
export async function getUserEmailConnections(
  userId: string
): Promise<UserEmailConnection[]> {
  const providers: EmailProvider[] = ['gmail', 'outlook'];
  const results = await Promise.all(
    providers.map((provider) => getEmailConnection(userId, provider))
  );
  return results.filter((c): c is UserEmailConnection => c != null);
}

/**
 * Save an email connection
 */
export async function saveEmailConnection(
  connection: Omit<UserEmailConnection, 'connectionId'>
): Promise<UserEmailConnection> {
  const connectionId = getConnectionId(connection.userId, connection.provider);
  
  const now = new Date().toISOString();
  const item = {
    ...connection,
    connectionId,
    createdAt: now,
    updatedAt: now,
  };
  
  const command = new PutItemCommand({
    TableName: emailConnectionsTable,
    Item: marshall(item, { removeUndefinedValues: true }),
  });
  
  await client.send(command);
  
  return item as unknown as UserEmailConnection;
}

/**
 * Update an email connection
 */
export async function updateEmailConnection(
  userId: string,
  provider: EmailProvider,
  updates: Partial<Pick<UserEmailConnection, 
    | 'accessToken'
    | 'tokenType'
    | 'expiresAt'
    | 'lastSyncedAt'
    | 'subscriptionId'
    | 'status'
    | 'errorMessage'
  >>
): Promise<UserEmailConnection | null> {
  const connectionId = getConnectionId(userId, provider);
  
  // Build update expression
  const updatesArr: string[] = [];
  const values: Record<string, unknown> = {};
  const names: Record<string, string> = {};
  
  if (updates.accessToken !== undefined) {
    updatesArr.push('#accessToken = :accessToken');
    values[':accessToken'] = updates.accessToken;
    names['#accessToken'] = 'accessToken';
  }
  if (updates.tokenType !== undefined) {
    updatesArr.push('#tokenType = :tokenType');
    values[':tokenType'] = updates.tokenType;
    names['#tokenType'] = 'tokenType';
  }
  if (updates.expiresAt !== undefined) {
    updatesArr.push('#expiresAt = :expiresAt');
    values[':expiresAt'] = updates.expiresAt;
    names['#expiresAt'] = 'expiresAt';
  }
  if (updates.lastSyncedAt !== undefined) {
    updatesArr.push('#lastSyncedAt = :lastSyncedAt');
    values[':lastSyncedAt'] = updates.lastSyncedAt;
    names['#lastSyncedAt'] = 'lastSyncedAt';
  }
  if (updates.subscriptionId !== undefined) {
    updatesArr.push('#subscriptionId = :subscriptionId');
    values[':subscriptionId'] = updates.subscriptionId;
    names['#subscriptionId'] = 'subscriptionId';
  }
  if (updates.status !== undefined) {
    updatesArr.push('#status = :status');
    values[':status'] = updates.status;
    names['#status'] = 'status';
  }
  if (updates.errorMessage !== undefined) {
    updatesArr.push('#errorMessage = :errorMessage');
    values[':errorMessage'] = updates.errorMessage;
    names['#errorMessage'] = 'errorMessage';
  }
  
  // Always update updatedAt
  updatesArr.push('#updatedAt = :updatedAt');
  values[':updatedAt'] = new Date().toISOString();
  names['#updatedAt'] = 'updatedAt';
  
  if (updatesArr.length === 0) {
    return getEmailConnection(userId, provider);
  }
  
  const command = new UpdateItemCommand({
    TableName: emailConnectionsTable,
    Key: marshall({ connectionId }),
    UpdateExpression: `SET ${updatesArr.join(', ')}`,
    ExpressionAttributeValues: marshall(values),
    ExpressionAttributeNames: names,
    ReturnValues: 'ALL_NEW',
  });
  
  const response = await client.send(command);
  
  if (!response.Attributes) {
    return null;
  }
  
  return unmarshall(response.Attributes) as unknown as UserEmailConnection;
}

/**
 * Delete an email connection
 */
export async function deleteEmailConnection(
  userId: string,
  provider: EmailProvider
): Promise<void> {
  const connectionId = getConnectionId(userId, provider);
  
  const command = new DeleteItemCommand({
    TableName: emailConnectionsTable,
    Key: marshall({ connectionId }),
  });
  
  await client.send(command);
}

/**
 * Check if a user has an active email connection
 */
export async function hasActiveEmailConnection(
  userId: string,
  provider: EmailProvider
): Promise<boolean> {
  const connection = await getEmailConnection(userId, provider);
  
  if (!connection) {
    return false;
  }
  
  // Check if token is still valid
  if (connection.status === 'revoked' || connection.status === 'error') {
    return false;
  }
  
  // Check expiry
  if (connection.expiresAt && connection.expiresAt < Date.now()) {
    return false;
  }
  
  return true;
}

/**
 * Get active email connections for a user
 */
export async function getActiveEmailConnections(
  userId: string
): Promise<{ provider: EmailProvider; emailAddress: string }[]> {
  const connections = await getUserEmailConnections(userId);
  
  return connections
    .filter(c => c.status === 'active' && (!c.expiresAt || c.expiresAt > Date.now()))
    .map(c => ({
      provider: c.provider,
      emailAddress: c.emailAddress,
    }));
}
