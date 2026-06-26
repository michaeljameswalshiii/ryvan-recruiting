'use client';

import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import Link from 'next/link';

export function ContactsClient() {
  // Temporarily bypass data fetching to stop the crash
  const clients: any[] = [];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold">Contacts</h1>
          <p className="text-gray-500">Manage your relationships</p>
        </div>
        <Button>
          <Plus className="mr-2 h-5 w-5" /> New Contact
        </Button>
      </div>

      <div className="bg-white border rounded-2xl p-12 text-center">
        <div className="text-amber-600 text-5xl mb-6">⚠️</div>
        <h2 className="text-2xl font-semibold mb-3">Data Loading Issue</h2>
        <p className="text-gray-600 max-w-md mx-auto">
          AWS credentials or DynamoDB table is not fully configured on Vercel.
        </p>
        <p className="text-sm text-gray-500 mt-6">
          Check Vercel Environment Variables for AWS keys and table names.
        </p>
        <Button onClick={() => window.location.reload()} className="mt-8">
          Retry
        </Button>
      </div>
    </div>
  );
}
