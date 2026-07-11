'use client';

import Link from 'next/link';
import { useClients } from '@/lib/hooks/query-client';
import { Button } from '@/components/ui/button';

export default function ContactInfoPage() {
  const { data: clientsData, isLoading, error, refetch } = useClients();

  // Handle possible data shapes
  const clients = Array.isArray(clientsData) ? clientsData : (clientsData?.clients || []);

  if (isLoading) return <div className="p-8 text-center">Loading contacts...</div>;
  if (error) return (
    <div className="p-8 text-center">
      <p className="text-red-600">Error loading contacts</p>
      <Button onClick={() => refetch()}>Try Again</Button>
    </div>
  );

  // Flat list of contacts
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
      <div className="flex justify-between items-center mb-10">
        <div>
          <h1 className="text-4xl font-bold tracking-tight">Contact Info</h1>
          <p className="text-muted-foreground mt-2">{contacts.length} contacts</p>
        </div>
        <Button onClick={() => refetch()}>Refresh</Button>
      </div>

      {contacts.length === 0 ? (
        <div className="text-center py-20 bg-card border rounded-3xl">
          <p className="text-xl">No contacts found.</p>
          <p className="text-sm text-muted-foreground mt-4">Companies exist but contacts arrays are empty.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {contacts.map((contact: any) => (
            <div
              key={contact.id}
              className="group bg-card border rounded-3xl p-8 hover:shadow-lg transition-all"
            >
              <Link href={`/dashboard/contact-info/${contact.id}`} className="block">
                <h3 className="text-2xl font-semibold group-hover:text-primary transition-colors">
                  {contact.name}
                </h3>
                <p className="text-muted-foreground mt-1">{contact.title}</p>

                <div className="mt-8 space-y-3 text-sm">
                  <div><span className="text-muted-foreground">Email:</span> {contact.email}</div>
                  <div><span className="text-muted-foreground">Phone:</span> {contact.phone || '—'}</div>
                  <div><span className="text-muted-foreground">Company:</span> {contact.companyName}</div>
                </div>
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
