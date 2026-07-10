'use client';

import Link from 'next/link';
import { useClients } from '@/lib/hooks/query-client';
import { Button } from '@/components/ui/button';

export default function ContactInfoPage() {
  const { data: clientsData, isLoading, error, refetch } = useClients();

  const clients = Array.isArray(clientsData) ? clientsData : 
                 (clientsData?.clients ? clientsData.clients : 
                 (clientsData ? [clientsData] : []));

  if (isLoading) return <div className="p-8">Loading...</div>;
  if (error) return <div className="p-8 text-red-600">Error loading data. <Button onClick={() => refetch()}>Retry</Button></div>;

  return (
    <div className="p-8">
      <div className="flex justify-between mb-8">
        <h1 className="text-4xl font-bold">Contact Info</h1>
        <Button onClick={() => refetch()}>Refresh</Button>
      </div>

      <p className="mb-6">Companies loaded: {clients.length}</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {clients.map((company: any) => (
          <div key={company.id} className="border rounded-2xl p-6 bg-card">
            <h3 className="font-semibold text-lg">{company.name || company.companyName}</h3>
            <p className="text-sm text-muted-foreground">ID: {company.id}</p>
            
            <div className="mt-4">
              <p className="text-sm">Contacts: {company.contacts?.length || 0}</p>
            </div>

            {company.contacts && company.contacts.length > 0 && (
              <div className="mt-6 space-y-4">
                {company.contacts.map((contact: any) => (
                  <Link
                    key={contact.id}
                    href={`/dashboard/contact-info/${contact.id}`}
                    className="block p-4 border rounded-xl hover:bg-muted transition-colors"
                  >
                    <strong>{contact.name}</strong> — {contact.title}<br />
                    {contact.email}
                  </Link>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
