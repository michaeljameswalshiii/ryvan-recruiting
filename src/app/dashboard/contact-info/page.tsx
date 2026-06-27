import { Card, CardHeader, CardContent, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { DynamoDBClient, ScanCommand } from '@aws-sdk/client-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';

// Force dynamic rendering - this page requires runtime credentials
export const dynamic = 'force-dynamic';

// Get region with fallback - handle missing env vars gracefully during build
function getDynamoRegion(): string {
  return process.env.AWS_REGION || process.env.NEXT_PUBLIC_AWS_REGION || 'us-east-1';
}

// Client lazily initialized to handle missing credentials
function getDynamoClient(): DynamoDBClient | null {
  try {
    return new DynamoDBClient({ 
      region: getDynamoRegion(),
      // Don't throw during credentials issues - handle at runtime
      tls: false,
    });
  } catch {
    return null;
  }
}

export async function getAllContacts() {
  // Check for required credentials during build
  const client = getDynamoClient();
  if (!client) {
    console.log('[getAllContacts] No AWS client available, returning empty contacts');
    return [];
  }
  
  const tableName = process.env.DYNAMODB_EVENTS_TABLE || 'turnkey-events';
  
  const command = new ScanCommand({
    TableName: tableName,
    FilterExpression: "entityType = :type",
    ExpressionAttributeValues: {
      ":type": { S: "candidate" }
    },
  });

  const response = await client.send(command);
  
  // Convert DynamoDB items to plain objects
  const items = (response.Items || []).map(item => unmarshall(item));
  
  // Deduplicate by entityId - keep latest
  const latestMap = new Map();
  items.forEach(item => {
    const key = item.entityId;
    if (key) {
      const existing = latestMap.get(key);
      const newTime = item.updatedAt || item.createdAt || '0';
      const oldTime = existing?.updatedAt || existing?.createdAt || '0';
      if (!existing || newTime > oldTime) {
        latestMap.set(key, item);
      }
    }
  });

  return Array.from(latestMap.values()).sort((a, b) => 
    String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || ''))
  );
}

export default async function ContactInfoPage() {
  const contacts = await getAllContacts();

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Contact Info</h1>
          <p className="text-muted-foreground mt-1">
            All contacts stored in DynamoDB • {contacts.length} total
          </p>
        </div>
        
        <Button asChild variant="outline">
          <Link href="/dashboard/contacts">Go to Contacts</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>All Contacts</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {contacts.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              No contacts found in DynamoDB.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {contacts.map((contact: any, index: number) => (
                <Card key={contact.entityId || index} className="hover:shadow-md transition-shadow">
                  <CardContent className="pt-6">
                    <div className="space-y-3">
                      <div>
                        <h3 className="font-semibold text-lg">
                          {contact.metadata?.candidateName || contact.metadata?.contactName || contact.title || 'Unnamed Contact'}
                        </h3>
                        {contact.tenantId && (
                          <Badge variant="secondary">{contact.tenantId}</Badge>
                        )}
                      </div>

                      <div className="space-y-1 text-sm">
                        {contact.metadata?.email && (
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground">Email:</span>
                            <a href={`mailto:${contact.metadata.email}`} className="hover:underline">
                              {contact.metadata.email}
                            </a>
                          </div>
                        )}
                        {contact.metadata?.phone && (
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground">Phone:</span>
                            <a href={`tel:${contact.metadata.phone}`} className="hover:underline">
                              {contact.metadata.phone}
                            </a>
                          </div>
                        )}
                        {contact.eventType && (
                          <div>
                            <span className="text-muted-foreground">Type: </span>
                            {contact.eventType}
                          </div>
                        )}
                        {contact.metadata?.noteText && (
                          <div className="mt-2 text-muted-foreground">
                            <span className="text-muted-foreground">Note: </span>
                            {contact.metadata.noteText}
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
