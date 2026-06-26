'use client';

import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import Link from 'next/link';

export function CompaniesClient() {
  // Safe fallback - no data fetching for now
  const companies: any[] = [];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold">Companies</h1>
          <p className="text-gray-500">Manage your client companies</p>
        </div>
        <Button>
          <Plus className="mr-2 h-5 w-5" /> New Company
        </Button>
      </div>

      <div className="bg-white border rounded-2xl p-12 text-center">
        <div className="text-amber-600 text-5xl mb-6">⚠️</div>
        <h2 className="text-2xl font-semibold mb-3">Companies Page</h2>
        <p className="text-gray-600 max-w-md mx-auto">
          Data loading is temporarily disabled due to credential issues.<br />
          We are working on fixing the AWS/DynamoDB configuration.
        </p>
        <Button onClick={() => window.location.reload()} className="mt-8">
          Retry
        </Button>
      </div>
    </div>
  );
}
