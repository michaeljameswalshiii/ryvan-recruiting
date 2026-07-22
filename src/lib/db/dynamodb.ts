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
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
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
const issuesTable = process.env.DYNAMODB_ISSUES_TABLE || 'turnkey-issues';

// ============================================================================
// Client (UPDATED - Explicit credentials for Vercel)
// ============================================================================

let _client: DynamoDBClient | null = null;
let _docClient: DynamoDBDocumentClient | null = null;

// Get raw DynamoDBClient for commands
function getClient(): DynamoDBClient {
  if (!_client) {
    const region = process.env.AWS_REGION || 'us-east-1';
    
    // === ROBUST AWS CREDENTIALS LOADING ===
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID || process.env.MY_AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY || process.env.MY_AWS_SECRET_ACCESS_KEY;

console.log('🔧 DynamoDB Init:', {
  hasAccessKey: !!accessKeyId,
  hasSecretKey: !!secretAccessKey,
  region,
  envKeys: Object.keys(process.env).filter(k => k.includes('AWS'))
});
    console.log('🗄️ Clients table:', clientsTable);

    // Validate credentials before creating client
    if (!accessKeyId || !secretAccessKey) {
      console.error('❌ AWS credentials STILL missing after fallback');
      throw new Error('AWS credentials not configured. Check Vercel env vars.');
    }

    if (accessKeyId.length < 16) {
      console.error('❌ AWS_ACCESS_KEY_ID appears too short (invalid):', accessKeyId.substring(0, 4) + '...');
    }

    // Explicit credentials from env vars (required on Vercel)
    _client = new DynamoDBClient({
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });

    console.log('✅ DynamoDBClient initialized successfully');
  }
  return _client;
}

// Get DynamoDBDocumentClient with global removeUndefinedValues
export function getDocClient(): DynamoDBDocumentClient {
  if (!_docClient) {
    _docClient = DynamoDBDocumentClient.from(getClient(), {
      marshallOptions: {
        removeUndefinedValues: true,  // <--- KEY FIX: Global removal of undefined values
      },
    });
    console.log('✅ DynamoDBDocumentClient initialized with removeUndefinedValues');
  }
  return _docClient;
}

// ============================================================================
// Helper Functions
// ============================================================================

function isConfigured(): boolean {
  const hasRegion = !!process.env.AWS_REGION;
  const hasAccessKey = !!process.env.AWS_ACCESS_KEY_ID;
  const hasSecretKey = !!process.env.AWS_SECRET_ACCESS_KEY;
  
  if (!hasRegion || !hasAccessKey || !hasSecretKey) {
    console.error('❌ AWS credentials missing:');
    console.error('  AWS_REGION:', hasRegion ? '✓' : '✗ MISSING');
    console.error('  AWS_ACCESS_KEY_ID:', hasAccessKey ? '✓' : '✗ MISSING');
    console.error('  AWS_SECRET_ACCESS_KEY:', hasSecretKey ? '✓' : '✗ MISSING');
    console.error('');
    console.error('Please set these environment variables in Vercel:');
    console.error('  - AWS_REGION (e.g., us-east-1)');
    console.error('  - AWS_ACCESS_KEY_ID');
    console.error('  - AWS_SECRET_ACCESS_KEY');
    console.error('');
    console.error('Also set table names:');
    console.error('  - DYNAMODB_TENANTS_TABLE');
    console.error('  - DYNAMODB_PROFILES_TABLE');
    console.error('  - DYNAMODB_CLIENTS_TABLE');
    console.error('  - DYNAMODB_LEADS_TABLE');
    console.error('  - DYNAMODB_JOBS_TABLE');
  }
  
  return hasRegion && hasAccessKey && hasSecretKey;
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
  issues: issuesTable,
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
 * Now supports pagination with Limit, ScanIndexForward, and ExclusiveStartKey
 */
export async function queryItems<T>(
  table: string,
  keyCondition: string,
  expressionValues: Record<string, any>,
  options?: {
    expressionNames?: Record<string, string>;
    limit?: number;
    ScanIndexForward?: boolean;
    ExclusiveStartKey?: Record<string, any>;
  }
): Promise<{ items: T[]; lastEvaluatedKey?: Record<string, any> }> {
  const client = getClient();
  
  const command = new QueryCommand({
    TableName: table,
    KeyConditionExpression: keyCondition,
    ExpressionAttributeValues: marshall(expressionValues),
    ExpressionAttributeNames: options?.expressionNames,
    Limit: options?.limit,
    ScanIndexForward: options?.ScanIndexForward,
    ExclusiveStartKey: options?.ExclusiveStartKey ? marshall(options.ExclusiveStartKey) : undefined,
  });
  
  const response = await client.send(command);
  
  if (!response.Items || response.Items.length === 0) {
    return { items: [] };
  }
  
  return {
    items: response.Items.map(item => unmarshall(item) as T),
    lastEvaluatedKey: response.LastEvaluatedKey ? unmarshall(response.LastEvaluatedKey) : undefined,
  };
}

/**
 * Put a single item
 * CRITICAL: removeUndefinedValues to prevent DynamoDB GSI errors with empty strings
 */
export async function putItem<T>(table: string, item: T): Promise<T> {
  const client = getClient();
  
  console.log('[putItem] Input item:', JSON.stringify(item));
  
  const command = new PutItemCommand({
    TableName: table,
    Item: marshall(item, { removeUndefinedValues: true }),
  });
  
  console.log('[putItem] Marshalled item:', JSON.stringify(command.input.Item));
  
  await client.send(command);
  
  return item;
}

/**
 * Update an item
 * expressionValues should be raw JS values; they are marshalled for the low-level client.
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
    ExpressionAttributeValues: marshall(expressionValues, {
      removeUndefinedValues: true,
      convertClassInstanceToMap: true,
    }),
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
 * Scan all items in a table (use sparingly).
 * Paginates until exhausted so FilterExpression matches are not lost
 * after the first 1MB page.
 */
export async function scanItems<T>(
  table: string,
  filterExpression?: string,
  expressionValues?: Record<string, any>,
  expressionNames?: Record<string, string>
): Promise<T[]> {
  const client = getClient();
  const items: T[] = [];
  let exclusiveStartKey: Record<string, any> | undefined;

  do {
    const command = new ScanCommand({
      TableName: table,
      FilterExpression: filterExpression,
      ExpressionAttributeValues: expressionValues
        ? marshall(expressionValues)
        : undefined,
      ExpressionAttributeNames: expressionNames,
      ExclusiveStartKey: exclusiveStartKey,
    });

    const response = await client.send(command);
    if (response.Items?.length) {
      for (const item of response.Items) {
        items.push(unmarshall(item) as T);
      }
    }
    exclusiveStartKey = response.LastEvaluatedKey;
  } while (exclusiveStartKey);

  return items;
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
  issuesTable,
};
