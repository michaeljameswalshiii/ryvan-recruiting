'use client';

import Link from 'next/link';
import { useClients } from '@/lib/hooks/query-client';
import { Button } from '@/components/ui/button';

export default function ContactInfoPage() {
  const { data: clients = [], isLoading, error, refetch } = useClients();

  if (isLoading) return <div className="p-6">Loading contacts...</div>;
  if (error) return (
    <div className="p-6 text-center">
      <p className="text-red-600 mb-4">Error loading contacts</p>
      <Button onClick={() => refetch()}>Try Again</Button>
    </div>
  );

  // Simple flattening - match what was working before
  const contacts = clients.flatMap((company: any) => 
    (company.contacts || []).map((contact: any) => ({
      ...contact,
      company: company.name || company.companyName
    }))
  );

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Contact Info</h1>
        <Button onClick={() => refetch()}>Refresh</Button>
      </div>

      <p className="mb-6">Companies: {clients.length} | Contacts: {contacts.length}</p>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {contacts.length > 0 ? (
          contacts.map((contact: any) => (
            <div key={contact.id} className="border rounded-xl p-6 hover:shadow-md transition-all bg-card">
              <Link 
                href={`/dashboard/contact-info/${contact.id}`}
                className="block"
              >
                <h3 className="text-xl font-semibold hover:text-blue-600">{contact.name}</h3>
                <p className="text-muted-foreground">{contact.title}</p>
                
                <div className="mt-4 space-y-2 text-sm">
                  <p><span className="text-muted-foreground">Email:</span> {contact.email}</p>
                  <p><span className="text-muted-foreground">Phone:</span> {contact.phone}</p>
                  <p><span className="text-muted-foreground">Company:</span> {contact.company}</p>
                </div>
              </Link>
            </div>
          ))
        ) : (
          <div className="col-span-full text-center py-12">
            <p>No contacts found in companies.</p>
            <p className="text-sm text-muted-foreground mt-2">Try refreshing or check your data.</p>
          </div>
        )}
      </div>
    </div>
  );
}
