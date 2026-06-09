/**
 * Company Detail Page
 * Shows company info with tabs: Overview, History, Jobs, Contacts, Notes
 */

"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useClient } from "@/lib/hooks/query-client";
import { useLeads } from "@/lib/hooks/query-lead";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ContactModal } from "@/components/company";
import { useRemoveContact } from "@/lib/hooks/query-client";
import { Building2, MapPin, Users, Globe, Linkedin, Mail, Phone, ArrowLeft, FileText, Clock, Briefcase, User, StickyNote, Plus, Star, Edit2, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";

// Dynamic import for EventTimeline to avoid SSR issues
const CompanyEventTimeline = dynamic(() => 
  import("@/components/company/EventTimeline").then(mod => mod.CompanyEventTimeline), 
  { ssr: false, loading: () => <div>Loading timeline...</div> }
);

// Tab configuration
const tabs = [
  { id: "overview", label: "Overview", icon: Building2 },
  { id: "history", label: "Timeline", icon: Clock },
  { id: "jobs", label: "Jobs", icon: Briefcase },
  { id: "contacts", label: "Contacts", icon: User },
];

export default function CompanyDetailPage() {
  const params = useParams();
  const router = useRouter();
  const clientId = params.id as string;
  
  // Guard: Redirect "new" to the proper new company page
  if (clientId === 'new') {
    router.replace('/dashboard/companies/new');
    return (
      <div className="p-8">
        <div className="animate-pulse">Redirecting...</div>
      </div>
    );
  }
  
  const [activeTab, setActiveTab] = useState("overview");
  
  // Fetch company data
  const { data: company, isLoading, error } = useClient(clientId);
  const { data: allLeads = [] } = useLeads();
  
  // Filter leads for this company
  const companyLeads = allLeads.filter((lead: any) => 
    lead.company?.toLowerCase() === company?.name?.toLowerCase()
  );

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <div>
            <Skeleton className="h-8 w-48 mb-2" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-10 w-24" />
          ))}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

// Error state
  if (error || !company) {
    const errorMessage = error?.message || "The company you're looking for doesn't exist or has been deleted.";
    
    // Log detailed error for debugging
    console.error('[CompanyDetailPage] Error loading company:', { clientId, error: error?.message });
    
    return (
      <div className="space-y-6">
        <Link href="/dashboard/companies">
          <Button variant="ghost" className="mb-4">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Companies
          </Button>
        </Link>
        <div className="p-6 rounded-lg border border-destructive/50 bg-destructive/10">
          <h2 className="text-lg font-semibold text-destructive">Company Not Found</h2>
          <p className="text-muted-foreground mt-1">
            {errorMessage}
          </p>
          {error?.message && (
            <p className="text-xs text-muted-foreground mt-2">
              Error details: {error.message}
            </p>
          )}
          <div className="flex gap-2 mt-4">
            <Button 
              onClick={() => router.push("/dashboard/companies")}
            >
              Return to Companies
            </Button>
            <Button 
              variant="outline"
              onClick={() => window.location.reload()}
            >
              Try Again
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/companies">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="h-14 w-14 rounded-lg bg-primary/10 flex items-center justify-center">
            <Building2 className="h-7 w-7 text-primary" />
          </div>
<div>
            <h1 className="text-2xl font-bold">{company.name}</h1>
<div className="flex items-center gap-2 text-muted-foreground">
              {company.status && (
                <Badge variant={company.status === 'closed_won' ? 'default' : company.status === 'lost' ? 'destructive' : 'outline'}>
                  {company.status === 'identification' ? 'Identification' : 
                   company.status === 'outreach' ? 'Attempted Outreach' : 
                   company.status === 'conversation' ? 'Conversation' : 
                   company.status === 'presented' ? 'Candidate Presented' : 
                   company.status === 'meeting' ? 'Meeting' : 
                   company.status === 'proposal' ? 'Proposal' : 
                   company.status === 'closed_won' ? 'Closed Won' : 
                   company.status === 'lost' ? 'Lost' : 
                   company.status}
                </Badge>
              )}
              {company.industry && <Badge variant="secondary">{company.industry}</Badge>}
              {company.city && (
                <span className="flex items-center gap-1 text-sm">
                  <MapPin className="h-3 w-3" />
                  {company.city}, {company.state}
                </span>
              )}
            </div>
          </div>
        </div>
        
{/* Action buttons */}
        <div className="flex gap-2">
          <Button asChild>
            <Link href={`/dashboard/companies/${company.id}/edit`}>
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </Link>
          </Button>
          {company.linkedin_url && (
            <Button variant="outline" asChild>
              <a href={company.linkedin_url} target="_blank" rel="noopener noreferrer">
                <Linkedin className="mr-2 h-4 w-4" />
                LinkedIn
              </a>
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-border">
        <nav className="flex gap-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground"
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

{/* Tab Content */}
      <div className="min-h-[400px]">
        {activeTab === "overview" && <OverviewTab company={company} />}
        {activeTab === "history" && <HistoryTab company={company} />}
        {activeTab === "jobs" && <JobsTab companyId={company.id} companyName={company.name} />}
        {activeTab === "contacts" && <ContactsTab company={company} leads={companyLeads} />}
      </div>
    </div>
  );
}

// Overview Tab Component
function OverviewTab({ company }: { company: any }) {
  // Get primary contact from contacts array
  const contacts = company.contacts || [];
  const primaryContact = contacts.find((c: any) => c.isPrimary) || contacts[0];

  return (
    <div className="grid gap-6 md:grid-cols-2">
      {/* Basic Info */}
      <div className="p-6 rounded-lg border border-border bg-card space-y-4">
        <h3 className="font-semibold flex items-center gap-2">
          <Building2 className="h-5 w-5" />
          Company Information
        </h3>
        
        <div className="space-y-3">
          {company.industry && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Industry</span>
              <span className="font-medium">{company.industry}</span>
            </div>
          )}
          {company.employee_count && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Employees</span>
              <span className="font-medium">{company.employee_count}</span>
            </div>
          )}
          {company.revenue && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Revenue</span>
              <span className="font-medium">{company.revenue}</span>
            </div>
          )}
          {company.country && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Country</span>
              <span className="font-medium">{company.country}</span>
            </div>
          )}
        </div>
      </div>

      {/* Contact Info */}
      <div className="p-6 rounded-lg border border-border bg-card space-y-4">
        <h3 className="font-semibold flex items-center gap-2">
          <Mail className="h-5 w-5" />
          Contact Information
        </h3>
        
        <div className="space-y-3">
          {company.domain && (
            <div className="flex items-center gap-3">
              <Globe className="h-4 w-4 text-muted-foreground" />
              <a 
                href={`https://${company.domain}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                {company.domain}
              </a>
            </div>
          )}
          {company.linkedin_url && (
            <div className="flex items-center gap-3">
              <Linkedin className="h-4 w-4 text-muted-foreground" />
              <a 
                href={company.linkedin_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                LinkedIn Profile
              </a>
            </div>
          )}
          {(company.city || company.state) && (
            <div className="flex items-center gap-3">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <span>
                {company.city}{company.city && company.state && ", "}{company.state}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Primary Contact - Show prominently */}
      {primaryContact && (
        <div className="md:col-span-2 p-6 rounded-lg border border-border bg-card space-y-4">
          <h3 className="font-semibold flex items-center gap-2">
            <User className="h-5 w-5" />
            Primary Contact
            <Badge variant="secondary" className="ml-2 bg-yellow-100 text-yellow-800">
              <Star className="h-3 w-3 mr-1" />
              Primary
            </Badge>
          </h3>
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
              <User className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="font-medium">{primaryContact.name}</p>
              {primaryContact.title && (
                <p className="text-sm text-muted-foreground">{primaryContact.title}</p>
              )}
              <div className="flex flex-wrap gap-3 mt-1">
                {primaryContact.email && (
                  <a 
                    href={`mailto:${primaryContact.email}`}
                    className="flex items-center gap-1 text-sm text-primary hover:underline"
                  >
                    <Mail className="h-3 w-3" />
                    {primaryContact.email}
                  </a>
                )}
                {primaryContact.phone && (
                  <a 
                    href={`tel:${primaryContact.phone}`}
                    className="flex items-center gap-1 text-sm text-primary hover:underline"
                  >
                    <Phone className="h-3 w-3" />
                    {primaryContact.phone}
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Description */}
      {company.description && (
        <div className="md:col-span-2 p-6 rounded-lg border border-border bg-card space-y-4">
          <h3 className="font-semibold flex items-center gap-2">
            <FileText className="h-5 w-5" />
            About
          </h3>
          <p className="text-muted-foreground leading-relaxed">
            {company.description}
          </p>
        </div>
      )}
    </div>
  );
}

// History Tab Component - Now uses EventTimeline
function HistoryTab({ company }: { company: any }) {
  return (
    <div className="space-y-4">
      <h3 className="font-semibold">Activity Timeline</h3>
      <CompanyEventTimeline companyId={company.id} />
    </div>
  );
}

// Jobs Tab Component - Now using Jobs module
import { useJobsForCompany } from "@/lib/hooks/query-job";

function JobsTab({ companyId, companyName }: { companyId: string; companyName: string }) {
  const { data: jobs = [], isLoading, error } = useJobsForCompany(companyId);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="font-semibold">Open Jobs at {companyName}</h3>
          <Badge variant="secondary">Loading...</Badge>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <h3 className="font-semibold">Open Jobs at {companyName}</h3>
        <div className="p-4 rounded-lg border border-destructive/50 bg-destructive/10">
          <p className="text-sm text-destructive">Failed to load jobs</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold">Open Jobs at {companyName}</h3>
        <Badge variant="secondary">{jobs.length} positions</Badge>
      </div>
      
      {jobs.length > 0 ? (
        <div className="grid gap-4">
          {jobs.map((job: any) => (
            <Link 
              key={job.id} 
              href={`/dashboard/jobs?id=${job.id}`}
              className="block p-4 rounded-lg border border-border bg-card hover:border-primary/50 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h4 className="font-medium">{job.title || "Position"}</h4>
                  <p className="text-sm text-muted-foreground mt-1">
                    {job.location || "Location not specified"}
                  </p>
                  {job.salaryRange && (
                    <p className="text-sm text-muted-foreground mt-1">
                      Salary: {job.salaryRange}
                    </p>
                  )}
                </div>
                <Badge variant={
                  job.status === "Open" ? "default" :
                  job.status === "On Hold" ? "outline" :
                  job.status === "Closed" ? "secondary" : "secondary"
                }>
                  {job.status || "Open"}
                </Badge>
              </div>
              {job.candidates && job.candidates.length > 0 && (
                <div className="mt-2 pt-2 border-t border-border">
                  <p className="text-sm text-muted-foreground">
                    {job.candidates.length} candidate{job.candidates.length !== 1 ? 's' : ''} linked
                  </p>
                </div>
              )}
            </Link>
          ))}
        </div>
      ) : (
        <div className="text-center py-8 text-muted-foreground">
          <Briefcase className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>No open jobs for this company</p>
          <p className="text-sm mt-1">Create a new job to get started</p>
          <Button asChild className="mt-4">
            <Link href="/dashboard/jobs">
              <Plus className="h-4 w-4 mr-2" />
              Add Job
            </Link>
          </Button>
        </div>
      )}
    </div>
  );
}

// Contacts Tab Component
function ContactsTab({ company }: { company: any; leads: any[] }) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingContact, setEditingContact] = useState<any>(null);
  const [deletingContact, setDeletingContact] = useState<any>(null);
  const removeContactMutation = useRemoveContact();

  const contacts = company.contacts || [];

  const handleEdit = (contact: any) => {
    setEditingContact(contact);
  };

  const handleDelete = async () => {
    if (!deletingContact) return;
    
    try {
      await removeContactMutation.mutateAsync({
        clientId: company.id,
        contactId: deletingContact.id,
        contactName: deletingContact.name,
      });
      setDeletingContact(null);
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete contact');
    }
  };

  const refreshData = () => {
    // The query client cache will be invalidated by the mutation
    // This is just to close the modal
  };

  return (
    <div className="space-y-4">
      {/* Header with Add Contact button */}
      <div className="flex justify-between items-center">
        <h3 className="font-semibold">Contacts</h3>
        <Button onClick={() => setShowAddModal(true)} className="flex items-center gap-2">
          <Plus className="h-4 w-4" />
          Add Contact
        </Button>
      </div>

      {/* Contact Modal for Adding */}
      <ContactModal
        clientId={company.id}
        open={showAddModal}
        onOpenChange={(open) => {
          setShowAddModal(open);
          if (!open) refreshData();
        }}
        onSave={() => {
          setShowAddModal(false);
          refreshData();
        }}
      />

      {/* Contact Modal for Editing */}
      {editingContact && (
        <ContactModal
          clientId={company.id}
          contact={editingContact}
          open={!!editingContact}
          onOpenChange={(open) => {
            if (!open) setEditingContact(null);
            else refreshData();
          }}
          onSave={() => {
            setEditingContact(null);
            refreshData();
          }}
        />
      )}

      {/* Delete Confirmation */}
      {deletingContact && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={() => setDeletingContact(null)} />
          <div className="relative z-10 w-full max-w-md mx-4 bg-background rounded-lg border shadow-lg p-6">
            <h3 className="text-lg font-semibold">Delete Contact</h3>
            <p className="text-muted-foreground mt-2">
              Are you sure you want to delete {deletingContact.name}? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={() => setDeletingContact(null)} disabled={removeContactMutation.isPending}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleDelete} disabled={removeContactMutation.isPending}>
                {removeContactMutation.isPending ? 'Deleting...' : 'Delete'}
              </Button>
            </div>
          </div>
        </div>
      )}

{/* Contacts List */}
      {contacts.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2">
          {contacts.map((contact: any) => (
            <div key={contact.id} className="p-4 rounded-lg border border-border bg-card">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <User className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="font-medium">{contact.name}</h4>
                    {contact.isPrimary && (
                      <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 text-xs">
                        <Star className="h-3 w-3 mr-1" />
                        Primary
                      </Badge>
                    )}
                  </div>
                  {/* Contact ID - useful for reference */}
                  <p className="text-xs text-muted-foreground font-mono mt-1">
                    ID: {contact.id}
                  </p>
                  {contact.title && (
                    <p className="text-sm text-muted-foreground">{contact.title}</p>
                  )}
                  
                  <div className="flex flex-wrap gap-2 mt-3">
                    {contact.email && (
                      <a 
                        href={`mailto:${contact.email}`}
                        className="flex items-center gap-1 text-sm text-primary hover:underline"
                      >
                        <Mail className="h-3 w-3" />
                        {contact.email}
                      </a>
                    )}
                    {contact.phone && (
                      <a 
                        href={`tel:${contact.phone}`}
                        className="flex items-center gap-1 text-sm text-primary hover:underline"
                      >
                        <Phone className="h-3 w-3" />
                        {contact.phone}
                      </a>
                    )}
                  </div>

                  {/* Action buttons */}
                  <div className="flex gap-2 mt-3 pt-3 border-t border-border">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => handleEdit(contact)}
                      className="h-7 px-2 text-xs"
                    >
                      <Edit2 className="h-3 w-3 mr-1" />
                      Edit
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => setDeletingContact(contact)}
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
        <div className="text-center py-8 text-muted-foreground border border-dashed rounded-lg">
          <User className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>No contacts yet. Add one to get started.</p>
          <Button onClick={() => setShowAddModal(true)} className="mt-4">
            <Plus className="h-4 w-4 mr-2" />
            Add Contact
          </Button>
        </div>
      )}
    </div>
  );
}


