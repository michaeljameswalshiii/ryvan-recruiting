import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getAllContactsFromEvents } from '@/lib/db/events';

export default async function ContactsPage() {
  let contacts: any[] = [];
  let error: string | null = null;

  try {
    contacts = await getAllContactsFromEvents();
  } catch (err: any) {
    error = err.message || 'Failed to load contacts from turnkey-events';
    console.error('Contacts fetch error:', err);
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Contacts</h1>
          <p className="text-muted-foreground">
            From <code>turnkey-events</code> table • {contacts.length} records
          </p>
        </div>
      </div>

      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6 text-red-700">
            Error: {error}
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
              No contacts found in the events table.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {contacts.map((contact, index) => {
                const name = contact.name || contact.fullName || contact.candidateName || 'Unnamed';
                return (
                  <Card key={contact.PK || contact.id || index} className="hover:shadow-md transition-shadow">
                    <CardContent className="pt-6 space-y-4">
                      <div>
                        <h3 className="font-semibold text-lg">{name}</h3>
                        {contact.title && <p className="text-sm text-muted-foreground">{contact.title}</p>}
                      </div>

                      {contact.company && (
                        <Badge variant="secondary">{contact.company}</Badge>
                      )}

                      <div className="space-y-2 text-sm">
                        {contact.email && (
                          <a href={`mailto:${contact.email}`} className="flex items-center gap-2 hover:underline">
                            ✉️ {contact.email}
                          </a>
                        )}
                        {contact.phone && (
                          <a href={`tel:${contact.phone}`} className="flex items-center gap-2 hover:underline">
                            📞 {contact.phone}
                          </a>
                        )}
                      </div>

                      {contact.notes && (
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          {contact.notes}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
