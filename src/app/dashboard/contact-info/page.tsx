'use client';

import { useState } from 'react';
import { useClients, useAddContact } from '@/lib/hooks/query-client';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export default function ContactInfoPage() {
  const { data: clients = [], isLoading, error, refetch } = useClients();
  const addContactMutation = useAddContact();

  if (isLoading) return <div className="p-6">Loading contacts...</div>;
  if (error) return (
    <div className="p-6 text-center">
      <p className="text-red-600 mb-4">Error loading contacts</p>
      <Button onClick={() => refetch()}>Try Again</Button>
    </div>
  );

  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-4">Contact Info</h1>
      <p>Loaded {clients.length} companies • {clients.reduce((sum, c) => sum + (c.contacts?.length || 0), 0)} contacts</p>
      
      <Button onClick={() => refetch()} className="mt-4">
        Refresh
      </Button>
    </div>
  );
}
