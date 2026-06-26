// src/app/dashboard/contacts/page.tsx
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getAllContactsFromEvents } from '@/lib/db/events';

export default async function ContactsPage() {
  let contacts: any[] = [];
  let error: string | null = null;

  try {
    contacts = await getAllContactsFromEvents();
  } catch (err: any) {
    console.error('Contacts fetch error:', err);
    error = err.message?.includes('credentials') 
      ? 'AWS credentials not configured on server' 
      : err.message || 'Failed to load contacts';
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Contacts</h1>
          <p className="text-muted-foreground">
            From turnkey-events table • {contacts.length} records
          </p>
        </div>
      </div>

      {error && (
        <Card className="border-red-500 bg-red-50">
          <CardContent className="pt-6 text-red-700">
            ⚠️ {error}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Contact Directory</CardTitle>
        </CardHeader>
        <CardContent>
          {contacts.length === 0 && !error ? (
            <div className="text-center py-16 text-muted-foreground">
              No contacts found yet.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {contacts.map((c: any, i: number) => (
                <Card key={c.PK || i} className="hover:shadow-md transition-shadow">
                  <CardContent className="pt-6 space-y-3">
                    <h3 className="font-semibold text-lg">
                      {c.name || c.fullName || c.candidateName || 'Unnamed Contact'}
                    </h3>
                    {c.title && <p className="text-sm text-muted-foreground">{c.title}</p>}
                    {c.company && <Badge variant="secondary">{c.company}</Badge>}

                    <div className="space-y-1 text-sm">
                      {c.email && <a href={`mailto:${c.email}`} className="block hover:underline">✉️ {c.email}</a>}
                      {c.phone && <a href={`tel:${c.phone}`} className="block hover:underline">📞 {c.phone}</a>}
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
