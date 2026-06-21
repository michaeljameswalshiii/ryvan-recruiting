'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Plus, Users } from 'lucide-react';
import { getAllClients } from "@/lib/db/repositories/client-repository";

export default function ContactsPage() {
  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadContacts = async () => {
    try {
      setLoading(true);
      setError(null);

      const tenantId = "default-tenant"; // ← Update this with real auth later
      if (!tenantId) {
        setError("No tenant ID found");
        return;
      }

      const allClients = await getAllClients(tenantId);
      setClients(allClients || []);
    } catch (err: any) {
      console.error("Error loading contacts:", err);
      setError("Failed to load contacts. Check console or Vercel Logs.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadContacts();
  }, []);

  if (loading) {
    return <div className="p-12 text-center text-lg">Loading contacts...</div>;
  }

  if (error) {
    return (
      <div className="p-12 text-center">
        <p className="text-red-600 mb-4">{error}</p>
        <Button onClick={loadContacts}>Retry</Button>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Users className="h-8 w-8" /> Contacts
          </h1>
          <p className="text-muted-foreground">Manage all your contacts and relationships.</p>
        </div>
        <Button asChild>
          <Link href="/dashboard/contacts/new">
            <Plus className="h-4 w-4 mr-2" /> New Contact
          </Link>
        </Button>
      </div>

      {clients.length === 0 ? (
        <div className="text-center py-20 border rounded-2xl bg-muted/30">
          <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-xl font-medium">No contacts yet</h3>
          <p className="text-muted-foreground mt-2">Create your first contact to get started.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {clients.map((client) => (
            <div key={client.id} className="border rounded-xl p-6 hover:shadow-md transition">
              <div className="flex justify-between">
                <div>
                  <h3 className="font-semibold text-lg">{client.name}</h3>
                  <p className="text-sm text-muted-foreground">{client.industry || '—'}</p>
                </div>
                <div className="text-right text-sm">
                  <div>{client.contacts?.length || 0} contacts</div>
                </div>
              </div>

              {client.contacts && client.contacts.length > 0 && (
                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-2">
                  {client.contacts.slice(0, 4).map((contact: any) => (
                    <Link
                      key={contact.id}
                      href={`/dashboard/contacts/${contact.id}`}
                      className="block p-3 border rounded-lg hover:bg-muted/50 text-sm"
                    >
                      <div className="font-medium">{contact.name}</div>
                      <div className="text-xs text-muted-foreground">{contact.title}</div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
