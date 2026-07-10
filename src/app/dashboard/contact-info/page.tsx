'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { getClients } from '@/lib/actions/client-actions';

export default function ContactInfoPage() {
  const [contacts, setContacts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchContacts = async () => {
    setIsLoading(true);
    try {
      const result = await getClients();
      setContacts(result.clients || []);
    } catch (err) {
      console.error(err);
      setContacts([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchContacts();
  }, []);

  if (isLoading) return <div className="p-6">Loading...</div>;

  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-2">Contact Info</h1>
      <p className="mb-6">Loaded {contacts.length} contacts</p>

      {contacts.length === 0 ? (
        <p>No contacts found.</p>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {contacts.map((contact, index) => (
            <Link 
              key={contact.id || index} 
              href={`/dashboard/contact-info/${contact.id}`} // Detail page link
              className="block border rounded-lg p-6 bg-white shadow-sm hover:shadow-md hover:border-blue-300 transition-all"
            >
              <div className="font-semibold text-xl mb-1">{contact.name}</div>
              {contact.title && <div className="text-sm text-gray-600 mb-3">{contact.title}</div>}
              
              <div className="space-y-1 text-sm">
                {contact.email && <div>✉️ {contact.email}</div>}
                {contact.phone && <div>☎️ {contact.phone}</div>}
              </div>

              {contact.companyName && (
                <div className="mt-4 pt-4 border-t text-xs text-gray-500">
                  Company: {contact.companyName}
                </div>
              )}
            </Link>
          ))}
        </div>
      )}

      <Button onClick={fetchContacts} className="mt-8">
        Refresh
      </Button>
    </div>
  );
}
