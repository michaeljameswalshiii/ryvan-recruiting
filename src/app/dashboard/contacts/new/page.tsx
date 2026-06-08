'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Plus, Search, Building2, User, Mail, Phone, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { SimpleDialog } from '@/components/ui/simple-dialog';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar } from '@/components/ui/avatar';
import {
  useClients,
  useAddContact,
} from '@/lib/hooks/query-client';
import { toast } from 'sonner';

export default function NewContactPage() {
  const router = useRouter();
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Contact form state
  const [contactName, setContactName] = useState('');
  const [contactTitle, setContactTitle] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactIsPrimary, setContactIsPrimary] = useState(false);
  const [contactNotes, setContactNotes] = useState('');
  
  // Step state: 'select-company' | 'contact-details'
  const [step, setStep] = useState<'select-company' | 'contact-details'>('select-company');

  // Use TanStack Query hooks
  const { data: companies = [], isLoading } = useClients();
  const addContactMutation = useAddContact();

  // Filter companies based on search
  const filteredCompanies = companies.filter((company: any) => {
    if (!searchQuery) return true;
    return company.name?.toLowerCase().includes(searchQuery.toLowerCase());
  });

  // Get selected company data
  const selectedCompany = companies.find((c: any) => c.id === selectedCompanyId);

  // Handle company selection
  const handleSelectCompany = (companyId: string) => {
    setSelectedCompanyId(companyId);
    setStep('contact-details');
  };

  // Handle go back to company selection
  const handleChangeCompany = () => {
    setStep('select-company');
  };

  // Handle add contact
  const handleAddContact = async () => {
    if (!selectedCompanyId || !contactName) {
      toast.error('Please fill in required fields');
      return;
    }

    try {
      await addContactMutation.mutateAsync({
        clientId: selectedCompanyId,
        contactData: {
          name: contactName,
          title: contactTitle,
          email: contactEmail,
          phone: contactPhone,
          isPrimary: contactIsPrimary,
          notes: contactNotes,
        },
      });

      toast.success('Contact added successfully');
      router.push('/dashboard/contacts');
    } catch (err: any) {
      toast.error('Failed to add contact', {
        description: err instanceof Error ? err.message : 'Please try again',
      });
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Add Contact</h1>
          <p className="text-muted-foreground">Add a new contact to a company.</p>
        </div>
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* HEADER */}
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/dashboard/contacts">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold">Add Contact</h1>
          <p className="text-muted-foreground">Add a new contact to a company.</p>
        </div>
      </div>

      {/* Step Indicator */}
      <div className="flex items-center gap-4 mb-6">
        <div className={`flex items-center gap-2 ${step === 'select-company' ? 'text-primary' : 'text-muted-foreground'}`}>
          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step === 'select-company' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
            1
          </div>
          <span className="font-medium">Select Company</span>
        </div>
        <div className="flex-1 h-px bg-border" />
        <div className={`flex items-center gap-2 ${step === 'contact-details' ? 'text-primary' : 'text-muted-foreground'}`}>
          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step === 'contact-details' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
            2
          </div>
          <span className="font-medium">Contact Details</span>
        </div>
      </div>

      {/* STEP 1: SELECT COMPANY */}
      {step === 'select-company' && (
        <>
          {/* Search */}
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search companies..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Company List */}
          <Card>
            <CardContent className="p-0">
              <div className="divide-y">
                {filteredCompanies.length === 0 ? (
                  <div className="py-12 text-center text-muted-foreground">
                    <Building2 className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>No companies found</p>
                  </div>
                ) : (
                  filteredCompanies.map((company: any) => (
                    <button
                      key={company.id}
                      onClick={() => handleSelectCompany(company.id)}
                      className="w-full flex items-center gap-4 px-4 py-4 hover:bg-muted/50 transition-colors text-left"
                    >
                      <Avatar
                        fallback={company.name}
                        className="h-10 w-10"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{company.name}</p>
                        <p className="text-sm text-muted-foreground truncate">
                          {company.location || 'No location'} • {company.industry || 'No industry'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {company.contacts?.length > 0 && (
                          <Badge variant="secondary" className="text-xs">
                            {company.contacts.length} contacts
                          </Badge>
                        )}
                        <Plus className="h-5 w-5 text-muted-foreground" />
                      </div>
                    </button>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* STEP 2: CONTACT DETAILS */}
      {step === 'contact-details' && selectedCompany && (
        <>
          {/* Selected Company Card */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-4">
                <Avatar
                  fallback={selectedCompany.name}
                  className="h-12 w-12"
                />
                <div className="flex-1">
                  <p className="font-medium text-lg">{selectedCompany.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {selectedCompany.location || 'No location'}
                  </p>
                </div>
                <Button variant="outline" onClick={handleChangeCompany}>
                  Change
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Contact Form */}
          <Card>
            <CardContent className="p-6">
              <div className="grid gap-6">
                <div className="grid gap-2">
                  <Label htmlFor="name">Name *</Label>
                  <Input
                    id="name"
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    placeholder="John Smith"
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="title">Title</Label>
                  <Input
                    id="title"
                    value={contactTitle}
                    onChange={(e) => setContactTitle(e.target.value)}
                    placeholder="VP of Sales"
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    placeholder="john@company.com"
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    value={contactPhone}
                    onChange={(e) => setContactPhone(e.target.value)}
                    placeholder="(555) 123-4567"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <input
                    id="isPrimary"
                    type="checkbox"
                    checked={contactIsPrimary}
                    onChange={(e) => setContactIsPrimary(e.target.checked)}
                    className="w-4 h-4"
                  />
                  <Label htmlFor="isPrimary" className="font-normal">
                    Primary contact for this company
                  </Label>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea
                    id="notes"
                    value={contactNotes}
                    onChange={(e) => setContactNotes(e.target.value)}
                    placeholder="Additional notes about this contact..."
                    rows={3}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Action Buttons */}
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => router.push('/dashboard/contacts')}>
              Cancel
            </Button>
            <Button 
              onClick={handleAddContact} 
              disabled={!contactName || addContactMutation.isPending}
            >
              {addContactMutation.isPending ? 'Adding...' : 'Add Contact'}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
