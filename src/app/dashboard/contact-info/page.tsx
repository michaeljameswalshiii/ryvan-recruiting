'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useClients } from '@/lib/hooks/query-client';
import { useAddContact, useRemoveContact } from '@/lib/hooks/contact-mutations';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
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

  const [newContact, setNewContact] = useState({ 
    name: '', 
    title: '', 
    email: '', 
    phone: '', 
    clientId: '' 
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
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-4xl font-bold">Contact Info</h1>
          <p className="text-muted-foreground">Total Contacts: {contacts.length}</p>
        </div>
      </div>

      {/* Simple Always-Visible Add Form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Add New Contact
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-5 gap-4 p-6">
          <div>
            <label className="text-sm font-medium mb-1 block">Company/Client ID</label>
            <Input 
              value={newContact.clientId}
              onChange={(e) => setNewContact({...newContact, clientId: e.target.value})}
              placeholder="company-id"
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Name</label>
            <Input 
              value={newContact.name}
              onChange={(e) => setNewContact({...newContact, name: e.target.value})}
              placeholder="Full Name"
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Title</label>
            <Input 
              value={newContact.title}
              onChange={(e) => setNewContact({...newContact, title: e.target.value})}
              placeholder="Job Title"
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Email</label>
            <Input 
              type="email"
              value={newContact.email}
              onChange={(e) => setNewContact({...newContact, email: e.target.value})}
              placeholder="email@example.com"
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Phone</label>
            <Input 
              type="tel"
              value={newContact.phone}
              onChange={(e) => setNewContact({...newContact, phone: e.target.value})}
              placeholder="(561) 662-..."
            />
          </div>

          <div className="md:col-span-5 flex justify-end gap-3 pt-4">
            <Button onClick={handleAdd} className="px-8">
              Add Contact
            </Button>
            <Button 
              variant="outline" 
              onClick={() => setNewContact({ name: '', title: '', email: '', phone: '', clientId: '' })}
            >
              Clear Form
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* All Contacts Table */}
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
