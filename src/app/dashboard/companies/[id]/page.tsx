/**
 * Company Detail Page
 * Shows company info with tabs: Overview, History, Jobs, Contacts, Notes
 */

"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useClient, useDeleteClient } from "@/lib/hooks/query-client";
import { useLeads } from "@/lib/hooks/query-lead";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ContactModal } from "@/components/company";
import { useRemoveContact } from "@/lib/hooks/query-client";
import { Building2, MapPin, Users, Globe, Linkedin, Mail, Phone, ArrowLeft, FileText, Clock, Briefcase, User, StickyNote, Plus, Star, Edit2, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { SendEmailModal } from "@/components/email/send-email-modal";
import { companyStageLabel } from "@/lib/schemas/client";

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

const validTabIds = new Set(tabs.map((tab) => tab.id));

export default function CompanyDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const clientId = params.id as string;

  // Hooks must run unconditionally (redirect "new" via effect below)
  const tabFromUrl = searchParams.get("tab");
  // Overview is the hub: header identity + primary contact + notes
  const initialTab = tabFromUrl && validTabIds.has(tabFromUrl) ? tabFromUrl : "overview";
  const [activeTab, setActiveTab] = useState(initialTab);

  // Keep tab state in sync when URL changes (e.g. in-app links with ?tab=contacts)
  useEffect(() => {
    if (tabFromUrl && validTabIds.has(tabFromUrl) && tabFromUrl !== activeTab) {
      setActiveTab(tabFromUrl);
    }
  }, [tabFromUrl, activeTab]);

  useEffect(() => {
    if (clientId === "new") {
      router.replace("/dashboard/companies/new");
    }
  }, [clientId, router]);

  // Send Email Modal state
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [selectedContact, setSelectedContact] = useState<{
    id: string;
    name: string;
    email: string;
  } | null>(null);

  // Fetch company data
  const { data: company, isLoading, error } = useClient(clientId);
  const { data: allLeads = [] } = useLeads();

  // Filter leads for this company
  const companyLeads = useMemo(
    () =>
      allLeads.filter(
        (lead: any) => lead.company?.toLowerCase() === company?.name?.toLowerCase()
      ),
    [allLeads, company?.name]
  );

  // Keep URL in sync when switching tabs so links can deep-link (?tab=contacts)
  const handleTabChange = (tabId: string) => {
    setActiveTab(tabId);
    const next = new URLSearchParams(searchParams.toString());
    if (tabId === "overview") {
      // Overview is default — keep the bare company URL clean
      next.delete("tab");
    } else {
      next.set("tab", tabId);
    }
    const qs = next.toString();
    router.replace(
      qs ? `/dashboard/companies/${clientId}?${qs}` : `/dashboard/companies/${clientId}`,
      { scroll: false }
    );
  };

  // Handle send email click from contacts
  const handleEmailClick = (contact: any) => {
    setSelectedContact({
      id: contact.id,
      name: contact.name,
      email: contact.email,
    });
    setEmailModalOpen(true);
  };

  // Handle send email with tracking
  const handleSendEmail = async (subject: string, body: string) => {
    if (!selectedContact || !company?.id) return;

    try {
      // Log the activity to the company's activity timeline
      const response = await fetch(`/api/companies/${company.id}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          noteText: `Email sent to ${selectedContact.name} (${selectedContact.email}) - Subject: ${subject}`,
          noteType: "email_sent",
          createdBy: "user@turnkey.com",
        }),
      });

      if (!response.ok) {
        console.error("Failed to log email event");
      }

      toast.success(`Email sent to ${selectedContact.email}`);
    } catch (err) {
      console.error("Error logging email event:", err);
      toast.success(`Email sent to ${selectedContact.email}`);
    }
  };

  // Guard: Redirect "new" after hooks (avoids rules-of-hooks violation)
  if (clientId === "new") {
    return (
      <div className="p-8">
        <div className="animate-pulse">Redirecting...</div>
      </div>
    );
  }

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

  const locationLabel = [company.city, company.state, company.country]
    .filter(Boolean)
    .join(", ");
  const websiteHref = company.domain
    ? company.domain.startsWith("http")
      ? company.domain
      : `https://${company.domain}`
    : company.website
      ? String(company.website).startsWith("http")
        ? company.website
        : `https://${company.website}`
      : null;
  const websiteLabel = company.domain || company.website || null;

  return (
    <div className="space-y-6">
      {/* Header — company + contact info live here (no duplicate cards on Overview) */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4 min-w-0">
          <Link href="/dashboard/companies">
            <Button variant="ghost" size="icon" className="shrink-0">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="h-14 w-14 shrink-0 rounded-lg bg-primary/10 flex items-center justify-center">
            <Building2 className="h-7 w-7 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold truncate">{company.name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-muted-foreground">
              {company.status && (
                <Badge
                  variant={
                    company.status === "closed_won" ||
                    company.status === "client"
                      ? "default"
                      : company.status === "lost" || company.status === "dnu"
                        ? "destructive"
                        : "outline"
                  }
                >
                  {companyStageLabel(company.status)}
                </Badge>
              )}
              {company.industry && (
                <Badge variant="secondary">{company.industry}</Badge>
              )}
              {locationLabel && (
                <span className="inline-flex items-center gap-1 text-sm">
                  <MapPin className="h-3.5 w-3.5 shrink-0" />
                  {locationLabel}
                </span>
              )}
            </div>
            {(websiteHref ||
              company.linkedin_url ||
              company.phone ||
              company.email) && (
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                {websiteHref && websiteLabel && (
                  <a
                    href={websiteHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-primary hover:underline"
                  >
                    <Globe className="h-3.5 w-3.5 shrink-0" />
                    {String(websiteLabel).replace(/^https?:\/\//, "")}
                  </a>
                )}
                {company.email &&
                  !String(company.email).includes("@placeholder.com") && (
                  <a
                    href={`mailto:${company.email}`}
                    className="inline-flex items-center gap-1.5 text-primary hover:underline"
                    title="Company-wide email"
                  >
                    <Mail className="h-3.5 w-3.5 shrink-0" />
                    {company.email}
                  </a>
                )}
                {company.phone && (
                  <a
                    href={`tel:${String(company.phone).replace(/[^\d+]/g, "")}`}
                    className="inline-flex items-center gap-1.5 text-primary hover:underline"
                  >
                    <Phone className="h-3.5 w-3.5 shrink-0" />
                    {company.phone}
                  </a>
                )}
                {company.linkedin_url && (
                  <a
                    href={company.linkedin_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-primary hover:underline"
                  >
                    <Linkedin className="h-3.5 w-3.5 shrink-0" />
                    LinkedIn
                  </a>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 shrink-0 sm:justify-end">
          <Button asChild>
            <Link href={`/dashboard/companies/${company.id}/edit`}>
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </Link>
          </Button>
          {company.linkedin_url && (
            <Button variant="outline" asChild>
              <a
                href={company.linkedin_url}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Linkedin className="mr-2 h-4 w-4" />
                LinkedIn
              </a>
            </Button>
          )}
          <CompanyDeleteButton
            companyId={company.id}
            companyName={company.name}
          />
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
                onClick={() => handleTabChange(tab.id)}
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
        {activeTab === "overview" && (
          <OverviewTab
            company={company}
            onViewContacts={() => handleTabChange("contacts")}
          />
        )}
        {activeTab === "history" && <HistoryTab company={company} />}
        {activeTab === "jobs" && <JobsTab companyId={company.id} companyName={company.name} />}
        {activeTab === "contacts" && (
          <ContactsTab
            company={company}
            leads={companyLeads}
            onEmailClick={handleEmailClick}
          />
        )}
      </div>

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

// Overview Tab — primary contact + notes/activity (identity is in the page header)
function OverviewTab({
  company,
  onViewContacts,
}: {
  company: any;
  onViewContacts?: () => void;
}) {
  const contacts = Array.isArray(company.contacts) ? company.contacts : [];
  const primaryContact = contacts.find((c: any) => c.isPrimary) || contacts[0];
  const primaryPhone =
    primaryContact?.preferredPhone ||
    primaryContact?.phone ||
    primaryContact?.phones?.[0]?.number;

  return (
    <div className="space-y-5">
      {/* Primary contact */}
      <div data-ink-on-light className="p-5 sm:p-6 rounded-2xl border border-border bg-card space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-semibold flex items-center gap-2 text-sm uppercase tracking-wide text-muted-foreground">
            <User className="h-4 w-4" />
            Primary Contact
            {primaryContact && (
              <Badge
                variant="secondary"
                className="ml-1 bg-yellow-100 text-yellow-800 normal-case tracking-normal"
              >
                <Star className="h-3 w-3 mr-1" />
                Primary
              </Badge>
            )}
          </h3>
          {onViewContacts && (
            <Button variant="ghost" size="sm" onClick={onViewContacts}>
              View all contacts
              {contacts.length > 0 ? ` (${contacts.length})` : ""}
            </Button>
          )}
        </div>

        {primaryContact ? (
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 shrink-0 rounded-full bg-primary/10 flex items-center justify-center">
              <User className="h-6 w-6 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="font-medium">
                {primaryContact.id ? (
                  <Link
                    href={`/dashboard/contact-info/${primaryContact.id}?companyId=${company.id}`}
                    className="hover:underline text-primary"
                  >
                    {primaryContact.name}
                  </Link>
                ) : (
                  primaryContact.name
                )}
              </p>
              {primaryContact.title && (
                <p className="text-sm text-muted-foreground">
                  {primaryContact.title}
                </p>
              )}
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
                {primaryContact.email && (
                  <a
                    href={`mailto:${primaryContact.email}`}
                    className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                  >
                    <Mail className="h-3 w-3" />
                    {primaryContact.email}
                  </a>
                )}
                {primaryPhone && (
                  <a
                    href={`tel:${primaryPhone}`}
                    className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                  >
                    <Phone className="h-3 w-3" />
                    {primaryPhone}
                  </a>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-dashed border-border px-4 py-6">
            <p className="text-sm text-muted-foreground">
              No contacts linked to this company yet.
            </p>
            {onViewContacts && (
              <Button variant="outline" size="sm" onClick={onViewContacts}>
                <User className="h-4 w-4 mr-2" />
                Manage contacts
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Optional company description */}
      {company.description && (
        <div data-ink-on-light className="p-5 sm:p-6 rounded-2xl border border-border bg-card space-y-3">
          <h3 className="font-semibold flex items-center gap-2 text-sm uppercase tracking-wide text-muted-foreground">
            <FileText className="h-4 w-4" />
            About
          </h3>
          <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
            {company.description}
          </p>
        </div>
      )}

      {/* Notes & activity (same component as Timeline tab) */}
      <CompanyEventTimeline companyId={company.id} />
    </div>
  );
}

// History Tab — full activity (also shown on Overview under Primary Contact)
function HistoryTab({ company }: { company: any }) {
  return (
    <div className="space-y-4">
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
                  job.status === "Open" || job.status === "OPEN" ? "default" :
                  job.status === "Paused" || job.status === "On Hold" || job.status === "PAUSED" ? "outline" :
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
function ContactsTab({ company, leads, onEmailClick }: { company: any; leads: any[]; onEmailClick?: (contact: any) => void }) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingContact, setEditingContact] = useState<any>(null);
  const [deletingContact, setDeletingContact] = useState<any>(null);
  const removeContactMutation = useRemoveContact();

  const contacts = Array.isArray(company.contacts) ? company.contacts : [];

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
                    <h4 className="font-medium">
                      {contact.id ? (
                        <Link
                          href={`/dashboard/contact-info/${contact.id}?companyId=${company.id}`}
                          className="hover:underline text-primary"
                        >
                          {contact.name}
                        </Link>
                      ) : (
                        contact.name
                      )}
                    </h4>
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
                    {contact.email && onEmailClick ? (
                      <button 
                        onClick={() => onEmailClick(contact)}
                        className="flex items-center gap-1 text-sm text-blue-400 hover:text-blue-600 hover:underline cursor-pointer"
                        title="Click to send email"
                      >
                        <Mail className="h-3 w-3" />
                        {contact.email}
                      </button>
                    ) : contact.email && (
                      <a 
                        href={`mailto:${contact.email}`}
                        className="flex items-center gap-1 text-sm text-primary hover:underline"
                      >
                        <Mail className="h-3 w-3" />
                        {contact.email}
                      </a>
                    )}
                    {(contact.preferredPhone || contact.phone || contact.phones?.[0]?.number) && (
                      <a 
                        href={`tel:${contact.preferredPhone || contact.phone || contact.phones?.[0]?.number}`}
                        className="flex items-center gap-1 text-sm text-primary hover:underline"
                      >
                        <Phone className="h-3 w-3" />
                        {contact.preferredPhone || contact.phone || contact.phones?.[0]?.number}
                      </a>
                    )}
                  </div>

                  {/* Action buttons */}
                  <div className="flex gap-2 mt-3 pt-3 border-t border-border">
                    <Button
                      variant="ghost"
                      size="sm"
                      asChild
                      className="h-7 px-2 text-xs"
                    >
                      <Link href={`/dashboard/contact-info/${contact.id}?companyId=${company.id}`}>
                        View
                      </Link>
                    </Button>
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

// Company Delete Button Component
function CompanyDeleteButton({ companyId, companyName }: { companyId: string; companyName: string }) {
  const router = useRouter();
  const deleteMutation = useDeleteClient();
  const [showConfirm, setShowConfirm] = useState(false);

  const handleDelete = async () => {
    try {
      await deleteMutation.mutateAsync(companyId);
      toast.success('Company deleted successfully');
      router.push('/dashboard/companies');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to delete company');
    }
  };

  if (showConfirm) {
    return (
      <div className="flex gap-2">
        <Button variant="destructive" size="sm" onClick={handleDelete} disabled={deleteMutation.isPending}>
          {deleteMutation.isPending ? 'Deleting...' : 'Confirm Delete'}
        </Button>
        <Button variant="outline" size="sm" onClick={() => setShowConfirm(false)}>
          Cancel
        </Button>
      </div>
    );
  }

  return (
    <Button variant="outline" size="sm" onClick={() => setShowConfirm(true)} className="text-destructive hover:text-destructive">
      <Trash2 className="mr-2 h-4 w-4" />
      Delete
    </Button>
  );
}


