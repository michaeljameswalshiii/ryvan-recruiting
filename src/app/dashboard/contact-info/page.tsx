'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { getClients } from '@/lib/actions/client-actions';

export default function ContactInfoPage() {
  const [clients, setClients] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchClients = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await getClients();
      setClients(result.clients || []);
      console.log('[ContactInfo] Loaded', result.clients?.length || 0, 'clients');
    } catch (err: any) {
      console.error('[ContactInfo] Fetch error:', err);
      setError(err.message || 'Failed to load contacts');
      setClients([]); // Fallback
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchClients();
  }, []);

  if (isLoading) return <div className="p-6">Loading contacts...</div>;

  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-4">Contact Info</h1>
      <p className="mb-6">Loaded {clients.length} contacts</p>

      {error && (
        <div className="bg-red-50 border border-red-200 p-4 rounded-md mb-6">
          <p className="text-red-600">Note: {error}</p>
        </div>
      )}

      {clients.length === 0 ? (
        <p className="text-gray-500">No contacts found yet.</p>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {clients.map((contact: any, index: number) => (
            <div key={contact.id || index} className="border p-6 rounded-lg bg-white shadow-sm">
              <h3 className="font-semibold text-lg">{contact.name}</h3>
              <p className="text-gray-600">{contact.title}</p>
              {contact.email && <p className="text-blue-600">{contact.email}</p>}
              {contact.phone && <p className="text-gray-600">{contact.phone}</p>}
              {contact.companyName && (
                <p className="text-sm text-gray-500 mt-2">Company: {contact.companyName}</p>
              )}
            </div>
          ))}
        </div>
      )}

      <Button onClick={fetchClients} className="mt-8">
        Refresh
      </Button>
    </div>
  );
}
