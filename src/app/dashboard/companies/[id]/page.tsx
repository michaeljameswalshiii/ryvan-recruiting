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
import { Building2, MapPin, Users, Globe, Linkedin, Mail, Phone, ArrowLeft, FileText, Clock, Briefcase, User, StickyNote, Plus, Star, Edit2, Trash2, Pencil, ExternalLink, Printer } from "lucide-react";
import { toast } from "sonner";
import { SendEmailModal } from "@/components/email/send-email-modal";
import { companyStageLabel } from "@/lib/schemas/client";
import { CreateInvoiceModal } from "@/components/invoices/CreateInvoiceModal";
import { hasPermission } from "@/lib/roles";
import { EntityFilesPanel } from "@/components/shared/EntityFilesPanel";
import { AccountRepPill } from "@/components/shared/AccountRepPill";
import {
  actionBarBlue,
  actionBarBtn,
  actionBarPrimary,
} from "@/components/shared/EntityActionBar";
import { CopyTextButton } from "@/components/shared/CopyTextButton";
import { websiteLabel as formatWebsiteLabel } from "@/lib/ui/website-href";
import { FEE_TYPE_OPTIONS } from "@/lib/fees/placement-fee";
import {
  formatFollowUpDate,
  inferLastContacted,
  inferNextFollowUp,
  isFollowUpOverdue,
  toDateInputValue,
} from "@/lib/contacts/follow-up";
import { updateClient as updateClientApi } from "@/lib/api/client-api";
import { clientKeys } from "@/lib/hooks/client-keys";
import { useQueryClient } from "@tanstack/react-query";

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
  { id: "files", label: "Files", icon: FileText },
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
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [timelineKey, setTimelineKey] = useState(0);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/auth/session", { credentials: "include" });
        if (!res.ok) return;
        const data = await res.json();
        setUserRole(data?.user?.role || data?.role || null);
      } catch {
        /* ignore */
      }
    })();
  }, []);

  const canInvoice = hasPermission(userRole, "team_admin");

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
            <div className="flex min-w-0 items-center gap-1">
              <h1 className="truncate text-2xl font-bold">{company.name}</h1>
              <CopyTextButton value={company.name} label="company name" />
            </div>
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
              {(company.fee_percent != null || company.feePercent != null) && (
                <Badge variant="outline">
                  Fee {company.fee_percent ?? company.feePercent}%
                </Badge>
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
                  <span className="inline-flex items-center gap-0.5">
                    <a
                      href={`mailto:${company.email}`}
                      className="inline-flex items-center gap-1.5 text-primary hover:underline"
                      title="Company-wide email"
                    >
                      <Mail className="h-3.5 w-3.5 shrink-0" />
                      {company.email}
                    </a>
                    <CopyTextButton value={company.email} label="email" />
                  </span>
                )}
                {company.phone && (
                  <span className="inline-flex items-center gap-0.5">
                    <a
                      href={`tel:${String(company.phone).replace(/[^\d+]/g, "")}`}
                      className="inline-flex items-center gap-1.5 text-primary hover:underline"
                    >
                      <Phone className="h-3.5 w-3.5 shrink-0" />
                      {company.phone}
                    </a>
                    <CopyTextButton value={company.phone} label="phone" />
                  </span>
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
        {company.id ? (
          <AccountRepPill
            objectType="company"
            objectId={String(company.id)}
            label="Account Rep"
          />
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {websiteHref ? (
          <a
            href={websiteHref}
            target="_blank"
            rel="noopener noreferrer"
            className={actionBarBtn}
          >
            <Globe className="h-3.5 w-3.5" />
            Website
          </a>
        ) : null}
        {company.email &&
        !String(company.email).includes("@placeholder.com") ? (
          <a href={`mailto:${company.email}`} className={actionBarBtn}>
            <Mail className="h-3.5 w-3.5" />
            Email
          </a>
        ) : null}
        {company.phone ? (
          <a
            href={`tel:${String(company.phone).replace(/[^\d+]/g, "")}`}
            className={actionBarBtn}
          >
            <Phone className="h-3.5 w-3.5" />
            Call
          </a>
        ) : null}
        {canInvoice ? (
          <button
            type="button"
            className={actionBarPrimary}
            onClick={() => setInvoiceOpen(true)}
          >
            <FileText className="h-3.5 w-3.5" />
            Create invoice
          </button>
        ) : null}
        <Link
          href={`/dashboard/companies/${company.id}/edit`}
          className={actionBarBtn}
        >
          <Pencil className="h-3.5 w-3.5" />
          Edit
        </Link>
        <Link
          href={`/dashboard/jobs/new?companyId=${company.id}`}
          className={actionBarBlue}
        >
          <Briefcase className="h-3.5 w-3.5" />
          New Job
        </Link>
        <button
          type="button"
          className={actionBarBtn}
          onClick={() => handleTabChange("contacts")}
        >
          <User className="h-3.5 w-3.5" />
          Add contact
        </button>
        <CompanyDeleteButton
          companyId={company.id}
          companyName={company.name}
        />
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
            timelineKey={timelineKey}
            onViewContacts={() => handleTabChange("contacts")}
            onCreateInvoice={canInvoice ? () => setInvoiceOpen(true) : undefined}
            websiteHref={websiteHref}
            websiteLabel={websiteLabel}
          />
        )}
        {activeTab === "history" && (
          <HistoryTab company={company} timelineKey={timelineKey} />
        )}
        {activeTab === "jobs" && <JobsTab companyId={company.id} companyName={company.name} />}
        {activeTab === "contacts" && (
          <ContactsTab
            company={company}
            leads={companyLeads}
            onEmailClick={handleEmailClick}
          />
        )}
        {activeTab === "files" && company?.id ? (
          <EntityFilesPanel entityType="company" entityId={company.id} />
        ) : null}
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

      {canInvoice && (
        <CreateInvoiceModal
          open={invoiceOpen}
          onClose={() => setInvoiceOpen(false)}
          companyId={company.id}
          companyName={company.name}
          onCreated={() => {
            setTimelineKey((k) => k + 1);
            toast.success("Invoice logged on company timeline");
          }}
        />
      )}
    </div>
  );
}

// Overview Tab — primary contact + notes + snapshot / stats / links
function OverviewTab({
  company,
  timelineKey = 0,
  onViewContacts,
  onCreateInvoice,
  websiteHref,
  websiteLabel,
}: {
  company: any;
  timelineKey?: number;
  onViewContacts?: () => void;
  onCreateInvoice?: () => void;
  websiteHref?: string | null;
  websiteLabel?: string | null;
}) {
  const queryClient = useQueryClient();
  const { data: jobs = [] } = useJobsForCompany(company.id);
  const contacts = Array.isArray(company.contacts) ? company.contacts : [];
  const primaryContact = contacts.find((c: any) => c.isPrimary) || contacts[0];
  const primaryPhone =
    primaryContact?.preferredPhone ||
    primaryContact?.phone ||
    primaryContact?.phones?.[0]?.number;
  const openJobs = (Array.isArray(jobs) ? jobs : []).filter(
    (job: any) => String(job.status || "Open").toLowerCase() !== "closed"
  );

  const [events, setEvents] = useState<any[]>([]);
  const [addContactOpen, setAddContactOpen] = useState(false);
  const [followUpDraft, setFollowUpDraft] = useState(
    toDateInputValue(company.next_follow_up || company.nextFollowUp)
  );
  const [followUpManual, setFollowUpManual] = useState(
    company.next_follow_up_manual === true || company.nextFollowUpManual === true
  );
  const [savingFollowUp, setSavingFollowUp] = useState(false);
  const [tagDraft, setTagDraft] = useState("");
  const [tags, setTags] = useState<string[]>(
    Array.isArray(company.tags) ? company.tags.map(String) : []
  );
  const [savingTags, setSavingTags] = useState(false);

  const activityRows = events.map((event: any) => ({
    ...event,
    type: event.metadata?.noteType || event.eventType,
    content: event.metadata?.noteText || event.description || event.title,
    createdAt: event.createdAt || event.timestamp,
  }));
  const lastContacted = inferLastContacted(activityRows);
  const inferredFollowUp = inferNextFollowUp(activityRows);
  const nextFollowUp = followUpManual
    ? followUpDraft
    : followUpDraft || inferredFollowUp;
  const followUpOverdue = isFollowUpOverdue(nextFollowUp);

  useEffect(() => {
    if (followUpManual) return;
    setFollowUpDraft(inferredFollowUp);
  }, [inferredFollowUp, followUpManual]);

  const feePercent = company.fee_percent ?? company.feePercent;
  const feeTypeId = String(company.fee_type || company.feeType || "");
  const feeTypeLabel =
    FEE_TYPE_OPTIONS.find((opt) => opt.id === feeTypeId)?.label ||
    feeTypeId ||
    "—";
  const locationLabel = [company.city, company.state, company.country]
    .filter(Boolean)
    .join(", ");
  const clientSince = company.created_at || company.createdAt;

  const persistCompany = async (patch: Record<string, unknown>) => {
    await updateClientApi(String(company.id), patch);
    await queryClient.invalidateQueries({ queryKey: clientKeys.all });
  };

  const saveFollowUp = async (value: string, manual: boolean) => {
    setSavingFollowUp(true);
    try {
      await persistCompany({
        next_follow_up: value || "",
        next_follow_up_manual: manual,
      });
      setFollowUpDraft(value);
      setFollowUpManual(manual);
    } catch (err: any) {
      toast.error(err?.message || "Failed to save follow-up");
    } finally {
      setSavingFollowUp(false);
    }
  };

  const saveTags = async (next: string[]) => {
    setSavingTags(true);
    try {
      await persistCompany({ tags: next });
      setTags(next);
    } catch (err: any) {
      toast.error(err?.message || "Failed to save tags");
    } finally {
      setSavingTags(false);
    }
  };

  const snapshotRows: Array<{ label: string; value: string }> = [
    { label: "Industry", value: company.industry || "—" },
    {
      label: "Company size",
      value:
        company.employee_count != null
          ? String(company.employee_count)
          : company.company_size || "—",
    },
    { label: "Revenue", value: company.revenue || "—" },
    { label: "Location", value: locationLabel || "—" },
    { label: "Fee type", value: feeTypeLabel },
    {
      label: "Fee %",
      value: feePercent != null && feePercent !== "" ? `${feePercent}` : "—",
    },
    {
      label: "Guarantee",
      value: company.fee_guarantee || company.feeGuarantee || "—",
    },
  ];

  return (
    <div className="grid gap-5 xl:grid-cols-12">
      <div className="space-y-5 xl:col-span-7">
        <div
          data-ink-on-light
          className="p-5 sm:p-6 rounded-2xl border border-gray-200 bg-white shadow-sm space-y-4 text-slate-900"
        >
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-semibold flex items-center gap-2 text-sm uppercase tracking-wide text-slate-600">
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
              <Button
                variant="ghost"
                size="sm"
                onClick={onViewContacts}
                className="text-slate-700 hover:text-slate-900 hover:bg-slate-50"
              >
                View all contacts
                {contacts.length > 0 ? ` (${contacts.length})` : ""}
              </Button>
            )}
          </div>

          {primaryContact ? (
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 shrink-0 rounded-full bg-blue-50 flex items-center justify-center">
                <User className="h-6 w-6 text-blue-600" />
              </div>
              <div className="min-w-0">
                <p className="font-medium text-slate-900">
                  {primaryContact.id ? (
                    <Link
                      href={`/dashboard/contact-info/${primaryContact.id}?companyId=${company.id}`}
                      className="hover:underline text-blue-600"
                    >
                      {primaryContact.name}
                    </Link>
                  ) : (
                    primaryContact.name
                  )}
                </p>
                {primaryContact.title && (
                  <p className="text-sm text-slate-600">{primaryContact.title}</p>
                )}
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
                  {primaryContact.email && (
                    <a
                      href={`mailto:${primaryContact.email}`}
                      className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline"
                    >
                      <Mail className="h-3 w-3" />
                      {primaryContact.email}
                    </a>
                  )}
                  {primaryPhone && (
                    <a
                      href={`tel:${primaryPhone}`}
                      className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline"
                    >
                      <Phone className="h-3 w-3" />
                      {primaryPhone}
                    </a>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-dashed border-slate-300 px-4 py-6">
              <p className="text-sm text-slate-600">
                No contacts linked to this company yet.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAddContactOpen(true)}
                className="border-slate-300 bg-white text-slate-900"
              >
                <User className="h-4 w-4 mr-2" />
                Add contact
              </Button>
            </div>
          )}
        </div>

        {company.description && (
          <div
            data-ink-on-light
            className="p-5 sm:p-6 rounded-2xl border border-gray-200 bg-white shadow-sm space-y-3 text-slate-900"
          >
            <h3 className="font-semibold flex items-center gap-2 text-sm uppercase tracking-wide text-slate-600">
              <FileText className="h-4 w-4" />
              About
            </h3>
            <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
              {company.description}
            </p>
          </div>
        )}

        <CompanyEventTimeline
          key={timelineKey}
          companyId={company.id}
          onEventsChange={setEvents}
        />
      </div>

      <div className="space-y-5 xl:col-span-5">
        <section
          data-ink-on-light
          className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm text-slate-900"
        >
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Open jobs
            </h3>
            <Link
              href={`/dashboard/jobs?companyId=${company.id}`}
              className="text-xs font-medium text-blue-600 hover:underline"
            >
              View all
            </Link>
          </div>
          {openJobs.length ? (
            <div className="space-y-2">
              {openJobs.slice(0, 5).map((job: any) => (
                <Link
                  key={job.id}
                  href={`/dashboard/jobs/${job.id}`}
                  className="flex items-center justify-between gap-2 rounded-xl border border-gray-100 px-3 py-2.5 hover:bg-gray-50"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-gray-900">
                      {job.title || "Untitled job"}
                    </div>
                    <div className="text-xs text-gray-500">
                      {job.status || "Open"}
                      {job.location ? ` · ${job.location}` : ""}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500">No open jobs yet.</p>
          )}
        </section>

        <section
          data-ink-on-light
          className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm text-slate-900"
        >
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Company snapshot
          </h3>
          <div className="space-y-2.5 text-sm">
            {snapshotRows.map((row) => (
              <div key={row.label} className="flex justify-between gap-3">
                <span className="text-gray-500">{row.label}</span>
                <span className="text-right font-medium">{row.value}</span>
              </div>
            ))}
          </div>
        </section>

        <section
          data-ink-on-light
          className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm text-slate-900"
        >
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Quick stats
          </h3>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Contacts</span>
              <span className="font-medium tabular-nums">{contacts.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Open jobs</span>
              <span className="font-medium tabular-nums">{openJobs.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Activities</span>
              <span className="font-medium tabular-nums">{events.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Last activity</span>
              <span className="font-medium">
                {formatFollowUpDate(lastContacted)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="shrink-0 text-gray-500">Next follow-up</span>
              <div className="flex min-w-0 items-center justify-end gap-2">
                <input
                  type="date"
                  value={nextFollowUp}
                  disabled={savingFollowUp}
                  onChange={(e) => {
                    const value = e.target.value;
                    void saveFollowUp(value, !!value);
                  }}
                  className="h-8 max-w-[10.5rem] rounded-md border border-gray-200 bg-white px-2 text-xs font-medium text-gray-900"
                />
                {followUpOverdue ? (
                  <span className="text-[11px] font-semibold text-rose-600">
                    Overdue
                  </span>
                ) : null}
                {followUpManual ? (
                  <button
                    type="button"
                    className="text-[11px] font-medium text-blue-600 hover:underline"
                    disabled={savingFollowUp}
                    onClick={() => void saveFollowUp("", false)}
                  >
                    Auto
                  </button>
                ) : null}
              </div>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Client since</span>
              <span className="font-medium">
                {formatFollowUpDate(clientSince)}
              </span>
            </div>
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-gray-500">Tags</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium"
                  >
                    {tag}
                    <button
                      type="button"
                      className="text-slate-400 hover:text-slate-700"
                      onClick={() =>
                        void saveTags(tags.filter((item) => item !== tag))
                      }
                      aria-label={`Remove ${tag}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
                <form
                  className="inline-flex"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const next = tagDraft.trim();
                    if (!next || tags.includes(next)) return;
                    setTagDraft("");
                    void saveTags([...tags, next].slice(0, 20));
                  }}
                >
                  <input
                    value={tagDraft}
                    onChange={(e) => setTagDraft(e.target.value)}
                    disabled={savingTags}
                    placeholder="+ Add tag"
                    className="h-7 w-24 rounded-full border border-dashed border-slate-300 bg-white px-2 text-xs"
                  />
                </form>
              </div>
            </div>
          </div>
        </section>

        <section
          data-ink-on-light
          className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm text-slate-900"
        >
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Quick links
          </h3>
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="flex w-full items-center gap-3 rounded-xl border border-gray-100 px-3 py-2.5 text-left text-sm font-medium text-gray-800 hover:bg-gray-50"
            >
              <Printer className="h-4 w-4 text-slate-500" />
              Print cover sheet
            </button>
            <button
              type="button"
              onClick={() => setAddContactOpen(true)}
              className="flex w-full items-center gap-3 rounded-xl border border-gray-100 px-3 py-2.5 text-left text-sm font-medium text-gray-800 hover:bg-gray-50"
            >
              <User className="h-4 w-4 text-blue-600" />
              Add contact
            </button>
            {onCreateInvoice ? (
              <button
                type="button"
                onClick={onCreateInvoice}
                className="flex w-full items-center gap-3 rounded-xl border border-gray-100 px-3 py-2.5 text-left text-sm font-medium text-gray-800 hover:bg-gray-50"
              >
                <FileText className="h-4 w-4 text-emerald-600" />
                Create invoice
              </button>
            ) : null}
            {onViewContacts ? (
              <button
                type="button"
                onClick={onViewContacts}
                className="flex w-full items-center gap-3 rounded-xl border border-gray-100 px-3 py-2.5 text-left text-sm font-medium text-gray-800 hover:bg-gray-50"
              >
                <Users className="h-4 w-4 text-emerald-600" />
                All contacts
              </button>
            ) : null}
            {websiteHref ? (
              <a
                href={websiteHref}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 rounded-xl border border-gray-100 px-3 py-2.5 text-sm font-medium text-gray-800 hover:bg-gray-50"
              >
                <ExternalLink className="h-4 w-4 text-blue-600" />
                Visit website
                {websiteLabel ? (
                  <span className="ml-auto truncate text-xs text-gray-400">
                    {formatWebsiteLabel(String(websiteLabel))}
                  </span>
                ) : null}
              </a>
            ) : null}
          </div>
        </section>
      </div>

      <ContactModal
        clientId={company.id}
        open={addContactOpen}
        onOpenChange={setAddContactOpen}
        onSave={() => setAddContactOpen(false)}
      />
    </div>
  );
}

// History Tab — full activity (also shown on Overview under Primary Contact)
function HistoryTab({
  company,
  timelineKey = 0,
}: {
  company: any;
  timelineKey?: number;
}) {
  return (
    <div className="space-y-4">
      <CompanyEventTimeline key={timelineKey} companyId={company.id} />
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
              data-ink-on-light
              className="block p-4 rounded-lg border border-gray-200 bg-white shadow-sm hover:border-blue-300 transition-colors text-slate-900"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h4 className="font-medium text-slate-900">{job.title || "Position"}</h4>
                  <p className="text-sm text-slate-600 mt-1">
                    {job.location || "Location not specified"}
                  </p>
                  {job.salaryRange && (
                    <p className="text-sm text-slate-600 mt-1">
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
          <div
            role="dialog"
            data-ink-on-light
            className="relative z-10 w-full max-w-md mx-4 bg-white text-slate-900 rounded-lg border border-gray-200 shadow-lg p-6"
          >
            <h3 className="text-lg font-semibold text-slate-900">Delete Contact</h3>
            <p className="text-slate-600 mt-2">
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
            <div
              key={contact.id}
              data-ink-on-light
              className="p-4 rounded-lg border border-gray-200 bg-white shadow-sm text-slate-900"
            >
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
                  <User className="h-5 w-5 text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="font-medium text-slate-900">
                      {contact.id ? (
                        <Link
                          href={`/dashboard/contact-info/${contact.id}?companyId=${company.id}`}
                          className="hover:underline text-blue-600"
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
                  <p className="text-xs text-slate-500 font-mono mt-1">
                    ID: {contact.id}
                  </p>
                  {contact.title && (
                    <p className="text-sm text-slate-600">{contact.title}</p>
                  )}
                  
                  <div className="flex flex-wrap gap-2 mt-3">
                    {contact.email && onEmailClick ? (
                      <button 
                        onClick={() => onEmailClick(contact)}
                        className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
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
    <button
      type="button"
      onClick={() => setShowConfirm(true)}
      className={`${actionBarBtn} text-red-600`}
    >
      <Trash2 className="h-3.5 w-3.5" />
      Delete
    </button>
  );
}


