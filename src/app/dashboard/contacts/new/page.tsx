'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Search, Building2, User, Mail, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar } from '@/components/ui/avatar';
import { useClients } from '@/lib/hooks/query-client';
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
  
  // Step state
  const [step, setStep] = useState<'select-company' | 'contact-details'>('select-company');

  // Use TanStack Query hooks
  const { data: companies = [], isLoading } = useClients();

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

  // Handle go back
  const handleChangeCompany = () => {
    setStep('select-company');
  };

  // Handle submit - showing toast for now
  const handleSubmit = () => {
    toast.info('Company lookup coming soon. Use existing Add flow on Companies page.');
    router.push('/dashboard/contacts');
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="p-8 space-y-8">
        <div>
          <h1 className="text-3xl font-bold">Add Contact</h1>
          <p className="text-muted-foreground">Add a new contact to a company.</p>
        </div>
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-8">
      {/* HEADER */}
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/dashboard/contacts">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold">Add Contact</h1>
          <p className="text-muted-foreground">Company lookup coming soon - use existing flow on Companies page.</p>
        </div>
      </div>

      {/* Placeholder notice */}
      <Card>
        <CardContent className="p-6">
          <div className="text-center space-y-4">
            <Search className="h-12 w-12 mx-auto text-muted-foreground" />
            <h2 className="text-xl font-semibold">Company lookup coming soon</h2>
            <p className="text-muted-foreground max-w-md mx-auto">
              For now, please add contacts through the Companies page. 
              Navigate to a company and use the "Add Contact" button there.
            </p>
            <div className="flex justify-center gap-3 pt-4">
              <Button variant="outline" onClick={() => router.push('/dashboard/contacts')}>
                Back to Contacts
              </Button>
              <Button onClick={() => router.push('/dashboard/companies')}>
                Go to Companies
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Basic Contact Form (placeholder for now) */}
      {step === 'contact-details' && selectedCompany && (
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-4 mb-4 p-4 bg-muted/50 rounded-lg">
              <Avatar fallback={selectedCompany.name} className="h-12 w-12" />
              <div className="flex-1">
                <p className="font-medium text-lg">{selectedCompany.name}</p>
<p className="text-sm text-muted-foreground">{selectedCompany.location || 'No location'}</p>
              </div>
              <Button variant="outline" onClick={handleChangeCompany}>
                Change
              </Button>
            </div>

            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Name</Label>
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
            </div>

            {/* Action Buttons */}
            <div className="flex justify-end gap-3 mt-6">
              <Button variant="outline" onClick={() => router.push('/dashboard/contacts')}>
                Cancel
              </Button>
              <Button onClick={handleSubmit}>
                Add Contact
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
