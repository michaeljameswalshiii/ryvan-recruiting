'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Search, Plus, RefreshCw, User, Mail, Phone, Edit2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar } from '@/components/ui/avatar';
import {
  useClients,
  useRemoveContact,
  clientKeys
} from '@/lib/hooks/query-client';
import { SendEmailModal } from '@/components/email/send-email-modal';
import { toast } from 'sonner';

interface Contact {
  id: string;
  name: string;
  title?: string;
  email?: string;
  phone?: string;
  isPrimary?: boolean;
  notes?: string;
  companyId: string;
  companyName: string;
}

export default function ContactsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [companyFilter, setCompanyFilter] = useState('');
  
  // Send Email Modal state
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [selectedContact, setSelectedContact] = useState<{
    id: string;
    name: string;
    email: string;
    companyId: string;
    companyName: string;
  } | null>(null);

  // Use TanStack Query hooks
  const { data: clients = [], isLoading, error, refetch } = useClients();
  const removeContactMutation = useRemoveContact();

  // Flatten all contacts from all companies
  const allContacts: Contact[] = useMemo(() => {
    const contacts: Contact[] = [];
    clients.forEach((client: any) => {
      if (client.contacts && Array.isArray(client.contacts)) {
        client.contacts.forEach((contact: any) => {
          contacts.push({
            id: contact.id,
            name: contact.name || '',
            title: contact.title || '',
            email: contact.email || '',
            phone: contact.phone || '',
            isPrimary: contact.isPrimary || false,
            notes: contact.notes || '',
            companyId: client.id,
            companyName: client.name || 'Unknown Company',
          });
        });
      }
    });
    return contacts;
  }, [clients]);

  // Get unique companies for filter dropdown
  const uniqueCompanies = useMemo(() => {
    const companies = new Map();
    clients.forEach((client: any) => {
      if (client.name) {
        companies.set(client.id, client.name);
      }
    });
    return Array.from(companies.entries()).map(([id, name]) => ({ id, name }));
  }, [clients]);

  // Filter contacts based on search and company filter
  const filteredContacts = useMemo(() => {
    return allContacts.filter((contact) => {
      const matchesSearch = !searchQuery || 
        contact.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        contact.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        contact.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        contact.companyName?.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesCompany = !companyFilter || contact.companyId === companyFilter;
      
      return matchesSearch && matchesCompany;
    });
  }, [allContacts, searchQuery, companyFilter]);

  // Get stats
  const totalContacts = allContacts.length;
  const primaryContacts = allContacts.filter(c => c.isPrimary).length;

  // Handle refresh
  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: clientKeys.lists() });
    refetch();
    toast.success('Contacts refreshed');
  };

// Handle add contact click
  const handleAddContact = () => {
    router.push('/dashboard/contacts/new');
  };

// Handle delete contact
  const handleDeleteContact = async (companyId: string, contactId: string, contactName: string) => {
    if (!confirm(`Are you sure you want to remove ${contactName}?`)) return;
    
    try {
      await removeContactMutation.mutateAsync({
        clientId: companyId,
        contactId,
        contactName,
      });
      toast.success(`${contactName} removed successfully`);
    } catch (err: any) {
      toast.error('Failed to remove contact', {
        description: err instanceof Error ? err.message : 'Please try again',
      });
    }
  };

  // Handle send email click
  const handleEmailClick = (contact: Contact) => {
    setSelectedContact({
      id: contact.id,
      name: contact.name,
      email: contact.email || '',
      companyId: contact.companyId,
      companyName: contact.companyName,
    });
    setEmailModalOpen(true);
  };

  // Handle send email with tracking
  const handleSendEmail = async (subject: string, body: string) => {
    if (!selectedContact) return;
    
    try {
      // Log the activity to the company's activity timeline
      const response = await fetch(`/api/company/${selectedContact.companyId}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventType: 'EMAIL_SENT',
          title: 'Email Sent',
          description: `Email sent to ${selectedContact.name} (${selectedContact.email}) - Subject: ${subject}`,
          metadata: {
            subject,
            body,
            contactId: selectedContact.id,
            contactEmail: selectedContact.email,
          }
        })
      });
      
      if (!response.ok) {
        console.error('Failed to log email event');
      }
      
      toast.success(`Email sent to ${selectedContact.email}`);
    } catch (err) {
      console.error('Error logging email event:', err);
      // Still show success since email was sent
      toast.success(`Email sent to ${selectedContact.email}`);
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="p-8 space-y-8">
        <div>
          <h1 className="text-3xl font-bold">Contacts</h1>
          <p className="text-muted-foreground">Manage your professional contacts across companies.</p>
        </div>
        <div className="text-muted-foreground">Loading contacts...</div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="p-8 space-y-8">
        <div>
          <h1 className="text-3xl font-bold">Contacts</h1>
          <p className="text-muted-foreground">Manage your professional contacts across companies.</p>
        </div>
        <div className="p-4 rounded-md bg-destructive/10 text-destructive">
          Failed to load contacts. Please try again.
          <Button variant="outline" onClick={handleRefresh} className="ml-4">
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-8">
      {/* HEADER */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold">Contacts</h1>
          <p className="text-muted-foreground">Manage your professional contacts across companies.</p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={handleRefresh}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
<Button onClick={handleAddContact}>
            <Plus className="h-4 w-4 mr-2" />
            Add Contact
          </Button>
        </div>
      </div>

      {/* Stats Pills */}
      <div className="flex flex-wrap gap-2">
        <div className="bg-card border border-border rounded-lg px-4 py-2 text-sm">
          <span className="text-muted-foreground">Total Contacts:</span>{' '}
          <span className="font-semibold">{totalContacts}</span>
        </div>
        <div className="bg-card border border-border rounded-lg px-4 py-2 text-sm">
          <span className="text-muted-foreground">Primary:</span>{' '}
          <span className="font-semibold">{primaryContacts}</span>
        </div>
      </div>

      {/* Search and Filter on same row */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search contacts by name, email, title, or company..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <select
          value={companyFilter}
          onChange={(e) => setCompanyFilter(e.target.value)}
          className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="">All Companies</option>
          {uniqueCompanies.map((company: any) => (
            <option key={company.id} value={company.id}>
              {company.name}
            </option>
          ))}
        </select>
      </div>

      {/* LIST VIEW - Clean HTML Table */}
      <Card>
        <CardContent className="p-0">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-muted/50 text-sm font-medium text-muted-foreground">
                <th className="text-left p-4">CONTACT</th>
                <th className="text-left p-4">TITLE</th>
                <th className="text-left p-4">COMPANY</th>
                <th className="text-left p-4">CONTACT INFO</th>
                <th className="text-left p-4">ACTIONS</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredContacts.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-12 text-center text-muted-foreground">
                    <User className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>No contacts found</p>
                    {(searchQuery || companyFilter) && (
                      <Button 
                        variant="link" 
                        onClick={() => {
                          setSearchQuery('');
                          setCompanyFilter('');
                        }}
                        className="mt-2"
                      >
                        Clear filters
                      </Button>
                    )}
                  </td>
                </tr>
              ) : (
                filteredContacts.map((contact) => (
                  <tr key={contact.id} className="hover:bg-muted/50 transition-colors">
                    {/* CONTACT */}
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <Avatar fallback={contact.name} size="sm" className="h-9 w-9" />
                        <div className="min-w-0">
                          <p className="font-medium truncate">{contact.name}</p>
                          {contact.isPrimary && (
                            <Badge variant="default" className="text-xs mt-1">Primary</Badge>
                          )}
                        </div>
                      </div>
                    </td>
                    
                    {/* TITLE */}
                    <td className="p-4 text-muted-foreground">
                      {contact.title || '-'}
                    </td>
                    
                    {/* COMPANY */}
                    <td className="p-4">
                      <Link 
                        href={`/dashboard/companies/${contact.companyId}`}
                        className="text-blue-400 hover:underline"
                      >
                        {contact.companyName}
                      </Link>
                    </td>
                    
{/* CONTACT INFO */}
                    <td className="p-4">
                      <div className="space-y-1 text-sm">
                        {contact.email && (
                          <button
                            onClick={() => handleEmailClick(contact)}
                            className="flex items-center gap-2 text-blue-400 hover:text-blue-600 hover:underline cursor-pointer transition-colors"
                            title="Click to send email"
                          >
                            <Mail className="h-3 w-3" />
                            <span className="truncate">{contact.email}</span>
                          </button>
                        )}
                        {contact.phone && (
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Phone className="h-3 w-3" />
                            <span>{contact.phone}</span>
                          </div>
                        )}
                        {!contact.email && !contact.phone && (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </div>
                    </td>
                    
{/* ACTIONS */}
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => router.push(`/dashboard/companies/${contact.companyId}?contactId=${contact.id}`)}
                          className="h-8 w-8 text-muted-foreground hover:text-primary"
                          title="Edit contact"
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteContact(contact.companyId, contact.id, contact.name)}
                          disabled={removeContactMutation.isPending}
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          
          {/* Table Footer */}
          {filteredContacts.length > 0 && (
            <div className="px-4 py-2 bg-muted/30 text-xs text-muted-foreground border-t">
              Showing {filteredContacts.length} contacts
            </div>
          )}
</CardContent>
      </Card>

      {/* Send Email Modal */}
      <SendEmailModal
        open={emailModalOpen}
        onOpenChange={setEmailModalOpen}
        candidate={selectedContact ? {
          email: selectedContact.email,
          name: selectedContact.name,
        } : null}
        onSend={handleSendEmail}
      />
    </div>
  );
}
