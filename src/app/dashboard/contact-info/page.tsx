'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { getClients } from '@/lib/actions/client-actions';

export default function ContactInfoPage() {
  const [clients, setClients] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchClients = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await getClients();
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

  if (isLoading) return <div className="p-6">Loading contacts...</div>;

  if (error) {
    return (
      <div className="p-6 text-center">
        <div className="text-red-600 mb-4">Error: {error}</div>
        <Button onClick={fetchClients}>Try Again</Button>
      </div>
    );
  }

  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold">Contact Info</h1>
      <p>Loaded {clients.length} companies</p>
      <Button onClick={fetchClients} className="mt-4">
        Refresh
      </Button>
    </div>
  );
}
