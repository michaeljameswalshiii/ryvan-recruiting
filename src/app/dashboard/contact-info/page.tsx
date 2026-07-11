'use client';

import Link from 'next/link';
import { useClients } from '@/lib/hooks/query-client';
import { Button } from '@/components/ui/button';

export default function ContactInfoPage() {
  const { data: clientsData, isLoading, error, refetch } = useClients();

  const clients = Array.isArray(clientsData) ? clientsData : (clientsData?.clients || []);

  if (isLoading) return <div className="p-8">Loading contacts...</div>;
  if (error) return (
    <div className="p-8 text-center">
      <p className="text-red-600">Error loading contacts</p>
      <Button onClick={() => refetch()}>Try Again</Button>
    </div>
  );

  const contacts = clients.flatMap((company: any) =>
    Array.isArray(company?.contacts) 
      ? company.contacts.map((contact: any) => ({
          ...contact,
          companyName: company.name || company.companyName || 'Unknown'
        }))
      : []
  );

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-4xl font-bold">Contact Info</h1>
        <Button onClick={() => refetch()}>Refresh</Button>
      </div>

      <p className="mb-6 text-lg">Total Contacts: {contacts.length}</p>

      {contacts.length === 0 ? (
        <div className="text-center py-20 bg-card border rounded-3xl">
          <p className="text-xl">No contacts found.</p>
        </div>
      ) : (
        <div className="bg-card border rounded-2xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left p-6 font-semibold">Name</th>
                <th className="text-left p-6 font-semibold">Title</th>
                <th className="text-left p-6 font-semibold">Email</th>
                <th className="text-left p-6 font-semibold">Phone</th>
                <th className="text-left p-6 font-semibold">Company</th>
                <th className="p-6 w-24"></th>
              </tr>
            </thead>
            <tbody>
              {contacts.map((contact: any) => (
                <tr key={contact.id} className="border-b hover:bg-muted/50 transition-colors">
                  <td className="p-6 font-medium">
                    <Link href={`/dashboard/contact-info/${contact.id}`} className="hover:underline">
                      {contact.name}
                    </Link>
                  </td>
                  <td className="p-6 text-muted-foreground">{contact.title}</td>
                  <td className="p-6 text-muted-foreground">{contact.email}</td>
                  <td className="p-6 text-muted-foreground">{contact.phone || '—'}</td>
                  <td className="p-6 text-muted-foreground">{contact.companyName}</td>
                  <td className="p-6 text-right">
                    <Link href={`/dashboard/contact-info/${contact.id}`} className="text-blue-600 hover:underline text-sm">
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
