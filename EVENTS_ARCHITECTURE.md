# EVENTS_ARCHITECTURE.md

## Purpose
Track all status changes, notes, emails, and activities as immutable events for Candidates and Companies.

## Core Principles
- Append-only event log (never update/delete events)
- Strict tenant isolation
- High-velocity writes with efficient queries
- Unified event recorder used by all flows (Kanban, detail pages, email, etc.)

## DynamoDB Table: `turnkey-events`

Use single-table design with dedicated table.

**PK**: `ENTITY#${entityType}#${entityId}` (e.g. `CANDIDATE#cand-123abc`)
**SK**: `EVENT#${isoTimestampWithMs}` (newest first when queried with `ScanIndexForward: false`)

**GSI1** (Tenant-wide activity feed):
- GSI1PK: `TENANT#${tenantId}`
- GSI1SK: `EVENT#${isoTimestampWithMs}`

**Attributes** (see types below)

## Event Types (examples)
- `STATUS_CHANGED`
- `STAGE_CHANGED`
- `NOTE_ADDED`
- `EMAIL_SENT`
- `EMAIL_RECEIVED`
- `CANDIDATE_CREATED`
- `COMPANY_CREATED`
- `RESUME_UPLOADED`

## Implementation Steps (Do in this order)

1. Create DynamoDB table in CDK (see code below)
2. Create `src/lib/events/` folder with:
   - `types.ts`
   - `recorder.ts` (unified `recordEvent()`)
   - `candidate-events.ts`
   - `company-events.ts`
3. Add hooks in Kanban drag-drop and detail modals
4. Build `EventTimeline` React component
5. Update Candidate/Company detail pages to show timeline

**Success Criteria**
- Every Kanban status change creates an event automatically
- Timeline renders chronologically with icons
- All events respect tenant isolation
- Zero breaking changes to existing Candidate/Company tables

Step 2: Update CDK Stack (Create Events Table)Find your main stack file (likely cdk/lib/turnkey-optimization-stack.ts or similar) and add this table:ts

// Inside your Stack constructor
const eventsTable = new dynamodb.Table(this, 'TurnkeyEventsTable', {
  tableName: 'turnkey-events',
  partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
  sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
  billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
  removalPolicy: RemovalPolicy.RETAIN, // Important for audit data
});

// GSI for tenant-wide queries
eventsTable.addGlobalSecondaryIndex({
  indexName: 'TenantEventsIndex',
  partitionKey: { name: 'GSI1PK', type: dynamodb.AttributeType.STRING },
  sortKey: { name: 'GSI1SK', type: dynamodb.AttributeType.STRING },
  projectionType: dynamodb.ProjectionType.ALL,
});

// Grant permissions to your Lambda / API roles
eventsTable.grantReadWriteData(yourApiLambdaRole);

Step 3: Create Type Definitions (src/lib/events/types.ts)ts

export type EntityType = 'candidate' | 'company';

export interface BaseEvent {
  PK: string;                    // ENTITY#candidate#abc123
  SK: string;                    // EVENT#2025-05-29T20:15:33.456Z
  GSI1PK: string;                // TENANT#tenant-xyz
  GSI1SK: string;                // EVENT#2025-05-29T20:15:33.456Z

  tenantId: string;
  entityType: EntityType;
  entityId: string;

  eventType: string;
  title: string;
  description?: string;
  metadata: Record<string, any>;

  createdAt: string;
  createdBy: string;             // user sub or email
  createdByName?: string;
}

export interface StatusChangeMetadata {
  oldStatus?: string;
  newStatus: string;
  oldStage?: string;
  newStage?: string;
}

// Helper to generate keys
export const eventKeys = {
  forEntity: (type: EntityType, id: string) => `ENTITY#${type}#${id}`,
  eventSK: (timestamp: string = new Date().toISOString()) => `EVENT#${timestamp}`,
  tenantGSI: (tenantId: string) => `TENANT#${tenantId}`,
};

Step 4: Unified Event Recorder (src/lib/events/recorder.ts)ts

import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';
import { BaseEvent } from './types';

const client = new DynamoDBClient({ region: process.env.AWS_REGION });

export async function recordEvent(event: Omit<BaseEvent, 'PK' | 'SK' | 'GSI1PK' | 'GSI1SK' | 'createdAt'>) {
  const now = new Date().toISOString();
  
  const fullEvent: BaseEvent = {
    ...event,
    PK: `ENTITY#${event.entityType}#${event.entityId}`,
    SK: `EVENT#${now}`,
    GSI1PK: `TENANT#${event.tenantId}`,
    GSI1SK: `EVENT#${now}`,
    createdAt: now,
  };

  await client.send(new PutItemCommand({
    TableName: 'turnkey-events',
    Item: marshall(fullEvent, { removeUndefinedValues: true }),
  }));

  return fullEvent;
}

Step 5: Convenience Wrappers (example for candidates)Create src/lib/events/candidate-events.ts:ts

import { recordEvent } from './recorder';

export async function recordStatusChange(params: {
  candidateId: string;
  tenantId: string;
  oldStatus: string;
  newStatus: string;
  userId: string;
  userName?: string;
}) {
  return recordEvent({
    entityType: 'candidate',
    entityId: params.candidateId,
    tenantId: params.tenantId,
    eventType: 'STATUS_CHANGED',
    title: `Status changed to ${params.newStatus}`,
    description: `Changed from ${params.oldStatus} → ${params.newStatus}`,
    metadata: { oldStatus: params.oldStatus, newStatus: params.newStatus },
    createdBy: params.userId,
    createdByName: params.userName,
  });
}

// Add similar functions: addNote, recordEmailSent, etc.

Do the same pattern for company-events.ts.Step 6: Timeline Component Skeleton (src/components/EventTimeline.tsx)tsx

export default function EventTimeline({ entityType, entityId, tenantId }: Props) {
  // Query events using QueryCommand with PK + SK begins_with EVENT#
  // Sort descending (newest first)
  // Render cards with icons based on eventType
}

Minimax – Next Actions for YouCreate the files above exactly as shown.
Add the table to CDK and deploy.
Hook recordStatusChange into the Kanban onDragEnd handler (pass old/new values).
Let me know when done → we’ll build the Timeline UI and integrate it into Candidate/Company detail pages.
