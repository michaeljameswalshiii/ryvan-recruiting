/**
 * Server-Only DynamoDB Client
 * 
 * This module provides server-side DynamoDB access.
 * It should NEVER be imported in client components.
 * 
 * @serverOnly
 */

import {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  UpdateItemCommand,
  DeleteItemCommand,
  QueryCommand,
  ScanCommand,
  ListTablesCommand,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';

// ============================================================================
// Configuration - SERVER-SIDE ONLY
// ============================================================================

// Use server-side env vars (NOT NEXT_PUBLIC_*)
const region = process.env.AWS_REGION || 'us-east-1';

// Table names from environment
const tenantsTable = process.env.DYNAMODB_TENANTS_TABLE || 'turnkey-tenants';
const profilesTable = process.env.DYNAMODB_PROFILES_TABLE || 'turnkey-profiles';
const clientsTable = process.env.DYNAMODB_CLIENTS_TABLE || 'turnkey-clients';
const leadsTable = process.env.DYNAMODB_LEADS_TABLE || 'turnkey-leads';
const jobsTable = process.env.DYNAMODB_JOBS_TABLE || 'turnkey-jobs';
const pipelineTable = process.env.DYNAMODB_PIPELINE_TABLE || 'turnkey-pipeline';
const sourcesTable = process.env.DYNAMODB_SOURCES_TABLE || 'turnkey-sources';
const emailLogsTable = process.env.DYNAMODB_EMAIL_LOGS_TABLE || 'turnkey-email-logs';
const eventsTable = process.env.DYNAMODB_EVENTS_TABLE || 'turnkey-events';
const bedrockUsageTable = process.env.DYNAMODB_BEDROCK_USAGE_TABLE || 'turnkey-bedrock-usage';

// ============================================================================
// Client
// ============================================================================

let _client: DynamoDBClient | null = null;

function getClient(): DynamoDBClient {
  if (!_client) {
    _client = new DynamoDBClient({ region });
  }
  return _client;
}

// ============================================================================
// Helper Functions
// ============================================================================

function isConfigured(): boolean {
  // Use server-side env var
  return !!(process.env.AWS_REGION);
}

/**
 * Get table name
 */
export function getTableName(table: keyof typeof tableNames): string {
  return tableNames[table];
}

const tableNames = {
  tenants: tenantsTable,
  profiles: profilesTable,
  clients: clientsTable,
  leads: leadsTable,
  jobs: jobsTable,
  pipeline: pipelineTable,
  sources: sourcesTable,
  emailLogs: emailLogsTable,
  events: eventsTable,
} as const;

// ============================================================================
// CRUD Operations
// ============================================================================

/**
 * Get a single item by key
 */
export async function getItem<T>(table: string, key: Record<string, any>): Promise<T | null> {
  const client = getClient();
  
  const command = new GetItemCommand({
    TableName: table,
    Key: marshall(key),
  });
  
  const response = await client.send(command);
  
  if (!response.Item) {
    return null;
  }
  
  return unmarshall(response.Item) as T;
}

/**
 * Get multiple items by key condition
 */
export async function queryItems<T>(
  table: string,
  keyCondition: string,
  expressionValues: Record<string, any>,
  expressionNames?: Record<string, string>
): Promise<T[]> {
  const client = getClient();
  
  const command = new QueryCommand({
    TableName: table,
    KeyConditionExpression: keyCondition,
    ExpressionAttributeValues: marshall(expressionValues),
    ExpressionAttributeNames: expressionNames,
  });
  
  const response = await client.send(command);
  
  if (!response.Items || response.Items.length === 0) {
    return [];
  }
  
  return response.Items.map(item => unmarshall(item) as T);
}

/**
 * Put a single item
 */
export async function putItem<T>(table: string, item: T): Promise<T> {
  const client = getClient();
  
  const command = new PutItemCommand({
    TableName: table,
    Item: marshall(item, { removeUndefinedValues: true }),
  });
  
  await client.send(command);
  
  return item;
}

/**
 * Update an item
 */
export async function updateItem<T>(
  table: string,
  key: Record<string, any>,
  updateExpression: string,
  expressionValues: Record<string, any>,
  expressionNames?: Record<string, string>
): Promise<T | null> {
  const client = getClient();
  
  const command = new UpdateItemCommand({
    TableName: table,
    Key: marshall(key),
    UpdateExpression: updateExpression,
    ExpressionAttributeValues: marshall(expressionValues),
    ExpressionAttributeNames: expressionNames,
    ReturnValues: 'ALL_NEW',
  });
  
  const response = await client.send(command);
  
  if (!response.Attributes) {
    return null;
  }
  
  return unmarshall(response.Attributes) as T;
}

/**
 * Delete an item
 */
export async function deleteItem(table: string, key: Record<string, any>): Promise<void> {
  const client = getClient();
  
  const command = new DeleteItemCommand({
    TableName: table,
    Key: marshall(key),
  });
  
  await client.send(command);
}

/**
 * Scan all items in a table (use sparingly)
 */
export async function scanItems<T>(
  table: string,
  filterExpression?: string,
  expressionValues?: Record<string, any>,
  expressionNames?: Record<string, string>
): Promise<T[]> {
  const client = getClient();
  
  const command = new ScanCommand({
    TableName: table,
    FilterExpression: filterExpression,
    ExpressionAttributeValues: expressionValues ? marshall(expressionValues) : undefined,
    ExpressionAttributeNames: expressionNames,
  });
  
  const response = await client.send(command);
  
  if (!response.Items || response.Items.length === 0) {
    return [];
  }
  
  return response.Items.map(item => unmarshall(item) as T);
}

/**
 * List all available DynamoDB tables
 */
export async function listTables(): Promise<string[]> {
  const client = getClient();
  
  const command = new ListTablesCommand({});
  
  const response = await client.send(command);
  
  if (!response.TableNames || response.TableNames.length === 0) {
    return [];
  }
  
  return response.TableNames;
}

/**
 * Scan table with limit for viewer
 */
export async function scanTableWithLimit<T>(
  table: string,
  limit: number = 100
): Promise<T[]> {
  const client = getClient();
  
  const command = new ScanCommand({
    TableName: table,
    Limit: limit,
  });
  
  const response = await client.send(command);
  
  if (!response.Items || response.Items.length === 0) {
    return [];
  }
  
  return response.Items.map(item => unmarshall(item) as T);
}

// ============================================================================
// Repository Helpers
// ============================================================================

/**
 * Build a query for items by tenant
 */
export function buildTenantQuery(
  table: string,
  tenantId: string,
  options?: {
    limit?: number;
    lastKey?: Record<string, any>;
    scanIndexForward?: boolean;
  }
) {
  return queryItems(
    table,
    'tenant_id = :tenantId',
    { ':tenantId': tenantId },
    undefined,
  );
}

/**
 * Verify tenant belongs to the current user
 * This prevents a user from accessing another tenant's data
 */
export async function verifyTenantOwnership(
  tenantId: string,
  userId: string
): Promise<boolean> {
  const profile = await getItem<{ id: string; tenant_id: string }>(
    profilesTable,
    { id: userId }
  );
  
  return profile?.tenant_id === tenantId;
}

// ============================================================================
// Table Exports
// ============================================================================

export {
  tableNames,
  tenantsTable,
  profilesTable,
  clientsTable,
  leadsTable,
  jobsTable,
  pipelineTable,
  sourcesTable,
  emailLogsTable,
  eventsTable,
  bedrockUsageTable,
};
