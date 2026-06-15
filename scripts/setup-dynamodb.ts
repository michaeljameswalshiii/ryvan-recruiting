 * Setup DynamoDB Tables for Turnkey Optimization
 * Run with: npx tsx scripts/setup-dynamodb.ts
 */

import {
  DynamoDBClient,
  CreateTableCommand,
  DescribeTableCommand,
  AttributeDefinition,
  GlobalSecondaryIndex,
  KeySchemaElement,
  ProjectionType,
  ProvisionedThroughput,
  ScalarAttributeType,
} from '@aws-sdk/client-dynamodb';

declare const process: {
  env: {
    AWS_REGION?: string;
    DYNAMODB_TENANTS_TABLE?: string;
    DYNAMODB_PROFILES_TABLE?: string;
    DYNAMODB_CLIENTS_TABLE?: string;
    DYNAMODB_LEADS_TABLE?: string;
    DYNAMODB_PIPELINE_TABLE?: string;
    DYNAMODB_SOURCES_TABLE?: string;
    DYNAMODB_EMAIL_LOGS_TABLE?: string;
  };
};

// Initialize client
const client = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1',
});

// Table configurations
interface TableConfig {
  TableName: string;
  PartitionKey: string;
  SortKey: string;
  GSI?: {
    IndexName: string;
    PartitionKey: string;
    SortKey?: string;
  }[];
}

const tables: TableConfig[] = [
  {
    TableName: process.env.DYNAMODB_TENANTS_TABLE || 'turnkey-tenants',
    PartitionKey: 'id',
    SortKey: 'created_at',
  },
  {
    TableName: process.env.DYNAMODB_PROFILES_TABLE || 'turnkey-profiles',
    PartitionKey: 'id',
    SortKey: 'email',
    GSI: [
      {
        IndexName: 'tenant-index',
        PartitionKey: 'tenant_id',
      },
    ],
  },
  {
    TableName: process.env.DYNAMODB_CLIENTS_TABLE || 'turnkey-clients',
    PartitionKey: 'tenant_id',
    SortKey: 'id',
  },
  {
    TableName: process.env.DYNAMODB_LEADS_TABLE || 'turnkey-leads',
    PartitionKey: 'tenant_id',
    SortKey: 'id',
    GSI: [
      {
        IndexName: 'email-index',
        PartitionKey: 'email',
      },
    ],
  },
  {
    TableName: process.env.DYNAMODB_PIPELINE_TABLE || 'turnkey-pipeline',
    PartitionKey: 'tenant_id',
    SortKey: 'id',
  },
{
    TableName: process.env.DYNAMODB_SOURCES_TABLE || 'turnkey-sources',
    PartitionKey: 'tenant_id',
    SortKey: 'id',
  },
  {
    TableName: process.env.DYNAMODB_EMAIL_LOGS_TABLE || 'turnkey-email-logs',
    PartitionKey: 'tenant_id',
    SortKey: 'id',
    GSI: [
      {
        IndexName: 'contact-index',
        PartitionKey: 'contact_id',
      },
      {
        IndexName: 'sent-at-index',
        PartitionKey: 'tenant_id',
        SortKey: 'sent_at',
      },
    ],
  },
];

async function tableExists(tableName: string): Promise<boolean> {
  try {
    await client.send(new DescribeTableCommand({ TableName: tableName }));
    return true;
  } catch (error: any) {
    if (error.name === 'ResourceNotFoundException') {
      return false;
    }
    throw error;
  }
}

async function createTable(config: TableConfig): Promise<void> {
  const exists = await tableExists(config.TableName);
  
  if (exists) {
    console.log(`✓ Table ${config.TableName} already exists`);
    return;
  }

  console.log(`Creating table ${config.TableName}...`);

  const keySchema: KeySchemaElement[] = [
    { AttributeName: config.PartitionKey, KeyType: 'HASH' },
    { AttributeName: config.SortKey, KeyType: 'RANGE' },
  ];

  const attributeDefinitions: AttributeDefinition[] = [
    { AttributeName: config.PartitionKey, AttributeType: ScalarAttributeType.S },
    { AttributeName: config.SortKey, AttributeType: ScalarAttributeType.S },
  ];

  const gsi: GlobalSecondaryIndex[] = [];

  if (config.GSI) {
    for (const index of config.GSI) {
      gsi.push({
        IndexName: index.IndexName,
        KeySchema: [
          { AttributeName: index.PartitionKey, KeyType: 'HASH' },
          ...(index.SortKey ? [{ AttributeName: index.SortKey, KeyType: 'RANGE' as const }] : []),
        ],
Projection: { ProjectionType: ProjectionType.ALL },
        ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
      });

      attributeDefinitions.push({ AttributeName: index.PartitionKey, AttributeType: ScalarAttributeType.S });
      if (index.SortKey) {
        attributeDefinitions.push({ AttributeName: index.SortKey, AttributeType: ScalarAttributeType.S });
      }
    }
  }

  const command = new CreateTableCommand({
    TableName: config.TableName,
    KeySchema: keySchema,
    AttributeDefinitions: attributeDefinitions,
    ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
    GlobalSecondaryIndexes: gsi.length > 0 ? gsi : undefined,
  });

  await client.send(command);
  console.log(`✓ Table ${config.TableName} created successfully`);
}

async function main() {
  console.log('Setting up DynamoDB tables...\n');
  console.log(`Region: ${process.env.AWS_REGION || 'us-east-1'}\n`);

  for (const table of tables) {
    await createTable(table);
  }

  console.log('\n✅ All tables setup complete!');
  console.log('\nNext steps:');
  console.log('1. Merge the PR: blackboxai/fix-pipeline-error-handling');
  console.log('2. Vercel will auto-deploy on merge');
  console.log('3. Test the pipeline functionality');
}

main().catch(console.error);
