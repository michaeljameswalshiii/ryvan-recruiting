'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card, CardHeader, CardContent, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, RefreshCw, Trash2, Edit, User, Mail, Phone, Building2, X } from 'lucide-react';
import { useClients, useAddContact, useUpdateContact, useRemoveContact } from '@/lib/hooks/query-client';
import { toast } from 'sonner';

export default function ContactInfoPage() {
  const { data: clients = [], isLoading, error, refetch } = useClients();
  const addContactMutation = useAddContact();
  const removeContactMutation = useRemoveContact();

  // Build contacts list from all companies
  const allContacts: Array<{contact: any; companyId: string; companyName: string}> = [];
  clients.forEach((company: any) => {
    if (company.contacts && Array.isArray(company.contacts)) {
      company.contacts.forEach((contact: any) => {
        allContacts.push({
          contact,
          companyId: company.id,
          companyName: company.name
        });
      });
    }
  });

  // Sort by last activity
  const sortedContacts = [...allContacts].sort((a, b) => {
    const aTime = a.contact.updatedAt || a.contact.createdAt || '';
    const bTime = b.contact.updatedAt || b.contact.createdAt || '';
    return bTime.localeCompare(aTime);
  });

  // New contact form state
  const [showForm, setShowForm] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState('');
  const [newContactName, setNewContactName] = useState('');
  const [newContactEmail, setNewContactEmail] = useState('');
  const [newContactPhone, setNewContactPhone] = useState('');
  const [newContactTitle, setNewContactTitle] = useState('');

  // Edit contact state
  const [editingContact, setEditingContact] = useState<{contact: any; companyId: string; companyName: string} | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editTitle, setEditTitle] = useState('');

  const updateContactMutation = useUpdateContact();

  const handleDeleteContact = async (companyId: string, contactId: string, contactName: string) => {
    if (!confirm(`Are you sure you want to delete ${contactName}? This action cannot be undone.`)) {
      return;
    }
    
    try {
      await removeContactMutation.mutateAsync({ clientId: companyId, contactId, contactName });
      toast.success('Contact deleted successfully');
      refetch();
    } catch (err: any) {
      console.error('Delete contact error:', err);
      toast.error(err?.message || 'Failed to delete contact');
    }
  };

  const handleAddContact = async () => {
    if (!selectedCompany || !newContactName) {
      toast.error('Company and contact name are required');
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
      toast.success('Contact added successfully');
      refetch();
    } catch (err: any) {
      console.error('Add contact error:', err);
      toast.error(err?.message || 'Failed to add contact');
    }
  };

  const handleEditContact = async () => {
    if (!editingContact || !editName) {
      toast.error('Contact name is required');
      return;
    }
    
    try {
      await updateContactMutation.mutateAsync({
        clientId: editingContact.companyId,
        contactId: editingContact.contact.id,
        contactData: {
          name: editName,
          email: editEmail,
          phone: editPhone,
          title: editTitle,
        }
      });
      setEditingContact(null);
      toast.success('Contact updated successfully');
      refetch();
    } catch (err: any) {
      console.error('Edit contact error:', err);
      toast.error(err?.message || 'Failed to update contact');
    }
  };

  const openEditForm = (item: {contact: any; companyId: string; companyName: string}) => {
    setEditingContact(item);
    setEditName(item.contact.name || '');
    setEditEmail(item.contact.email || '');
    setEditPhone(item.contact.phone || item.contact.phones?.[0]?.number || '');
    setEditTitle(item.contact.title || '');
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Contact Info</h1>
            <p className="text-muted-foreground mt-1">Loading contacts...</p>
          </div>
        </div>
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Contact Info</h1>
          <p className="text-muted-foreground mt-1">
            {sortedContacts.length} contacts • rolled up by person
          </p>
        </div>
        
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/dashboard/contacts">Go to Contacts</Link>
          </Button>
          <Button onClick={() => setShowForm(!showForm)}>
            <Plus className="mr-2 h-4 w-4" /> {showForm ? 'Cancel' : 'Add Contact'}
          </Button>
        </div>
      </div>

      {/* Add Contact Form */}
      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>Add New Contact</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 max-w-xl">
              <div>
                <label className="block text-sm font-medium mb-1">Company *</label>
                <select
                  value={selectedCompany}
                  onChange={(e) => setSelectedCompany(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <option value="">Select a company...</option>
                  {clients.map((company: any) => (
                    <option key={company.id} value={company.id}>
                      {company.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Contact Name *</label>
                <Input
                  type="text"
                  value={newContactName}
                  onChange={(e) => setNewContactName(e.target.value)}
                  placeholder="John Doe"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Email</label>
                <Input
                  type="email"
                  value={newContactEmail}
                  onChange={(e) => setNewContactEmail(e.target.value)}
                  placeholder="john@example.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Phone</label>
                <Input
                  type="tel"
                  value={newContactPhone}
                  onChange={(e) => setNewContactPhone(e.target.value)}
                  placeholder="(555) 123-4567"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Title</label>
                <Input
                  type="text"
                  value={newContactTitle}
                  onChange={(e) => setNewContactTitle(e.target.value)}
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
          </CardContent>
        </Card>
      )}

      {/* Edit Contact Form */}
      {editingContact && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Edit Contact: {editingContact.contact.name}</CardTitle>
            <Button variant="ghost" size="icon" onClick={() => setEditingContact(null)}>
              <X className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 max-w-xl">
              <div>
                <label className="block text-sm font-medium mb-1">Contact Name *</label>
                <Input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="John Doe"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Email</label>
                <Input
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  placeholder="john@example.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Phone</label>
                <Input
                  type="tel"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  placeholder="(555) 123-4567"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Title</label>
                <Input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  placeholder="CEO, VP of Sales, etc."
                />
              </div>
              <div className="flex gap-3">
                <Button onClick={handleEditContact} disabled={updateContactMutation.isPending}>
                  {updateContactMutation.isPending ? 'Saving...' : 'Save Changes'}
                </Button>
                <Button variant="outline" onClick={() => setEditingContact(null)}>
                  Cancel
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Contacts Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>All Contacts</CardTitle>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="mr-2 h-4 w-4" /> Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {error ? (
            <div className="text-center py-12">
              <div className="text-red-600 mb-4">Error loading contacts</div>
              <Button onClick={() => refetch()}>Try Again</Button>
            </div>
          ) : sortedContacts.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              No contacts found. Add your first contact!
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-3 font-medium">Name</th>
                    <th className="pb-3 font-medium">Email</th>
                    <th className="pb-3 font-medium">Phone</th>
                    <th className="pb-3 font-medium text-center">Notes</th>
                    <th className="pb-3 font-medium">Last Activity</th>
                    <th className="pb-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedContacts.map((item: any, index: number) => (
                    <tr key={item.contact.id || index} className="border-b hover:bg-muted/50">
<td className="py-3">
                        <Link 
                          href={`/dashboard/contacts/${item.contact.id}?companyId=${item.companyId}`}
                          className="flex items-center gap-3 hover:bg-muted/50 p-2 -m-2 rounded-lg transition-colors"
                        >
                          <div className="h-8 w-8 bg-green-100 rounded-full flex items-center justify-center">
                            <User className="h-4 w-4 text-green-600" />
                          </div>
                          <div>
                            <div className="font-medium hover:underline">{item.contact.name}</div>
                            <div className="text-sm text-muted-foreground">{item.companyName}</div>
                          </div>
                        </Link>
                      </td>
                      <td className="py-3">
                        {item.contact.email ? (
                          <a href={`mailto:${item.contact.email}`} className="hover:underline">
                            {item.contact.email}
                          </a>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="py-3">
                        {item.contact.phone || item.contact.phones?.[0]?.number ? (
                          <a href={`tel:${item.contact.phone || item.contact.phones?.[0]?.number}`} className="hover:underline">
                            {item.contact.phone || item.contact.phones?.[0]?.number}
                          </a>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="py-3 text-center">
                        {item.contact.notes ? (
                          <Badge variant="outline">{item.contact.notes.length}</Badge>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </td>
                      <td className="py-3 text-sm text-muted-foreground">
                        {item.contact.updatedAt || item.contact.createdAt ? 
                          new Date(item.contact.updatedAt || item.contact.createdAt).toLocaleDateString() 
                          : '—'}
                      </td>
                      <td className="py-3">
                        <div className="flex gap-2">
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => openEditForm(item)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            className="text-red-600 hover:text-red-700"
                            onClick={() => handleDeleteContact(item.companyId, item.contact.id, item.contact.name)}
                            disabled={removeContactMutation.isPending}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
