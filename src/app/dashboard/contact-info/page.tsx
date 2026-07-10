'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
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

  if (isLoading) return <div className="p-6">Loading contacts...</div>;

  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-2">Contact Info</h1>
      <p className="mb-6 text-gray-600">Loaded {contacts.length} contacts</p>

      {contacts.length === 0 ? (
        <p>No contacts found.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {contacts.map((contact, index) => (
            <div key={contact.id || index} className="border rounded-lg p-5 bg-white shadow-sm">
              {/* Individual Name as main title */}
              <h3 className="font-semibold text-xl mb-1">{contact.name || 'No Name'}</h3>
              
              {contact.title && <p className="text-sm text-gray-600 mb-3">{contact.title}</p>}

              {contact.email && (
                <p className="text-sm mb-1">
                  ✉️ <a href={`mailto:${contact.email}`} className="text-blue-600 hover:underline">{contact.email}</a>
                </p>
              )}
              {contact.phone && <p className="text-sm mb-3">☎️ {contact.phone}</p>}

              {contact.companyName && (
                <p className="text-xs text-gray-500 mt-3 pt-3 border-t">
                  Company: {contact.companyName}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      <Button onClick={fetchContacts} className="mt-8">
        Refresh
      </Button>
    </div>
  );
}
