'use client';

import { useClients } from '@/lib/hooks/query-client';

export default function ContactsPage() {
  const { data: clients, isLoading: loading, error } = useClients();

  if (loading) {
    return <div className="p-12 text-center">Loading contacts...</div>;
  }

  if (error) {
    return (
      <div className="p-12 text-center text-red-600">
        Error loading contacts: {error.message}
        <br />
        <button 
          onClick={() => window.location.reload()} 
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-6 flex items-center gap-3">
        Contacts <span className="text-xl text-muted-foreground">({clients?.length || 0})</span>
      </h1>

      {clients?.length === 0 ? (
        <p>No contacts found.</p>
      ) : (
        <pre className="bg-gray-100 p-4 rounded overflow-auto">
          {JSON.stringify(clients?.slice(0, 10) || [], null, 2)}
        </pre>
      )}
    </div>
  );
}
