'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
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
      setClients(result.clients || []);
      console.log('[ContactInfo] Loaded', result.clients?.length || 0, 'clients');
    } catch (err: any) {
      console.error('[ContactInfo] Fetch error:', err);
      setError(err.message || 'Failed to load contacts');
      setClients([]); // Fallback
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchClients();
  }, []);

  if (isLoading) return <div className="p-6">Loading contacts...</div>;

  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-4">Contact Info</h1>
      
      {error && (
        <div className="bg-red-50 border border-red-200 p-4 rounded-md mb-6">
          <p className="text-red-600">Note: {error}</p>
          <p className="text-sm text-gray-600 mt-1">This is expected if the DynamoDB table is not yet created.</p>
        </div>
      )}

      <p className="mb-4">Loaded {clients.length} clients</p>

      <Button onClick={fetchClients} className="mt-4">
        Refresh
      </Button>

      {clients.length === 0 && !error && (
        <p className="text-gray-500 mt-8">No clients yet. Create some in the database.</p>
      )}
    </div>
  );
}
