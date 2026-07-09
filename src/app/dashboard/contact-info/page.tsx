'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card, CardHeader, CardContent, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

export default function ContactInfoPage() {
  const [clients, setClients] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchClients = async () => {
    setIsLoading(true);
    setError(null);
    try {
      // Replace with your actual API endpoint if different
      const response = await fetch('/api/clients', { cache: 'no-store' });
      const result = await response.json();

      if (result.error) {
        throw new Error(result.error);
      }

      setClients(result.clients || []);
      console.log('[ContactInfo] Loaded', result.clients?.length || 0, 'clients');
    } catch (err: any) {
      console.error('[ContactInfo] Fetch error:', err);
      setError(err.message || 'Failed to load contacts');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchClients();
  }, []);

  const [showForm, setShowForm] = useState(false);

  if (isLoading) {
    return <div className="p-6">Loading contacts...</div>;
  }

  if (error) {
    return (
      <div className="p-6 text-center">
        <div className="text-red-600 mb-4">Error loading contacts: {error}</div>
        <Button onClick={fetchClients}>Try Again</Button>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Contact Info</h1>
          <p className="text-muted-foreground">
            {clients.reduce((sum, c) => sum + (c.contacts?.length || 0), 0)} contacts
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/dashboard/contacts">Go to Contacts</Link>
          </Button>
          <Button onClick={() => setShowForm(!showForm)}>
            <Plus className="mr-2 h-4 w-4" />
            {showForm ? 'Cancel' : 'Add Contact'}
          </Button>
        </div>
      </div>

      <Button onClick={fetchClients} variant="outline">
        <RefreshCw className="mr-2 h-4 w-4" /> Refresh
      </Button>

      {/* Add your form and table here later */}
      <Card>
        <CardHeader>
          <CardTitle>All Contacts</CardTitle>
        </CardHeader>
        <CardContent>
          <p>Loaded {clients.length} companies</p>
          {/* Your full table can go here */}
        </CardContent>
      </Card>
    </div>
  );
}
