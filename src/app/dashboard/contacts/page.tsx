'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { Search, Plus, RefreshCw, LayoutList, LayoutGrid, User, Mail, Phone, MoreHorizontal, Edit, Trash2 } from 'lucide-react';
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
import { toast } from 'sonner';

type ViewMode = 'list' | 'cards';

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
  const queryClient = useQueryClient();
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [searchQuery, setSearchQuery] = useState('');
  const [companyFilter, setCompanyFilter] = useState('');

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

  // Handle add contact click - show toast for now
  const handleAddContact = () => {
    toast.info('New add flow with company lookup coming soon!', {
      description: 'Navigate to /dashboard/contacts/new for the new contact form (coming soon)',
    });
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

  // Loading state
  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
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
      <div className="p-6 space-y-6">
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
    <div className="p-6 space-y-6">
      {/* HEADER - TITLE + TOGGLE + BUTTONS ON SAME LINE */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold">Contacts</h1>
          <p className="text-muted-foreground">Manage your professional contacts across companies.</p>
        </div>

        {/* Toggle in the middle */}
        <div className="flex justify-center lg:justify-start">
          <div className="inline-flex bg-muted rounded-lg p-1">
            <Button
              variant={viewMode === 'list' ? 'default' : 'ghost'}
              onClick={() => setViewMode('list')}
              className="px-8"
            >
              <LayoutList className="h-4 w-4 mr-2" />
              List
            </Button>
            <Button
              variant={viewMode === 'cards' ? 'default' : 'ghost'}
              onClick={() => setViewMode('cards')}
              className="px-8"
            >
              <LayoutGrid className="h-4 w-4 mr-2" />
              Cards
            </Button>
          </div>
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

      {/* Search and Filters */}
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

      {/* LIST VIEW */}
      {viewMode === 'list' && (
        <Card>
          <CardContent className="p-0">
            <div className="grid grid-cols-7 gap-4 px-4 py-3 bg-muted/50 text-sm font-medium text-muted-foreground border-b">
              <div className="col-span-2">CONTACT</div>
              <div className="hidden md:block">COMPANY</div>
              <div className="hidden lg:block">EMAIL</div>
              <div className="hidden lg:block">PHONE</div>
              <div className="text-center">PRIMARY</div>
              <div className="text-right">ACTIONS</div>
            </div>
            
            <div className="divide-y">
              {filteredContacts.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">
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
                </div>
              ) : (
                filteredContacts.map((contact) => (
                  <div
                    key={contact.id}
                    className="grid grid-cols-7 gap-4 px-4 py-3 items-center hover:bg-muted/50 transition-colors"
                  >
                    {/* Contact Column */}
                    <div className="col-span-2 flex items-center gap-3">
                      <Avatar
                        fallback={contact.name}
                        size="sm"
                        className="h-9 w-9"
                      />
                      <div className="min-w-0">
                        <p className="font-medium truncate">{contact.name}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {contact.title || "No title"}
                        </p>
                      </div>
                    </div>
                    
                    {/* Company */}
                    <div className="hidden md:block">
                      <Link 
                        href={`/dashboard/companies/${contact.companyId}`}
                        className="text-blue-400 hover:underline"
                      >
                        {contact.companyName}
                      </Link>
                    </div>
                    
                    {/* Email */}
                    <div className="hidden lg:block text-sm text-muted-foreground">
                      {contact.email || '-'}
                    </div>
                    
                    {/* Phone */}
                    <div className="hidden lg:block text-sm text-muted-foreground">
                      {contact.phone || '-'}
                    </div>
                    
                    {/* Primary Badge */}
                    <div className="text-center">
                      {contact.isPrimary ? (
                        <Badge variant="default" className="text-xs">
                          Primary
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-sm">-</span>
                      )}
                    </div>
                    
                    {/* Actions */}
                    <div className="text-right">
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
                  </div>
                ))
              )}
            </div>
            
            {/* Table Footer */}
            {filteredContacts.length > 0 && (
              <div className="px-4 py-2 bg-muted/30 text-xs text-muted-foreground border-t">
                Showing {filteredContacts.length} contacts
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* CARDS VIEW */}
      {viewMode === 'cards' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredContacts.length === 0 ? (
            <div className="col-span-full py-12 text-center text-muted-foreground">
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
            </div>
          ) : (
            filteredContacts.map((contact) => (
              <Card key={contact.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <Avatar
                      fallback={contact.name}
                      className="h-10 w-10"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className="font-medium truncate">{contact.name}</p>
                        {contact.isPrimary && (
                          <Badge variant="default" className="text-xs ml-2">
                            Primary
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground truncate">
                        {contact.title || "No title"}
                      </p>
                    </div>
                  </div>
                  
                  <div className="mt-3 space-y-1">
                    <Link 
                      href={`/dashboard/companies/${contact.companyId}`}
                      className="flex items-center gap-2 text-sm text-blue-400 hover:underline"
                    >
                      <span>{contact.companyName}</span>
                    </Link>
                  </div>
                  
                  <div className="mt-3 space-y-1 text-sm text-muted-foreground">
                    {contact.email && (
                      <div className="flex items-center gap-2">
                        <Mail className="h-3 w-3" />
                        <span className="truncate">{contact.email}</span>
                      </div>
                    )}
                    {contact.phone && (
                      <div className="flex items-center gap-2">
                        <Phone className="h-3 w-3" />
                        <span>{contact.phone}</span>
                      </div>
                    )}
                  </div>
                  
                  <div className="mt-3 pt-3 border-t flex justify-end gap-2">
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
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}
    </div>
  );
}
