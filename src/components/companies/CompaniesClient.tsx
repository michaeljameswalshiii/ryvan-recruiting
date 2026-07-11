'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Plus, RefreshCw, Building2 } from 'lucide-react';
import { useClients, useCreateClient, useDeleteClient } from '@/lib/hooks/query-client';
import Link from 'next/link';

export function CompaniesClient() {
  const router = useRouter();
  const { data, isLoading, error, refetch } = useClients();
  
  const rawData = Array.isArray(data) ? data : (data?.clients || []);

  // Filter for likely company records (has no email or has company-like fields)
  const companies = rawData.filter((item: any) => {
    return !item.email || item.name?.includes('Chick-fil-A') || item.type === 'company' || item.industry;
  });

  const createClientMutation = useCreateClient();
  const deleteClientMutation = useDeleteClient();

  const [showForm, setShowForm] = useState(false);
  const [newCompanyName, setNewCompanyName] = useState('');
  const [newCompanyIndustry, setNewCompanyIndustry] = useState('');

  const handleCreateCompany = async () => {
    if (!newCompanyName) return alert('Company name is required');
    try {
      const formData = new FormData();
      formData.append('name', newCompanyName);
      if (newCompanyIndustry) formData.append('industry', newCompanyIndustry);
      await createClientMutation.mutateAsync(formData);
      setShowForm(false);
      setNewCompanyName('');
      setNewCompanyIndustry('');
      refetch();
      alert('Company created successfully!');
    } catch (err) {
      alert('Failed to create company');
    }
  };

  const handleDeleteCompany = async (companyId: string, companyName: string) => {
    if (!confirm(`Delete ${companyName}?`)) return;
    try {
      await deleteClientMutation.mutateAsync(companyId);
      refetch();
      alert('Company deleted!');
    } catch (err) {
      alert('Failed to delete company');
    }
  };

  if (isLoading) return <div className="p-8">Loading companies...</div>;
  if (error) return <div className="p-8 text-red-600">Error loading companies.</div>;

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

      {showForm && (
        <div className="bg-white border rounded-lg p-6 mb-8 max-w-md">
          <h3 className="text-lg font-semibold mb-4">Add New Company</h3>
          <input
            type="text"
            value={newCompanyName}
            onChange={(e) => setNewCompanyName(e.target.value)}
            className="w-full p-3 border rounded mb-4"
            placeholder="Company Name"
          />
          <input
            type="text"
            value={newCompanyIndustry}
            onChange={(e) => setNewCompanyIndustry(e.target.value)}
            className="w-full p-3 border rounded mb-4"
            placeholder="Industry (optional)"
          />
          <Button onClick={handleCreateCompany}>Create Company</Button>
        </div>
      )}

      {companies.length === 0 ? (
        <div className="text-center py-20">No companies yet. Add one above.</div>
      ) : (
        <div className="bg-white border rounded-2xl overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-6 py-4">Company</th>
                <th className="text-left px-6 py-4">Industry</th>
                <th className="text-left px-6 py-4">Status</th>
                <th className="text-left px-6 py-4">Contacts</th>
                <th className="text-left px-6 py-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {companies.map((company: any) => (
                <tr key={company.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 font-medium">
                    <Link href={`/dashboard/companies/${company.id}`} className="hover:underline">
                      {company.name}
                    </Link>
                  </td>
                  <td className="px-6 py-4 text-gray-600">{company.industry || '—'}</td>
                  <td className="px-6 py-4">
                    <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-xs">Active</span>
                  </td>
                  <td className="px-6 py-4 text-gray-600">{company.contacts?.length || 0}</td>
                  <td className="px-6 py-4">
                    <div className="flex gap-3">
                      <Button variant="ghost" size="sm" onClick={() => router.push(`/dashboard/companies/${company.id}`)}>View</Button>
                      <Button variant="ghost" size="sm" onClick={() => router.push(`/dashboard/companies/${company.id}/edit`)}>Edit</Button>
                      <Button variant="ghost" size="sm" className="text-red-600" onClick={() => handleDeleteCompany(company.id, company.name)}>Delete</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
