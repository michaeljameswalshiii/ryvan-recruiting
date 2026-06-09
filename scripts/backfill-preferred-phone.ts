/**
 * Backfill Script: Populate preferredPhone/preferredPhoneType for all contacts
 * 
 * This script scans all clients in DynamoDB and updates contacts that don't have
 * preferredPhone/preferredPhoneType populated to derive them from their phones array.
 * 
 * Run with: npx tsx scripts/backfill-preferred-phone.ts
 * 
 * Requirements:
 * - AWS credentials configured via environment or ~/.aws/credentials
 * - AWS_REGION env var set (default: us-east-1)
 * - DYNAMODB_CLIENTS_TABLE env var (default: turnkey-clients)
 * - TENANT_ID env var (default: default)
 */

// Use AWS SDK directly
import { 
  DynamoDBClient, 
  QueryCommand, 
  UpdateItemCommand 
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';

// Phone type interface
interface ContactPhone {
  id: string;
  number: string;
  type: string;
  isPreferred?: boolean;
}

// Contact interface
interface Contact {
  id: string;
  name: string;
  title?: string;
  email?: string;
  phone?: string;
  phones?: ContactPhone[];
  preferredPhone?: string;
  preferredPhoneType?: string;
  isPrimary?: boolean;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

// Client interface
interface Client {
  tenant_id: string;
  id: string;
  name: string;
  contacts?: Contact[];
  primaryContactId?: string;
  modified_at?: string;
}

// Configuration
const region = process.env.AWS_REGION || 'us-east-1';
const clientsTable = process.env.DYNAMODB_CLIENTS_TABLE || 'turnkey-clients';
const tenantId = process.env.TENANT_ID || 'default';

// DynamoDB client
const dbClient = new DynamoDBClient({ region });

// Helper to extract preferred phone data from phones array
function extractPreferredPhone(phones?: ContactPhone[]): { preferredPhone: string; preferredPhoneType: string } {
  if (!phones || phones.length === 0) {
    return { preferredPhone: '', preferredPhoneType: '' };
  }
  
  // Find phone marked as preferred
  const preferred = phones.find(p => p.isPreferred === true);
  if (preferred && preferred.number) {
    return { 
      preferredPhone: preferred.number, 
      preferredPhoneType: preferred.type || '' 
    };
  }
  
  // Fall back to first phone in array
  const firstPhone = phones[0];
  if (firstPhone && firstPhone.number) {
    return { 
      preferredPhone: firstPhone.number, 
      preferredPhoneType: firstPhone.type || '' 
    };
  }
  
  return { preferredPhone: '', preferredPhoneType: '' };
}

// Get all clients for tenant
async function getAllClients(): Promise<Client[]> {
  const command = new QueryCommand({
    TableName: clientsTable,
    KeyConditionExpression: 'tenant_id = :tenantId',
    ExpressionAttributeValues: marshall({ ':tenantId': tenantId }),
  });
  
  const response = await dbClient.send(command);
  
  if (!response.Items || response.Items.length === 0) {
    return [];
  }
  
  return response.Items.map(item => unmarshall(item) as unknown as Client);
}

// Update client contacts
async function updateClientContacts(clientId: string, contacts: Contact[]): Promise<void> {
  const now = new Date().toISOString();
  
  const command = new UpdateItemCommand({
    TableName: clientsTable,
    Key: marshall({ tenant_id: tenantId, id: clientId }),
    UpdateExpression: 'SET #contacts = :contacts, #modified_at = :modified_at',
    ExpressionAttributeNames: {
      '#contacts': 'contacts',
      '#modified_at': 'modified_at',
    },
    ExpressionAttributeValues: marshall({
      ':contacts': contacts,
      ':modified_at': now,
    }),
  });
  
  await dbClient.send(command);
}

async function backfillPreferredPhone() {
  console.log('Starting preferredPhone backfill...\n');
  console.log(`Using tenant ID: ${tenantId}`);
  console.log(`Using clients table: ${clientsTable}\n`);
  
  try {
    // Get all clients
    const clients = await getAllClients();
    console.log(`Found ${clients.length} clients\n`);
    
    let totalContactsUpdated = 0;
    let totalClientsUpdated = 0;
    
    for (const clientData of clients) {
      if (!clientData.contacts || clientData.contacts.length === 0) {
        continue;
      }
      
      let needsUpdate = false;
      const updatedContacts = clientData.contacts.map((contact: Contact) => {
        // Skip if already has preferredPhone
        if (contact.preferredPhone && contact.preferredPhoneType) {
          return contact;
        }
        
        // Skip if no phones at all
        if (!contact.phones || contact.phones.length === 0) {
          return contact;
        }
        
        // Extract preferred phone data
        const preferredData = extractPreferredPhone(contact.phones);
        
        // Only update if we found data
        if (preferredData.preferredPhone) {
          needsUpdate = true;
          console.log(`  ${contact.name}: ${preferredData.preferredPhone} (${preferredData.preferredPhoneType})`);
          
          return {
            ...contact,
            preferredPhone: preferredData.preferredPhone,
            preferredPhoneType: preferredData.preferredPhoneType,
          };
        }
        
        return contact;
      });
      
      if (needsUpdate) {
        await updateClientContacts(clientData.id, updatedContacts);
        
        totalContactsUpdated += updatedContacts.filter((c: Contact) => c.preferredPhone).length;
        totalClientsUpdated++;
        console.log(`  Updated client: ${clientData.name}\n`);
      }
    }
    
    console.log('Backfill complete!');
    console.log(`Summary:`);
    console.log(`   - Clients updated: ${totalClientsUpdated}`);
    console.log(`   - Contacts with preferred phone: ${totalContactsUpdated}`);
    
  } catch (error) {
    console.error('Backfill failed:', error);
    process.exit(1);
  }
}

// Run if called directly
backfillPreferredPhone();
