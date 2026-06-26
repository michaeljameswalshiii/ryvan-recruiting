'use client';

import { useClients } from '@/lib/hooks/query-client';

export default function ContactsPage() {
  const { data: clients, isLoading: loading, error } = useClients();

  if (loading) return <div className="p-8">Loading contacts...</div>;
  if (error) return <div className="p-8 text-red-500">Error: {error?.message}</div>;

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Contacts</h1>
      <p>Total: {clients?.length || 0}</p>
      
      {/* Replace this with your actual table/list later */}
      <pre className="mt-4 bg-gray-100 p-4 overflow-auto">
        {JSON.stringify(clients?.slice(0, 5) || [], null, 2)}
      </pre>
    </div>
  );
}
