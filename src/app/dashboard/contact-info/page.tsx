'use client';

import Link from 'next/link';
import { useClients } from '@/lib/hooks/query-client';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export default function ContactInfoPage() {
  const { data: clients = [], isLoading, error, refetch } = useClients();

  if (isLoading) return <div className="p-8">Loading contacts...</div>;
  if (error) return (
    <div className="p-8 text-center">
      <p className="text-red-600 mb-4">Error loading contacts</p>
      <Button onClick={() => refetch()}>Try Again</Button>
    </div>
  );

  // Flatten contacts with company info
  const contacts = clients.flatMap((company: any) =>
    (company.contacts || []).map((contact: any) => ({
      ...contact,
      company: { id: company.id, name: company.name || company.companyName }
    }))
  );

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-10">
        <div>
          <h1 className="text-4xl font-bold tracking-tight">Contact Info</h1>
          <p className="text-muted-foreground mt-1">
            {contacts.length} contacts from {clients.length} companies
          </p>
        </div>
        <Button onClick={() => refetch()}>Refresh</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {contacts.map((contact: any) => (
          <div
            key={contact.id}
            className="group bg-card border rounded-3xl overflow-hidden hover:shadow-lg transition-all duration-200"
          >
            <Link
              href={`/dashboard/contact-info/${contact.id}`}
              className="block p-8 hover:bg-muted/50 transition-colors h-full"
            >
              <h3 className="text-2xl font-semibold group-hover:text-primary transition-colors">
                {contact.name}
              </h3>
              <p className="text-muted-foreground mt-1">{contact.title}</p>

              <div className="mt-8 space-y-4 text-sm">
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
                  <span className="font-medium">{contact.company?.name}</span>
                </div>
              </div>
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}
