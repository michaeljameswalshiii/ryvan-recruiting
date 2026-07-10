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

  if (isLoading) return <div className="p-6">Loading...</div>;

  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-2">Contact Info</h1>
      <p className="mb-6">Loaded {contacts.length} contacts</p>

      {contacts.length === 0 ? (
        <p>No contacts found.</p>
      ) : (
        <div className="overflow-x-auto border rounded-lg">
          <table className="w-full min-w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-6 py-3 text-sm font-medium">Name</th>
                <th className="text-left px-6 py-3 text-sm font-medium">Title</th>
                <th className="text-left px-6 py-3 text-sm font-medium">Email</th>
                <th className="text-left px-6 py-3 text-sm font-medium">Phone</th>
                <th className="text-left px-6 py-3 text-sm font-medium">Company</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {contacts.map((contact, index) => (
                <tr key={contact.id || index} className="hover:bg-gray-50">
                  <td className="px-6 py-4 font-medium">{contact.name}</td>
                  <td className="px-6 py-4 text-gray-600">{contact.title || '-'}</td>
                  <td className="px-6 py-4">
                    {contact.email ? (
                      <a href={`mailto:${contact.email}`} className="text-blue-600 hover:underline">{contact.email}</a>
                    ) : '-'}
                  </td>
                  <td className="px-6 py-4">{contact.phone || '-'}</td>
                  <td className="px-6 py-4 text-gray-600">{contact.companyName || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Button onClick={fetchContacts} className="mt-6">Refresh</Button>
    </div>
  );
}
