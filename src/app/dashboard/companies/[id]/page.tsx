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
import { Building2, MapPin, Users, Globe, Linkedin, Mail, Phone, ArrowLeft, FileText, Clock, Briefcase, User, StickyNote } from "lucide-react";

// Dynamic import for EventTimeline to avoid SSR issues
const CompanyEventTimeline = dynamic(() => 
  import("@/components/company/EventTimeline").then(mod => mod.CompanyEventTimeline), 
  { ssr: false, loading: () => <div>Loading timeline...</div> }
);

// Tab configuration
const tabs = [
  { id: "overview", label: "Overview", icon: Building2 },
  { id: "history", label: "History", icon: Clock },
  { id: "jobs", label: "Jobs", icon: Briefcase },
  { id: "contacts", label: "Contacts", icon: User },
  { id: "notes", label: "Notes", icon: StickyNote },
];

export default function CompanyDetailPage() {
  const params = useParams();
  const router = useRouter();
  const clientId = params.id as string;
  
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
            {error?.message || "The company you're looking for doesn't exist or has been deleted."}
          </p>
          <Button 
            onClick={() => router.push("/dashboard/companies")}
            className="mt-4"
          >
            Return to Companies
          </Button>
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
                <Badge variant={company.status === 'rejected' ? 'destructive' : company.status === 'accept' ? 'default' : 'outline'}>
                  {company.status === 'identification' ? 'Identification' : 
                   company.status === 'outreach' ? 'Attempted Outreach' : 
                   company.status === 'conversation' ? 'Conversation' : 
                   company.status === 'presented' ? 'Candidate Presented' : 
                   company.status === 'interview' ? 'Interview' : 
                   company.status === 'accept' ? 'Accept' : 
                   company.status === 'rejected' ? 'Rejected' : 
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
          {company.linkedin_url && (
            <Button variant="outline" asChild>
              <a href={company.linkedin_url} target="_blank" rel="noopener noreferrer">
                <Linkedin className="mr-2 h-4 w-4" />
                LinkedIn
              </a>
            </Button>
          )}
          {company.domain && (
            <Button variant="outline" asChild>
              <a href={`https://${company.domain}`} target="_blank" rel="noopener noreferrer">
                <Globe className="mr-2 h-4 w-4" />
                Website
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
        {activeTab === "jobs" && <JobsTab leads={companyLeads} companyName={company.name} />}
        {activeTab === "contacts" && <ContactsTab leads={companyLeads} />}
        {activeTab === "notes" && <NotesTab company={company} />}
      </div>
    </div>
  );
}

// Overview Tab Component
function OverviewTab({ company }: { company: any }) {
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

// Jobs Tab Component
function JobsTab({ leads, companyName }: { leads: any[]; companyName: string }) {
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold">Open Roles at {companyName}</h3>
        <Badge variant="secondary">{leads.length} positions</Badge>
      </div>
      
      {leads.length > 0 ? (
        <div className="grid gap-4">
          {leads.map((lead: any) => (
            <div key={lead.id} className="p-4 rounded-lg border border-border bg-card">
              <div className="flex items-start justify-between">
                <div>
                  <h4 className="font-medium">{lead.title || "Position"}</h4>
                  <p className="text-sm text-muted-foreground mt-1">
                    Source: {lead.source || "Direct"}
                  </p>
                </div>
                <Badge variant={
                  lead.status === "new" ? "default" :
                  lead.status === "contacted" ? "secondary" :
                  lead.status === "qualified" ? "outline" : "secondary"
                }>
                  {lead.status || "New"}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-8 text-muted-foreground">
          <Briefcase className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>No open roles recorded for this company</p>
          <p className="text-sm mt-1">Add contacts or leads associated with this company</p>
        </div>
      )}
    </div>
  );
}

// Contacts Tab Component
function ContactsTab({ leads }: { leads: any[] }) {
  return (
    <div className="space-y-4">
      <h3 className="font-semibold">Hiring Managers & Contacts</h3>
      
      {leads.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2">
          {leads.map((lead: any) => (
            <div key={lead.id} className="p-4 rounded-lg border border-border bg-card">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <User className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1">
                  <h4 className="font-medium">{lead.name || "Unknown Contact"}</h4>
                  {lead.title && (
                    <p className="text-sm text-muted-foreground">{lead.title}</p>
                  )}
                  
                  <div className="flex flex-wrap gap-2 mt-3">
                    {lead.email && (
                      <a 
                        href={`mailto:${lead.email}`}
                        className="flex items-center gap-1 text-sm text-primary hover:underline"
                      >
                        <Mail className="h-3 w-3" />
                        Email
                      </a>
                    )}
                    {lead.phone && (
                      <a 
                        href={`tel:${lead.phone}`}
                        className="flex items-center gap-1 text-sm text-primary hover:underline"
                      >
                        <Phone className="h-3 w-3" />
                        Call
                      </a>
                    )}
                    {lead.linkedin_url && (
                      <a 
                        href={lead.linkedin_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-sm text-primary hover:underline"
                      >
                        <Linkedin className="h-3 w-3" />
                        LinkedIn
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-8 text-muted-foreground">
          <User className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>No contacts associated with this company</p>
          <p className="text-sm mt-1">Add leads to track hiring managers here</p>
        </div>
      )}
    </div>
  );
}

// Notes Tab Component - Uses EventTimeline for notes
function NotesTab({ company }: { company: any }) {
  return (
    <div className="space-y-4">
      <h3 className="font-semibold">Notes & Comments</h3>
      {/* Reuse EventTimeline for notes */}
      <CompanyEventTimeline companyId={company.id} />
    </div>
  );
}
