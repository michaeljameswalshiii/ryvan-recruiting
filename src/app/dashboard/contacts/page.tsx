'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Plus, Users, RefreshCw } from 'lucide-react';
import { getAllClients } from "@/lib/db/repositories/client-repository";

export default function ContactsPage() {
  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadContacts = async () => {
    try {
      setLoading(true);
      setError(null);

      // Use a safe default tenant for now (same pattern that worked before)
      const tenantId = "default-tenant";

      const allClients = await getAllClients(tenantId);
      setClients(allClients || []);
    } catch (err: any) {
      console.error("Failed to load contacts:", err);
      setError("Credential is missing or table not set up. Check Vercel Logs.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadContacts();
  }, []);

  if (loading) {
    return <div className="p-12 text-center">Loading contacts...</div>;
  }

  if (error) {
    return (
      <div className="p-12 text-center space-y-6">
        <p className="text-red-600 text-lg">{error}</p>
        <Button onClick={loadContacts} variant="outline">
          <RefreshCw className="mr-2 h-4 w-4" /> Retry
        </Button>
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
        </div>
      ) : (
        <div className="grid gap-4">
          {clients.map((client) => (
            <div key={client.id} className="border rounded-xl p-6">
              <h3 className="font-semibold">{client.name}</h3>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
