'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Plus, RefreshCw, User, Building2 } from 'lucide-react';
import { useClients, useAddContact, useRemoveContact } from '@/lib/hooks/query-client';
import {
  DEFAULT_PAGE_SIZE,
  PaginationBar,
  paginateItems,
} from '@/components/ui/pagination-bar';
import {
  SearchableSelect,
  companyOptionsFromList,
} from '@/components/ui/searchable-select';

export function ContactsClient() {
  const router = useRouter();
  const { data: clients = [], isLoading, error, refetch } = useClients();
  const addContactMutation = useAddContact();
  const removeContactMutation = useRemoveContact();

  const handleDeleteContact = async (companyId: string, contactId: string, contactName: string) => {
    if (!confirm(`Are you sure you want to delete ${contactName}?`)) {
      return;
    }
    
    try {
      await removeContactMutation.mutateAsync({ clientId: companyId, contactId, contactName });
      refetch();
      alert('Contact deleted successfully!');
    } catch (err: any) {
      console.error('Delete contact error:', err);
      alert(`Failed to delete contact: ${err?.message || 'Unknown error'}`);
    }
  };
  
  const [showForm, setShowForm] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState('');
  const [newContactName, setNewContactName] = useState('');
  const [newContactEmail, setNewContactEmail] = useState('');
  const [newContactPhone, setNewContactPhone] = useState('');
  const [newContactTitle, setNewContactTitle] = useState('');
  const [page, setPage] = useState(1);

  // Build contacts list from all companies (newest first when dates exist)
  const allContacts = useMemo(() => {
    const rows: Array<{
      contact: any;
      companyId: string;
      companyName: string;
    }> = [];
    clients.forEach((company: any) => {
      if (company.contacts && Array.isArray(company.contacts)) {
        company.contacts.forEach((contact: any) => {
          rows.push({
            contact,
            companyId: company.id,
            companyName: company.name,
          });
        });
      }
    });
    rows.sort((a, b) => {
      const ta = new Date(
        a.contact.updatedAt || a.contact.createdAt || 0
      ).getTime();
      const tb = new Date(
        b.contact.updatedAt || b.contact.createdAt || 0
      ).getTime();
      if (tb !== ta) return tb - ta;
      return String(a.contact.name || '').localeCompare(String(b.contact.name || ''));
    });
    return rows;
  }, [clients]);

  const paged = useMemo(
    () => paginateItems(allContacts, page, DEFAULT_PAGE_SIZE),
    [allContacts, page]
  );

  useEffect(() => {
    setPage(1);
  }, [clients.length]);

  const handleAddContact = async () => {
    if (!selectedCompany || !newContactName) {
      alert('Company and contact name are required');
      return;
    }
    
    try {
      await addContactMutation.mutateAsync({
        clientId: selectedCompany,
        contactData: {
          name: newContactName,
          email: newContactEmail,
          phone: newContactPhone,
          title: newContactTitle,
          isPrimary: false,
        }
      });
      setShowForm(false);
      setSelectedCompany('');
      setNewContactName('');
      setNewContactEmail('');
      setNewContactPhone('');
      setNewContactTitle('');
      refetch();
      alert('Contact added successfully!');
    } catch (err: any) {
      console.error('Add contact error:', err);
      alert(`Failed to add contact: ${err?.message || 'Unknown error'}`);
    }
  };

  const handleViewContact = (companyId: string, contactId: string) => {
    router.push(`/dashboard/contacts/${contactId}?companyId=${companyId}`);
  };

  if (isLoading) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold">Contacts</h1>
            <p className="text-gray-500">Manage your business contacts</p>
          </div>
        </div>
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
          <span className="ml-3 text-muted-foreground">Loading contacts...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold">Contacts</h1>
            <p className="text-gray-500">Manage your business contacts</p>
          </div>
          <Button onClick={() => refetch()} variant="outline">
            <RefreshCw className="mr-2 h-4 w-4" /> Retry
          </Button>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
          <div className="text-red-600 text-xl font-semibold mb-2">Error Loading Contacts</div>
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
          <h1 className="text-3xl font-bold">Contacts</h1>
          <p className="text-gray-500">Manage your business contacts</p>
        </div>
        <Button onClick={() => setShowForm(!showForm)}>
          <Plus className="mr-2 h-5 w-5" /> {showForm ? 'Cancel' : 'New Contact'}
        </Button>
      </div>

      {/* New Contact Form */}
      {showForm && (
        <div className="bg-white border rounded-lg p-6 mb-6">
          <h3 className="text-lg font-semibold mb-4">Add New Contact</h3>
          <div className="grid gap-4 max-w-xl">
            <div>
              <label className="block text-sm font-medium mb-1">Company *</label>
              <SearchableSelect
                value={selectedCompany}
                onValueChange={setSelectedCompany}
                options={companyOptionsFromList(clients)}
                placeholder="Select a company…"
                searchPlaceholder="Search companies…"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Contact Name *</label>
              <input
                type="text"
                value={newContactName}
                onChange={(e) => setNewContactName(e.target.value)}
                className="w-full h-10 px-3 border rounded-md"
                placeholder="John Doe"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Email</label>
              <input
                type="email"
                value={newContactEmail}
                onChange={(e) => setNewContactEmail(e.target.value)}
                className="w-full h-10 px-3 border rounded-md"
                placeholder="john@example.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Phone</label>
              <input
                type="tel"
                value={newContactPhone}
                onChange={(e) => setNewContactPhone(e.target.value)}
                className="w-full h-10 px-3 border rounded-md"
                placeholder="(555) 123-4567"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Title</label>
              <input
                type="text"
                value={newContactTitle}
                onChange={(e) => setNewContactTitle(e.target.value)}
                className="w-full h-10 px-3 border rounded-md"
                placeholder="CEO, VP of Sales, etc."
              />
            </div>
            <div className="flex gap-3">
              <Button onClick={handleAddContact} disabled={addContactMutation.isPending}>
                {addContactMutation.isPending ? 'Adding...' : 'Add Contact'}
              </Button>
              <Button variant="outline" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Contacts Table */}
      {allContacts.length === 0 ? (
        <div className="bg-white border rounded-2xl p-12 text-center">
          <div className="text-4xl mb-6">👥</div>
          <h2 className="text-2xl font-semibold mb-3">No Contacts Yet</h2>
          <p className="text-gray-600 max-w-md mx-auto mb-6">
            Get started by adding contacts to your companies.
          </p>
          <Button onClick={() => setShowForm(true)}>
            <Plus className="mr-2 h-4 w-4" /> Add Your First Contact
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <PaginationBar
            page={paged.page}
            totalPages={paged.totalPages}
            total={paged.total}
            onPageChange={setPage}
            itemLabel={paged.total === 1 ? 'contact' : 'contacts'}
            className="rounded-xl border border-gray-100 bg-white px-3 py-2 shadow-sm"
          />
        <div className="bg-white border rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Contact</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Title</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Company</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Email</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Phone</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {paged.slice.map((item, idx) => (
                <tr key={`${item.companyId}-${item.contact.id}-${idx}`} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 bg-green-100 rounded-full flex items-center justify-center">
                        <User className="h-5 w-5 text-green-600" />
                      </div>
                      <div className="font-medium">{item.contact.name}</div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {item.contact.title || '-'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-gray-400" />
                      <span>{item.companyName}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {item.contact.email || '-'}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {item.contact.phones?.[0]?.number || item.contact.phone || '-'}
                  </td>
<td className="px-4 py-3">
                    <div className="flex gap-2">
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => handleViewContact(item.companyId, item.contact.id)}
                      >
                        View
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => router.push(`/dashboard/contacts/${item.contact.id}/edit?companyId=${item.companyId}`)}
                      >
                        Edit
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        className="text-red-600 hover:text-red-700"
                        onClick={() => handleDeleteContact(item.companyId, item.contact.id, item.contact.name)}
                      >
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </div>
      )}
    </div>
  );
}
