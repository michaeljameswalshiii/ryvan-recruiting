'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useClients } from '@/lib/hooks/query-client';
import { useAddContact, useRemoveContact } from '@/lib/hooks/contact-mutations';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus } from 'lucide-react';

export default function ContactInfoPage() {
  const { data: clientsData, isLoading, error, refetch } = useClients();
  
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
  const removeContact = useRemoveContact();

  const [showAddForm, setShowAddForm] = useState(false);
  const [newContact, setNewContact] = useState({ 
    name: '', title: '', email: '', phone: '', clientId: '' 
  });

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
    setShowAddForm(false);
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
        <div>
          <h1 className="text-4xl font-bold">Contact Info</h1>
          <p className="text-muted-foreground">Total Contacts: {contacts.length}</p>
        </div>
        
        <Button onClick={() => setShowAddForm(!showAddForm)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Contact
        </Button>
      </div>

      {/* Add Form (toggleable) */}
      {showAddForm && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Add New Contact</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div>
              <label className="text-sm">Company/Client ID</label>
              <input 
                type="text"
                value={newContact.clientId}
                onChange={(e) => setNewContact({...newContact, clientId: e.target.value})}
                className="w-full border rounded p-2"
                placeholder="company-id"
              />
            </div>
            <div>
              <label className="text-sm">Name</label>
              <input 
                type="text"
                value={newContact.name}
                onChange={(e) => setNewContact({...newContact, name: e.target.value})}
                className="w-full border rounded p-2"
              />
            </div>
            <div>
              <label className="text-sm">Title</label>
              <input 
                type="text"
                value={newContact.title}
                onChange={(e) => setNewContact({...newContact, title: e.target.value})}
                className="w-full border rounded p-2"
              />
            </div>
            <div>
              <label className="text-sm">Email</label>
              <input 
                type="email"
                value={newContact.email}
                onChange={(e) => setNewContact({...newContact, email: e.target.value})}
                className="w-full border rounded p-2"
              />
            </div>
            <div>
              <label className="text-sm">Phone</label>
              <input 
                type="tel"
                value={newContact.phone}
                onChange={(e) => setNewContact({...newContact, phone: e.target.value})}
                className="w-full border rounded p-2"
              />
            </div>
            <div className="md:col-span-5 flex gap-3">
              <Button onClick={handleAdd}>Add Contact</Button>
              <Button variant="outline" onClick={() => setShowAddForm(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Contacts Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Contacts</CardTitle>
        </CardHeader>
        <CardContent>
          {contacts.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              No contacts yet. Click "Add Contact" above.
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
                      <td className="p-4 text-muted-foreground">{contact.title || '—'}</td>
                      <td className="p-4 text-muted-foreground">{contact.email || '—'}</td>
                      <td className="p-4 text-muted-foreground">{contact.phone || '—'}</td>
                      <td className="p-4 text-muted-foreground">{contact.companyName}</td>
                      <td className="p-4 space-x-2">
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
