/**
 * Email Log Repository
 * Server-only data access layer for email tracking/logs
 * 
 * @serverOnly
 */

import {
  DynamoDBClient,
  PutItemCommand,
  UpdateItemCommand,
  QueryCommand,
  ScanCommand,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';

const region = process.env.AWS_REGION || 'us-east-1';
const emailLogsTable = process.env.DYNAMODB_EMAIL_LOGS_TABLE || 'turnkey-email-logs';

let _client: DynamoDBClient | null = null;

function getClient(): DynamoDBClient {
  if (!_client) {
    _client = new DynamoDBClient({ region });
  }
  return _client;
}

export interface EmailLog {
  id: string;
  tenant_id: string;
  user_id: string;
  contact_id: string;
  contact_email: string;
  subject: string;
  body: string;
  status: 'sent' | 'delivered' | 'opened' | 'clicked' | 'bounced' | 'failed';
  resend_message_id?: string;
  sent_at: string;
  delivered_at?: string;
  opened_at?: string;
  clicked_at?: string;
  bounced_at?: string;
  failed_at?: string;
  error_message?: string;
}

export interface CreateEmailLogInput {
  tenantId: string;
  userId: string;
  contactId: string;
  contactEmail: string;
  subject: string;
  body: string;
  status: 'sent' | 'delivered' | 'opened' | 'clicked' | 'bounced' | 'failed';
  resendMessageId?: string;
  errorMessage?: string;
}

function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Log an email that was sent
 */
export async function createEmailLog(input: CreateEmailLogInput): Promise<EmailLog> {
  const client = getClient();
  
  const now = new Date().toISOString();
  const log: EmailLog = {
    id: generateId(),
    tenant_id: input.tenantId,
    user_id: input.userId,
    contact_id: input.contactId,
    contact_email: input.contactEmail,
    subject: input.subject,
    body: input.body,
    status: input.status,
    resend_message_id: input.resendMessageId,
    sent_at: now,
  };

  if (input.status === 'failed') {
    log.failed_at = now;
    log.error_message = input.errorMessage;
  }

  const command = new PutItemCommand({
    TableName: emailLogsTable,
    Item: marshall(log, { removeUndefinedValues: true }),
  });

  await client.send(command);
  return log;
}

/**
 * Get all email logs for a tenant
 */
export async function getEmailLogsByTenant(tenantId: string): Promise<EmailLog[]> {
  const client = getClient();
  
  const command = new QueryCommand({
    TableName: emailLogsTable,
    KeyConditionExpression: 'tenant_id = :tenantId',
    ExpressionAttributeValues: marshall({ ':tenantId': tenantId }),
    ScanIndexForward: false,
  });

  const response = await client.send(command);
  
  if (!response.Items || response.Items.length === 0) {
    return [];
  }
  
  return response.Items.map(item => unmarshall(item) as EmailLog);
}

/**
 * Get email logs for a specific contact
 */
export async function getEmailLogsByContact(contactId: string): Promise<EmailLog[]> {
  const client = getClient();
  
  const command = new ScanCommand({
    TableName: emailLogsTable,
    FilterExpression: 'contact_id = :contactId',
    ExpressionAttributeValues: marshall({ ':contactId': contactId }),
  });

  const response = await client.send(command);
  
  if (!response.Items || response.Items.length === 0) {
    return [];
  }
  
  return response.Items.map(item => unmarshall(item) as EmailLog);
}

/**
 * Update email log status (for tracking opens, clicks, etc.)
 */
export async function updateEmailLogStatus(
  logId: string,
  status: 'delivered' | 'opened' | 'clicked' | 'bounced' | 'failed',
  errorMessage?: string
): Promise<void> {
  const client = getClient();
  
  const now = new Date().toISOString();
  const updates: string[] = ['#status = :status'];
  const values: Record<string, string> = {
    ':status': status,
  };

  if (status === 'delivered') {
    updates.push('#delivered_at = :delivered_at');
    values[':delivered_at'] = now;
  } else if (status === 'opened') {
    updates.push('#opened_at = :opened_at');
    values[':opened_at'] = now;
  } else if (status === 'clicked') {
    updates.push('#clicked_at = :clicked_at');
    values[':clicked_at'] = now;
  } else if (status === 'bounced') {
    updates.push('#bounced_at = :bounced_at');
    values[':bounced_at'] = now;
  } else if (status === 'failed') {
    updates.push('#failed_at = :failed_at');
    values[':failed_at'] = now;
    if (errorMessage) {
      updates.push('#error_message = :error_message');
      values[':error_message'] = errorMessage;
    }
  }

const command = new UpdateItemCommand({
    TableName: emailLogsTable,
    Key: marshall({ id: logId }),
    UpdateExpression: `SET ${updates.join(', ')}`,
    ExpressionAttributeNames: {
      '#status': 'status',
      '#delivered_at': 'delivered_at',
      '#opened_at': 'opened_at',
      '#clicked_at': 'clicked_at',
      '#bounced_at': 'bounced_at',
      '#failed_at': 'failed_at',
      '#error_message': 'error_message',
    },
    ExpressionAttributeValues: marshall(values),
  });

  await client.send(command);
}

/**
 * Get email stats for a tenant
 */
export async function getEmailStatsByTenant(tenantId: string): Promise<{
  total: number;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  failed: number;
}> {
  const logs = await getEmailLogsByTenant(tenantId);
  
  return {
    total: logs.length,
    sent: logs.filter(l => l.status === 'sent').length,
    delivered: logs.filter(l => l.status === 'delivered').length,
    opened: logs.filter(l => l.status === 'opened').length,
    clicked: logs.filter(l => l.status === 'clicked').length,
    bounced: logs.filter(l => l.status === 'bounced').length,
    failed: logs.filter(l => l.status === 'failed').length,
  };
}
