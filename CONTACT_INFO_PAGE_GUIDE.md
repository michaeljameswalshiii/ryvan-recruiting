# Contact Info Page - Step-by-Step Implementation Guide

## 1. Create the page directory and file

```bash
mkdir -p src/app/contact-info
touch src/app/contact-info/page.tsx
```

## 2. Add the page code (src/app/contact-info/page.tsx)

Here's a ready-to-use template modeled directly after the Companies/Contacts style:

```tsx
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

// Helper - add this to src/lib/dynamodb.ts if it doesn't exist yet
// (pattern copied from getAllCompanies)
import { DynamoDBClient, ScanCommand } from '@aws-sdk/client-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';

const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });

export async function getAllContacts() {
  const tableName = process.env.CONTACTS_TABLE || 'turnkey-contacts'; // update if different
  
  const command = new ScanCommand({
    TableName: tableName,
  });

  const response = await dynamoClient.send(command);
  
  // Convert DynamoDB items to plain objects
  return (response.Items || []).map(item => unmarshall(item));
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
        
        <Button asChild>
          <Link href="/contacts">Go to Contacts</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">All Contacts</h2>
            {/* Add filters/search here later if needed */}
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
                <Card key={contact.id || index} className="hover:shadow-md transition-shadow">
                  <CardContent className="pt-6">
                    <div className="space-y-3">
                      <div>
                        <h3 className="font-semibold text-lg">
                          {contact.name || contact.fullName || 'Unnamed Contact'}
                        </h3>
                        {contact.company && (
                          <p className="text-sm text-muted-foreground">{contact.company}</p>
                        )}
                      </div>

                      <div className="space-y-1 text-sm">
                        {contact.email && (
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground">Email:</span>
                            <a href={`mailto:${contact.email}`} className="hover:underline">
                              {contact.email}
                            </a>
                          </div>
                        )}
                        {contact.phone && (
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground">Phone:</span>
                            <a href={`tel:${contact.phone}`} className="hover:underline">
                              {contact.phone}
                            </a>
                          </div>
                        )}
                        {contact.title && (
                          <div>
                            <span className="text-muted-foreground">Title: </span>
                            {contact.title}
                          </div>
                        )}
                      </div>

                      {/* Add more fields as needed (LinkedIn, notes, etc.) */}
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
```

## Notes on the code:

- Matches the exact visual style (Card + header + responsive grid)
- Uses server component + async for direct DynamoDB fetch (fastest, like other pages)
- unmarshall converts raw DynamoDB format to usable JS objects
- Easy to extend with search, filters, or detail links later

## 3. Add the DynamoDB helper (if missing)

Add `getAllContacts()` to `src/lib/dynamodb.ts` (copy the pattern from getAllCompanies).

Update the table name env var if yours is different (turnkey-contacts, contacts, etc.).

## 4. Add it to the menu/navigation

Find your navigation (usually in `src/app/layout.tsx` or a `components/Sidebar.tsx` / `Nav.tsx`).

Look for existing links like:

```tsx
<Link href="/companies">Companies</Link>
<Link href="/contacts">Contacts</Link>
```

Add:

```tsx
<Link href="/contact-info">Contact Info</Link>
```

Place it logically (e.g. near Contacts).

## 5. Test & Deploy

Run locally:

```bash
npm run dev
```

Visit http://localhost:3000/contact-info

Commit & push to main:

```bash
git add .
git commit -m "feat: add Contact Info page (DynamoDB list)"
git push
```

Vercel will automatically deploy it (via your existing GitHub Actions workflow).
