'use client';

import Link from 'next/link';
import { useClients } from '@/lib/hooks/query-client';
import { Button } from '@/components/ui/button';

export default function ContactInfoPage() {
  const { data: clients = [], isLoading, error, refetch } = useClients();

  if (isLoading) {
    return <div className="p-8 text-center text-lg">Loading contacts...</div>;
  }

  if (error) {
    return (
      <div className="p-8 text-center">
        <p className="text-red-600 mb-4">Error loading contacts</p>
        <Button onClick={() => refetch()}>Try Again</Button>
      </div>
    );
  }

  // Flatten contacts from companies (this was working before)
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
          <p className="text-muted-foreground mt-2">
            {contacts.length} contacts from {clients.length} companies
          </p>
        </div>
        <Button onClick={() => refetch()}>Refresh Data</Button>
      </div>

      {/* Debug info - remove once contacts are showing */}
      <div className="mb-8 p-6 bg-blue-50 border border-blue-200 rounded-2xl text-sm">
        <strong>Debug:</strong> {clients.length} companies loaded. 
        Contacts found: {contacts.length}
        <br />
        First company contacts count: {clients[0]?.contacts?.length || 0}
      </div>

      {contacts.length === 0 ? (
        <div className="text-center py-20 bg-card border rounded-3xl">
          <p className="text-xl text-muted-foreground">No contacts found.</p>
          <p className="mt-2 text-sm">Check the debug box above or seed some test data.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {contacts.map((contact: any) => (
            <div
              key={contact.id}
              className="group bg-card border rounded-3xl overflow-hidden hover:shadow-md transition-all duration-200"
            >
              <Link
                href={`/dashboard/contact-info/${contact.id}`}
                className="block p-8 hover:bg-muted/50 transition-colors"
              >
                <h3 className="text-2xl font-semibold group-hover:text-primary transition-colors">
                  {contact.name}
                </h3>
                <p className="text-muted-foreground mt-1">{contact.title}</p>

                <div className="mt-8 space-y-3 text-sm">
                  <div className="flex gap-3">
                    <span className="text-muted-foreground w-16">Email</span>
                    <span className="font-medium truncate">{contact.email}</span>
                  </div>
                  <div className="flex gap-3">
                    <span className="text-muted-foreground w-16">Phone</span>
                    <span className="font-medium">{contact.phone || '—'}</span>
                  </div>
                  <div className="flex gap-3">
                    <span className="text-muted-foreground w-16">Company</span>
                    <span className="font-medium">{contact.companyName}</span>
                  </div>
                </div>
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
