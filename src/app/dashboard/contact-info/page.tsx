'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card, CardHeader, CardContent, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, RefreshCw } from 'lucide-react';
import { useClients, useAddContact, useUpdateContact, useRemoveContact } from '@/lib/hooks/query-client';
import { toast } from 'sonner';

export default function ContactInfoPage() {
  const { data: clients = [], isLoading, error, refetch } = useClients();
  const addContactMutation = useAddContact();
  const removeContactMutation = useRemoveContact();
  const updateContactMutation = useUpdateContact();

  // Build contacts list (stable)
  const allContacts = clients.flatMap((company: any) => 
    (company.contacts || []).map((contact: any) => ({
      contact,
      companyId: company.id,
      companyName: company.name
    }))
  );

  const sortedContacts = [...allContacts].sort((a, b) => {
    const aTime = a.contact.updatedAt || a.contact.createdAt || '';
    const bTime = b.contact.updatedAt || b.contact.createdAt || '';
    return bTime.localeCompare(aTime);
  });

  // Form states
  const [showForm, setShowForm] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState('');
  const [newContactName, setNewContactName] = useState('');
  const [newContactEmail, setNewContactEmail] = useState('');
  const [newContactPhone, setNewContactPhone] = useState('');
  const [newContactTitle, setNewContactTitle] = useState('');

  const [editingContact, setEditingContact] = useState<any>(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editTitle, setEditTitle] = useState('');

  const handleAddContact = async () => {
    if (!selectedCompany || !newContactName) {
      toast.error('Company and name are required');
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
        }
      });
      setShowForm(false);
      resetForm();
      toast.success('Contact added');
      refetch();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to add contact');
    }
  };

  const resetForm = () => {
    setNewContactName('');
    setNewContactEmail('');
    setNewContactPhone('');
    setNewContactTitle('');
    setSelectedCompany('');
  };

  if (isLoading) {
    return <div className="p-6">Loading contacts...</div>;
  }

  if (error) {
    return (
      <div className="p-6 text-center">
        <div className="text-red-600 mb-4">Error loading contacts</div>
        <Button onClick={() => refetch()}>Try Again</Button>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header and forms remain similar - I shortened for brevity */}
      {/* ... your existing UI ... */}

      <div className="text-center py-12 text-muted-foreground">
        {sortedContacts.length === 0 ? 'No contacts found. Add your first one!' : `${sortedContacts.length} contacts`}
      </div>
    </div>
  );
}
