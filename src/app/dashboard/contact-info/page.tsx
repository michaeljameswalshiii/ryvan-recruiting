'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useClients } from '@/lib/hooks/query-client';
import { useAddContact, useRemoveContact } from '@/lib/hooks/contact-mutations';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Plus } from 'lucide-react';
import { getDisplayPhone } from '@/lib/contacts/phone';

export default function ContactInfoPage() {
  const { data: clientsData, isLoading, error, refetch } = useClients();

  const companies = Array.isArray(clientsData) ? clientsData : clientsData?.clients || [];

  const contacts = companies.flatMap((company: any) => {
    const companyContacts = Array.isArray(company.contacts) ? company.contacts : [];
    return companyContacts.map((contact: any) => ({
      ...contact,
      clientId: company.id || company.PK,
      companyName: company.name || company.companyName || '—',
    }));
  });

  const addContact = useAddContact();
  const removeContact = useRemoveContact();

  const [newContact, setNewContact] = useState({
    name: '',
    title: '',
    email: '',
    phone: '',
    clientId: '',
  });

  const handleAdd = async () => {
    if (!newContact.clientId || !newContact.name) {
      alert('Company and Name are required');
      return;
    }
    await addContact.mutateAsync({
      clientId: newContact.clientId,
      contactData: newContact,
    });
    setNewContact({ name: '', title: '', email: '', phone: '', clientId: '' });
    refetch();
  };

  const handleDelete = async (clientId: string, contactId: string) => {
    if (!confirm('Delete this contact?')) return;
    await removeContact.mutateAsync({ clientId, contactId });
    refetch();
  };

  if (isLoading) return <div className="p-8">Loading contacts...</div>;
  if (error)
    return (
      <div className="p-8 text-center">
        <p className="text-red-600">Error loading contacts</p>
        <Button onClick={() => refetch()}>Try Again</Button>
      </div>
    );

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-4xl font-bold">Contact Info</h1>
          <p className="text-muted-foreground">Total Contacts: {contacts.length}</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Add New Contact
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-5 gap-4 p-6">
          <div>
            <label className="text-sm font-medium mb-1 block">Company *</label>
            <select
              value={newContact.clientId}
              onChange={(e) => setNewContact({ ...newContact, clientId: e.target.value })}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">Select company...</option>
              {companies.map((company: any) => (
                <option key={company.id || company.PK} value={company.id || company.PK}>
                  {company.name || company.companyName || company.id}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Name *</label>
            <Input
              value={newContact.name}
              onChange={(e) => setNewContact({ ...newContact, name: e.target.value })}
              placeholder="Full Name"
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Title</label>
            <Input
              value={newContact.title}
              onChange={(e) => setNewContact({ ...newContact, title: e.target.value })}
              placeholder="Job Title"
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Email</label>
            <Input
              type="email"
              value={newContact.email}
              onChange={(e) => setNewContact({ ...newContact, email: e.target.value })}
              placeholder="email@example.com"
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Phone</label>
            <Input
              type="tel"
              value={newContact.phone}
              onChange={(e) => setNewContact({ ...newContact, phone: e.target.value })}
              placeholder="(555) 123-4567"
            />
          </div>

          <div className="md:col-span-5 flex justify-end gap-3 pt-4">
            <Button onClick={handleAdd} className="px-8" disabled={addContact.isPending}>
              {addContact.isPending ? 'Adding...' : 'Add Contact'}
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                setNewContact({ name: '', title: '', email: '', phone: '', clientId: '' })
              }
            >
              Clear Form
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>All Contacts</CardTitle>
        </CardHeader>
        <CardContent>
          {contacts.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              No contacts yet. Add one using the form above.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-3 font-medium">Name</th>
                    <th className="pb-3 font-medium">Company</th>
                    <th className="pb-3 font-medium">Email</th>
                    <th className="pb-3 font-medium">Phone</th>
                    <th className="pb-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {contacts.map((c: any) => {
                    const phone = getDisplayPhone(c);
                    return (
                      <tr key={c.id} className="border-b hover:bg-muted/40">
                        <td className="py-3">
                          <Link
                            href={`/dashboard/contact-info/${c.id}?companyId=${c.clientId}`}
                            className="font-medium text-blue-600 hover:underline"
                          >
                            {c.name}
                          </Link>
                          {c.title ? (
                            <div className="text-sm text-muted-foreground">{c.title}</div>
                          ) : null}
                        </td>
                        <td className="py-3">{c.companyName}</td>
                        <td className="py-3">
                          {c.email ? (
                            <a href={`mailto:${c.email}`} className="hover:underline">
                              {c.email}
                            </a>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="py-3">
                          {phone ? (
                            <a href={`tel:${phone}`} className="hover:underline">
                              {phone}
                            </a>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="py-3">
                          <div className="flex gap-2">
                            <Button asChild variant="outline" size="sm">
                              <Link href={`/dashboard/contact-info/${c.id}?companyId=${c.clientId}`}>
                                View
                              </Link>
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-red-600"
                              onClick={() => handleDelete(c.clientId, c.id)}
                              disabled={removeContact.isPending}
                            >
                              Delete
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
