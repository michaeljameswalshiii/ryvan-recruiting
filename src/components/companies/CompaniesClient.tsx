'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Plus, RefreshCw, Building2, Mail, Phone } from 'lucide-react';
import { useClients, useCreateClient } from '@/lib/hooks/query-client';
import Link from 'next/link';

export function CompaniesClient() {
  const router = useRouter();
  const { data: clients = [], isLoading, error, refetch } = useClients();
  const createClientMutation = useCreateClient();
  
  const [showForm, setShowForm] = useState(false);
  const [newCompanyName, setNewCompanyName] = useState('');
  const [newCompanyIndustry, setNewCompanyIndustry] = useState('');
  const [newCompanyWebsite, setNewCompanyWebsite] = useState('');

  const handleCreateCompany = async () => {
    if (!newCompanyName) {
      alert('Company name is required');
      return;
    }
    
    try {
      const formData = new FormData();
      formData.append('name', newCompanyName);
      if (newCompanyIndustry) formData.append('industry', newCompanyIndustry);
      if (newCompanyWebsite) formData.append('website', newCompanyWebsite);
      
      await createClientMutation.mutateAsync(formData);
      setShowForm(false);
      setNewCompanyName('');
      setNewCompanyIndustry('');
      setNewCompanyWebsite('');
      refetch();
      alert('Company created successfully!');
    } catch (err: any) {
      console.error('Create company error:', err);
      alert(`Failed to create company: ${err?.message || 'Unknown error'}`);
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold">Companies</h1>
            <p className="text-gray-500">Manage your client companies</p>
          </div>
        </div>
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
          <span className="ml-3 text-muted-foreground">Loading companies...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold">Companies</h1>
            <p className="text-gray-500">Manage your client companies</p>
          </div>
          <Button onClick={() => refetch()} variant="outline">
            <RefreshCw className="mr-2 h-4 w-4" /> Retry
          </Button>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
          <div className="text-red-600 text-xl font-semibold mb-2">Error Loading Companies</div>
          <p className="text-red-600">{error.message}</p>
          <Button onClick={() => refetch()} className="mt-4">
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold">Companies</h1>
          <p className="text-gray-500">Manage your client companies</p>
        </div>
        <Button onClick={() => setShowForm(!showForm)}>
          <Plus className="mr-2 h-5 w-5" /> {showForm ? 'Cancel' : 'New Company'}
        </Button>
      </div>

      {/* New Company Form */}
      {showForm && (
        <div className="bg-white border rounded-lg p-6 mb-6">
          <h3 className="text-lg font-semibold mb-4">Add New Company</h3>
          <div className="grid gap-4 max-w-xl">
            <div>
              <label className="block text-sm font-medium mb-1">Company Name *</label>
              <input
                type="text"
                value={newCompanyName}
                onChange={(e) => setNewCompanyName(e.target.value)}
                className="w-full h-10 px-3 border rounded-md"
                placeholder="Acme Corporation"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Industry</label>
              <input
                type="text"
                value={newCompanyIndustry}
                onChange={(e) => setNewCompanyIndustry(e.target.value)}
                className="w-full h-10 px-3 border rounded-md"
                placeholder="Technology, Finance, etc."
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Website</label>
              <input
                type="url"
                value={newCompanyWebsite}
                onChange={(e) => setNewCompanyWebsite(e.target.value)}
                className="w-full h-10 px-3 border rounded-md"
                placeholder="https://example.com"
              />
            </div>
            <div className="flex gap-3">
              <Button onClick={handleCreateCompany} disabled={createClientMutation.isPending}>
                {createClientMutation.isPending ? 'Creating...' : 'Create Company'}
              </Button>
              <Button variant="outline" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Companies Table */}
      {clients.length === 0 ? (
        <div className="bg-white border rounded-2xl p-12 text-center">
          <div className="text-4xl mb-6">🏢</div>
          <h2 className="text-2xl font-semibold mb-3">No Companies Yet</h2>
          <p className="text-gray-600 max-w-md mx-auto mb-6">
            Get started by adding your first client company.
          </p>
          <Button onClick={() => setShowForm(true)}>
            <Plus className="mr-2 h-4 w-4" /> Add Your First Company
          </Button>
        </div>
      ) : (
        <div className="bg-white border rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Company</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Industry</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Status</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Contacts</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {clients.map((company: any) => (
                <tr key={company.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 bg-blue-100 rounded-lg flex items-center justify-center">
                        <Building2 className="h-5 w-5 text-blue-600" />
                      </div>
                      <div>
                        <div className="font-medium">{company.name}</div>
                        {company.website && (
                          <a 
                            href={company.website} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-sm text-blue-600 hover:underline"
                          >
                            {company.website.replace(/^https?:\/\//, '')}
                          </a>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {company.industry || '-'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs ${
                      company.status === 'Active' 
                        ? 'bg-green-100 text-green-700' 
                        : company.status === 'Inactive'
                        ? 'bg-gray-100 text-gray-700'
                        : 'bg-yellow-100 text-yellow-700'
                    }`}>
                      {company.status || 'Active'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {company.contacts?.length || 0} contact{(company.contacts?.length || 0) !== 1 ? 's' : ''}
                  </td>
                  <td className="px-4 py-3">
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => router.push(`/dashboard/companies/${company.id}`)}
                    >
                      View
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Stats Footer */}
      {clients.length > 0 && (
        <div className="mt-4 text-sm text-gray-500">
          Showing {clients.length} company{clients.length !== 1 ? 's' : ''}
        </div>
      )}
    </div>
  );
}
