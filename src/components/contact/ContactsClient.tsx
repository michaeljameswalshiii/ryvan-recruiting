'use client';

import { useQuery } from '@tanstack/react-query';
import { getClients } from '@/lib/actions/client-actions';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import Link from 'next/link';

export function ContactsClient() {
  const { data: clients = [], isLoading, error } = useQuery({
    queryKey: ['clients'],
    queryFn: getClients,
    retry: 1,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  if (error) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center p-8 text-center">
        <div className="text-red-600 text-xl font-medium mb-4">
          Credential is missing or table not set up
        </div>
        <p className="text-gray-600 max-w-md mb-6">
          This usually happens when AWS credentials or DynamoDB table names are not correctly configured in Vercel.
        </p>
        <div className="text-sm text-gray-500 mb-8">
          Check Vercel Environment Variables for:<br />
          AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION, DYNAMODB_CLIENTS_TABLE
        </div>
        <Button onClick={() => window.location.reload()}>
          <span className="mr-2">↻</span> Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold">Contacts</h1>
          <p className="text-gray-500 mt-1">Manage your client and prospect relationships</p>
        </div>
        <Button asChild>
          <Link href="/dashboard/contacts/new">
            <Plus className="mr-2 h-5 w-5" /> New Contact
          </Link>
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-12">Loading contacts...</div>
      ) : clients.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          No contacts found
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {clients.map((contact: any) => (
            <Link 
              key={contact.id} 
              href={`/dashboard/contacts/${contact.id}`}
              className="block bg-white border rounded-2xl p-6 hover:shadow-md transition-shadow"
            >
              <div className="font-semibold text-lg">{contact.name}</div>
              <div className="text-gray-600 mt-1">{contact.title}</div>
              <div className="text-sm text-gray-500 mt-4">{contact.companyName}</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
