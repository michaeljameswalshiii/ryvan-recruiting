'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useClients } from '@/lib/hooks/query-client';
import { useAddContact, useUpdateContact, useRemoveContact } from '@/lib/hooks/contact-mutations';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function ContactInfoPage() {
  const { data: clientsData, isLoading, error, refetch } = useClients();
  
  // Extract companies, then flatten their contacts
  const companies = Array.isArray(clientsData) 
    ? clientsData 
    : (clientsData?.clients || []);

  const contacts = companies.flatMap((company: any) => {
    const companyContacts = Array.isArray(company.contacts) ? company.contacts : [];
    return companyContacts.map((contact: any) => ({
      ...contact,
      clientId: company.id || company.PK,
      companyName: company.name || company.companyName || '—'
    }));
  });

  const addContact = useAddContact();
  const updateContact = useUpdateContact();
  const removeContact = useRemoveContact();

  const [newContact, setNewContact] = useState({ 
    name: '', title: '', email: '', phone: '', clientId: '' 
  });
  const [editingContact, setEditingContact] = useState<any>(null);

  const handleAdd = async () => {
    if (!newContact.clientId || !newContact.name) {
      alert('Client ID and Name are required');
      return;
    }
    await addContact.mutateAsync({ 
      clientId: newContact.clientId, 
      contactData: newContact 
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
  if (error) return (
    <div className="p-8 text-center">
      <p className="text-red-600">Error loading contacts</p>
      <Button onClick={() => refetch()}>Try Again</Button>
    </div>
  );

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-4xl font-bold">Contact Info</h1>
        <Button onClick={() => refetch()}>Refresh</Button>
      </div>

      <p className="mb-8 text-lg">Total Contacts: {contacts.length}</p>

      {/* Quick Add Form */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Add New Contact</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-6 gap-4">
          <div className="md:col-span-2">
            <Label>Company/Client ID</Label>
            <Input 
              value={newContact.clientId} 
              onChange={(e) => setNewContact({...newContact, clientId: e.target.value})} 
              placeholder="company-id-here" 
            />
          </div>
          <div>
            <Label>Name</Label>
            <Input value={newContact.name} onChange={(e) => setNewContact({...newContact, name: e.target.value})} />
          </div>
          <div>
            <Label>Title</Label>
            <Input value={newContact.title} onChange={(e) => setNewContact({...newContact, title: e.target.value})} />
          </div>
          <div>
            <Label>Email</Label>
            <Input value={newContact.email} onChange={(e) => setNewContact({...newContact, email: e.target.value})} />
          </div>
          <div>
            <Label>Phone</Label>
            <Input value={newContact.phone} onChange={(e) => setNewContact({...newContact, phone: e.target.value})} />
          </div>
          <div className="flex items-end">
            <Button onClick={handleAdd} className="w-full">Add Contact</Button>
          </div>
        </CardContent>
      </Card>

      {/* Contacts Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Contacts</CardTitle>
        </CardHeader>
        <CardContent>
          {contacts.length === 0 ? (
            <div className="text-center py-20 text-muted-foreground">
              No contacts found yet. Add one above.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-4">Name</th>
                    <th className="text-left p-4">Title</th>
                    <th className="text-left p-4">Email</th>
                    <th className="text-left p-4">Phone</th>
                    <th className="text-left p-4">Company</th>
                    <th className="p-4 w-32">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {contacts.map((contact: any) => (
                    <tr key={contact.id} className="border-b hover:bg-muted/50">
                      <td className="p-4 font-medium">
                        <Link href={`/dashboard/contact-info/${contact.id}`} className="hover:underline">
                          {contact.name}
                        </Link>
                      </td>
                      <td className="p-4">{contact.title || '—'}</td>
                      <td className="p-4">{contact.email || '—'}</td>
                      <td className="p-4">{contact.phone || '—'}</td>
                      <td className="p-4">{contact.companyName}</td>
                      <td className="p-4 space-x-2">
                        <Button variant="outline" size="sm" onClick={() => setEditingContact(contact)}>
                          Edit
                        </Button>
                        <Button 
                          variant="destructive" 
                          size="sm" 
                          onClick={() => handleDelete(contact.clientId, contact.id)}
                        >
                          Delete
                        </Button>
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
