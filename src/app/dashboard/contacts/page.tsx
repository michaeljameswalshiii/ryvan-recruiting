'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Plus, Users, RefreshCw } from 'lucide-react';
import { useClients, clientKeys } from '@/lib/hooks/query-client';
import { useQueryClient } from '@tanstack/react-query';

export default function ContactsPage() {
  const queryClient = useQueryClient();
  
  // Use TanStack Query hook - properly fetches data via server action
  const { data: clients = [], isLoading, error, refetch } = useClients();

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: clientKeys.lists() });
    refetch();
  };

  // Loading state
  if (isLoading) {
    return <div className="p-12 text-center">Loading contacts...</div>;
  }

  // Error state
  if (error) {
    const isDev = process.env.NODE_ENV === 'development';
    const errorMessage = error?.message || 'Unknown error';
    
    return (
      <div className="p-12 text-center space-y-6">
        <p className="text-red-600 text-lg">Failed to load contacts</p>
        {isDev && (
          <p className="text-sm text-muted-foreground">Error: {errorMessage}</p>
        )}
        <Button onClick={handleRefresh} variant="outline">
          <RefreshCw className="mr-2 h-4 w-4" /> Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Users className="h-8 w-8" /> Contacts
          </h1>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleRefresh} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" /> Refresh
          </Button>
          <Button asChild>
            <Link href="/dashboard/contacts/new">
              <Plus className="h-4 w-4 mr-2" /> New Contact
            </Link>
          </Button>
        </div>
      </div>

      {clients.length === 0 ? (
        <div className="text-center py-20 border rounded-2xl bg-muted/30">
          <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-xl font-medium">No contacts yet</h3>
        </div>
      ) : (
        <div className="grid gap-4">
          {clients.map((client) => (
            <div key={client.id} className="border rounded-xl p-6">
              <h3 className="font-semibold">{client.name}</h3>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
