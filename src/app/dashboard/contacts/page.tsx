/**
 * Contacts Page
 * Shows all contacts across all companies with search and filtering
 */

"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { Building2, User, Mail, Phone, Star, Edit2, Trash2, Search, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { SimpleDialog } from "@/components/ui/simple-dialog";
import ContactModal from "@/components/company/ContactModal";
import { useClients, useRemoveContact, clientKeys } from "@/lib/hooks/query-client";
import { toast } from "sonner";

interface Contact {
  id: string;
  name: string;
  title?: string;
  email?: string;
  phone?: string;
  isPrimary?: boolean;
  notes?: string;
}

export default function ContactsPage() {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCompany, setSelectedCompany] = useState<string | null>(null);
  const [deletingContact, setDeletingContact] = useState<{ contact: Contact; companyId: string; companyName: string } | null>(null);

  // Modal state for add/edit contact
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | undefined>(undefined);
  const [selectedClientId, setSelectedClientId] = useState<string>("");

  // Fetch all clients
  const { data: clients = [], isLoading, error } = useClients();
  const removeContactMutation = useRemoveContact();

  // Extract all contacts from all companies
  const allContacts: Array<{
    contact: Contact;
    companyId: string;
    companyName: string;
  }> = [];

  clients.forEach((client: any) => {
    if (client.contacts && client.contacts.length > 0) {
      client.contacts.forEach((contact: Contact) => {
        allContacts.push({
          contact,
          companyId: client.id,
          companyName: client.name || "Unknown Company",
        });
      });
    }
  });

  // Filter contacts
  const filteredContacts = allContacts.filter((item) => {
    const matchesSearch = !searchQuery || 
      item.contact.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.contact.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.contact.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.companyName.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesCompany = !selectedCompany || item.companyId === selectedCompany;
    
    return matchesSearch && matchesCompany;
  });

  // Sort: primary contacts first, then by name
  filteredContacts.sort((a, b) => {
    if (a.contact.isPrimary && !b.contact.isPrimary) return -1;
    if (!a.contact.isPrimary && b.contact.isPrimary) return 1;
    return (a.contact.name || "").localeCompare(b.contact.name || "");
  });

  const handleDelete = async () => {
    if (!deletingContact) return;
    
    try {
      await removeContactMutation.mutateAsync({
        clientId: deletingContact.companyId,
        contactId: deletingContact.contact.id,
        contactName: deletingContact.contact.name,
      });
      toast.success("Contact removed");
      setDeletingContact(null);
    } catch (err: any) {
      toast.error(err.message || "Failed to remove contact");
    }
  };

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: clientKeys.lists() });
  };

  // Open modal for adding new contact - with optional company selection
  const handleAddContact = (clientId?: string) => {
    // Get all companies (not just those with contacts) for adding new contacts
    const allCompanies = clients.filter((c: any) => c.id);
    
    if (clientId) {
      setSelectedClientId(clientId);
    } else if (allCompanies.length === 0) {
      toast.error("No companies available to add contacts");
      return;
    } else if (allCompanies.length === 1) {
      // Only one company - use it automatically
      setSelectedClientId(allCompanies[0].id);
    } else {
      // Multiple companies - show company selection prompt
      const companySelect = window.prompt(
        "Enter the number of the company to add this contact to:\n\n" +
        allCompanies.map((c: any, i: number) => `${i + 1}. ${c.name}`).join("\n")
      );
      
      const companyIndex = parseInt(companySelect || "") - 1;
      if (companyIndex >= 0 && companyIndex < allCompanies.length) {
        setSelectedClientId(allCompanies[companyIndex].id);
      } else {
        toast.error("Invalid company selection");
        return;
      }
    }
    setEditingContact(undefined);
    setIsModalOpen(true);
  };

  // Open modal for editing existing contact
  const handleEditContact = (contact: Contact, companyId: string) => {
    setSelectedClientId(companyId);
    setEditingContact(contact);
    setIsModalOpen(true);
  };

  // Handle modal save (refresh data)
  const handleModalSave = () => {
    queryClient.invalidateQueries({ queryKey: clientKeys.lists() });
  };

  // Get unique companies for filter
  const companies = [...new Map(
    clients
      .filter((c: any) => c.contacts?.length > 0)
      .map((c: any) => [c.id, { id: c.id, name: c.name }])
  ).values()];

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Contacts</h1>
          <p className="text-muted-foreground">Manage all contacts across companies.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="p-4 rounded-lg border">
              <Skeleton className="h-5 w-32 mb-2" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-40 mt-2" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Contacts</h1>
          <p className="text-muted-foreground">Manage all contacts across companies.</p>
        </div>
        <div className="p-4 rounded-lg bg-destructive/10 text-destructive">
          Failed to load contacts. Please try again.
          <br />
          <span className="text-xs">Error: {error?.message}</span>
          <Button variant="outline" onClick={handleRefresh} className="ml-4">
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Contacts</h1>
          <p className="text-muted-foreground">
            Manage all contacts across companies.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="default" onClick={() => handleAddContact()}>
            <Plus className="h-4 w-4 mr-2" />
            Add Contact
          </Button>
          <Button variant="outline" onClick={handleRefresh}>
            Refresh
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="flex gap-4 text-sm">
        <Badge variant="outline" className="px-3 py-1">
          Total Contacts: {allContacts.length}
        </Badge>
        <Badge variant="outline" className="px-3 py-1">
          With Companies: {companies.length}
        </Badge>
      </div>

      {/* Search and Filter */}
      <div className="flex gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search contacts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <select
          value={selectedCompany || ""}
          onChange={(e) => setSelectedCompany(e.target.value || null)}
          className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="">All Companies</option>
          {companies.map((company: any) => (
            <option key={company.id} value={company.id}>
              {company.name}
            </option>
          ))}
        </select>
      </div>

      {/* Contacts Grid */}
      {filteredContacts.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredContacts.map((item) => (
            <div
              key={`${item.companyId}-${item.contact.id}`}
              className="p-4 rounded-lg border border-border bg-card"
            >
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <User className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="font-medium">{item.contact.name}</h4>
                    {item.contact.isPrimary && (
                      <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 text-xs">
                        <Star className="h-3 w-3 mr-1" />
                        Primary
                      </Badge>
                    )}
                  </div>
                  {item.contact.title && (
                    <p className="text-sm text-muted-foreground">{item.contact.title}</p>
                  )}
                  <Link
                    href={`/dashboard/companies?id=${item.companyId}`}
                    className="text-sm text-primary hover:underline flex items-center gap-1 mt-1"
                  >
                    <Building2 className="h-3 w-3" />
                    {item.companyName}
                  </Link>
                  
                  <div className="flex flex-wrap gap-2 mt-2">
                    {item.contact.email && (
                      <a 
                        href={`mailto:${item.contact.email}`}
                        className="flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        <Mail className="h-3 w-3" />
                        {item.contact.email}
                      </a>
                    )}
                    {item.contact.phone && (
                      <a 
                        href={`tel:${item.contact.phone}`}
                        className="flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        <Phone className="h-3 w-3" />
                        {item.contact.phone}
                      </a>
                    )}
                  </div>

                  {/* Notes preview */}
                  {item.contact.notes && (
                    <p className="mt-2 text-xs text-muted-foreground line-clamp-2">
                      {item.contact.notes}
                    </p>
                  )}

                  {/* Action buttons */}
                  <div className="flex gap-2 mt-3 pt-3 border-t border-border">
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => handleEditContact(item.contact, item.companyId)}
                      className="h-7 px-2 text-xs"
                    >
                      <Edit2 className="h-3 w-3 mr-1" />
                      Edit
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => setDeletingContact(item)}
                      className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-3 w-3 mr-1" />
                      Delete
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 text-muted-foreground border border-dashed rounded-lg">
          <User className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>No contacts found</p>
          {searchQuery ? (
            <p className="text-sm mt-1">Try adjusting your search</p>
          ) : (
            <div className="mt-4">
              <p className="text-sm text-muted-foreground mb-4">
                {clients.length === 0 
                  ? "Get started by adding a company first"
                  : "Add your first contact to get started"}
              </p>
              {clients.length > 0 && (
                <Button variant="default" onClick={() => handleAddContact()}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Contact
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingContact && (
        <SimpleDialog
          open={!!deletingContact}
          onOpenChange={() => setDeletingContact(null)}
          title="Delete Contact"
          description={`Are you sure you want to delete ${deletingContact.contact.name}? This action cannot be undone.`}
          footer={
            <>
              <Button variant="outline" onClick={() => setDeletingContact(null)} disabled={removeContactMutation.isPending}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleDelete} disabled={removeContactMutation.isPending}>
                {removeContactMutation.isPending ? "Deleting..." : "Delete"}
              </Button>
            </>
          }
        />
      )}

      {/* Add/Edit Contact Modal */}
      <ContactModal
        clientId={selectedClientId}
        contact={editingContact}
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        onSave={handleModalSave}
      />
    </div>
  );
}
