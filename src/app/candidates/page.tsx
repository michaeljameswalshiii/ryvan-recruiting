"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Search, Plus, LayoutList, Kanban, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { useLeads, leadKeys } from "@/lib/hooks/query-lead";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

type ViewMode = "list" | "pipeline";

const pipelineStages = [
  { id: "identification", label: "Identification", color: "bg-gray-500" },
  { id: "outreach", label: "Attempted Outreach", color: "bg-blue-500" },
  { id: "conversation", label: "Conversation", color: "bg-indigo-500" },
  { id: "presented", label: "Candidate Presented", color: "bg-purple-500" },
  { id: "interview", label: "Interview", color: "bg-amber-500" },
  { id: "accept", label: "Accept", color: "bg-green-500" },
  { id: "rejected", label: "Rejected", color: "bg-red-500" },
];

// Format date for display
function formatDate(dateStr: string | undefined): string {
  if (!dateStr) return "-";
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "-";
  }
}

// Get time ago string
function getTimeAgo(dateStr: string | undefined): string {
  if (!dateStr) return "-";
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays}d ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
    return formatDate(dateStr);
  } catch {
    return "-";
  }
}

// ============================================================================
// NEW: Application-centric model - read stage from linkedJobs
// ============================================================================

/**
 * Get the primary stage from linkedJobs for display
 * Priority: 1) First linked job's stage, 2) Fallback to legacy status
 */
function getPrimaryStage(lead: any): string {
  // NEW: Read from linkedJobs array (application-centric model)
  if (lead.linkedJobs && lead.linkedJobs.length > 0) {
    const firstJob = lead.linkedJobs[0];
    if (firstJob.stage) {
      return firstJob.stage;
    }
  }
  
  // Fallback to legacy status for backward compatibility
  if (!lead.status) return "identification";
  const s = lead.status.toLowerCase();
  
  if (["rejected", "not_interested"].includes(s)) return "rejected";
  if (["accept", "accepted", "hired"].includes(s)) return "accept";
  if (["interview"].includes(s)) return "interview";
  if (["presented"].includes(s)) return "presented";
  if (["conversation", "qualified", "screening", "interested"].includes(s)) return "conversation";
  if (["outreach", "contacted"].includes(s)) return "outreach";
  
  return "identification";
}

/**
 * Get display label for stage
 */
function getStageLabel(stage: string): string {
  const labels: Record<string, string> = {
    identification: "New",
    outreach: "Outreach",
    conversation: "Conversation",
    presented: "Presented",
    interview: "Interview",
    accept: "Accept",
    rejected: "Rejected",
    // NEW: Application stages
    sourced: "Sourced",
    contacted: "Contacted",
    pre_screened: "Pre-Screened",
    submitted: "Submitted",
    interviewing: "Interviewing",
    offer_out: "Offer Out",
    offer_accepted: "Offer Accepted",
    offer_declined: "Offer Declined",
    placed: "Placed",
    not_interested: "Not Interested",
  };
  
  return labels[stage] || stage;
}

/**
 * Get stage color class for badge
 */
function getStageVariant(stage: string): "default" | "secondary" | "outline" {
  const acceptStages = ["accept", "accepted", "offer_accepted", "placed"];
  const interviewStages = ["interview", "interviewing", "offer_out"];
  
  if (acceptStages.includes(stage)) return "default";
  if (interviewStages.includes(stage)) return "secondary";
  return "outline";
}

export default function CandidatesPage() {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("list");

  const { data: leads = [], isLoading, error } = useLeads();

  // Filter candidates based on search query
  const filteredCandidates = useMemo(() => {
    return leads.filter((lead: any) => {
      if (!searchQuery) return true;
      const query = searchQuery.toLowerCase();
      return (
        lead.name?.toLowerCase().includes(query) ||
        lead.title?.toLowerCase().includes(query) ||
        lead.location?.toLowerCase().includes(query) ||
        lead.email?.toLowerCase().includes(query) ||
        lead.source?.toLowerCase().includes(query)
      );
    });
  }, [leads, searchQuery]);

  // Get most recent 20 candidates for list view (sorted by created_at)
  const recentCandidates = useMemo(() => {
    return [...filteredCandidates]
      .sort((a: any, b: any) => {
        const dateA = new Date(a.created_at || 0).getTime();
        const dateB = new Date(b.created_at || 0).getTime();
        return dateB - dateA;
      })
      .slice(0, 20);
  }, [filteredCandidates]);

// Group candidates by pipeline stage - NEW: use linkedJobs stage
  const pipelineGroups = useMemo(() => {
    const groups: Record<string, any[]> = {
      identification: [],
      outreach: [],
      conversation: [],
      presented: [],
      interview: [],
      accept: [],
      rejected: [],
    };
    
    filteredCandidates.forEach((lead: any) => {
      // NEW: Read stage from linkedJobs first
      const stage = getPrimaryStage(lead);
      if (groups[stage]) {
        groups[stage].push(lead);
      }
    });
    
    return groups;
  }, [filteredCandidates]);

  // Pipeline counts
  const pipelineCounts = {
    identification: pipelineGroups.identification.length,
    outreach: pipelineGroups.outreach.length,
    conversation: pipelineGroups.conversation.length,
    presented: pipelineGroups.presented.length,
    interview: pipelineGroups.interview.length,
    accept: pipelineGroups.accept.length,
    rejected: pipelineGroups.rejected.length,
  };

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: leadKeys.lists() });
    toast.success("Candidates refreshed");
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading candidates...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Main Content */}
      <div className="flex-1 p-6 space-y-6 overflow-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">Candidates</h1>
            <p className="text-muted-foreground text-sm">Manage your talent pipeline</p>
          </div>
          
          {/* Top Right: View Toggle + Add Button */}
          <div className="flex items-center gap-3">
            {/* View Toggle */}
            <div className="flex bg-muted rounded-lg p-1">
              <Button
                variant={viewMode === "list" ? "default" : "ghost"}
                size="sm"
                onClick={() => setViewMode("list")}
                className="h-8 px-3"
              >
                <LayoutList className="h-4 w-4 mr-1.5" />
                <span className="hidden sm:inline">List</span>
              </Button>
              <Button
                variant={viewMode === "pipeline" ? "default" : "ghost"}
                size="sm"
                onClick={() => setViewMode("pipeline")}
                className="h-8 px-3"
              >
                <Kanban className="h-4 w-4 mr-1.5" />
                <span className="hidden sm:inline">Pipeline</span>
              </Button>
            </div>
            
            {/* Add Candidate Button */}
            <Button asChild>
              <Link href="/candidates/new">
                <Plus className="h-4 w-4 mr-2" />
                Add Candidate
              </Link>
            </Button>
          </div>
        </div>

        {/* Pipeline Overview Cards - 7 columns responsive grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-3">
          {pipelineStages.map((stage) => (
            <Card 
              key={stage.id} 
              className={`cursor-pointer transition-all hover:shadow-md ${
                viewMode === "pipeline" ? "ring-2 ring-primary" : ""
              }`}
              onClick={() => setViewMode("pipeline")}
            >
              <CardContent className="py-3 px-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${stage.color}`} />
                    <span className="text-xs font-medium text-muted-foreground hidden lg:inline">
                      {stage.label}
                    </span>
                  </div>
                  <span className="text-xl font-bold">{pipelineCounts[stage.id as keyof typeof pipelineCounts]}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Search Bar */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search candidates by name, title, location..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Content: List View */}
        {viewMode === "list" && (
          <div className="rounded-md border bg-card">
            {/* Table Header */}
            <div className="grid grid-cols-6 gap-4 px-4 py-3 bg-muted/50 text-sm font-medium text-muted-foreground border-b">
              <div className="col-span-2">CANDIDATE</div>
              <div className="hidden md:block">LINKED JOB</div>
              <div className="hidden lg:block">SOURCE</div>
              <div className="hidden sm:block">STAGE</div>
              <div className="text-right">ADDED</div>
            </div>
            
            {/* Table Body */}
            <div className="divide-y">
              {recentCandidates.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">
                  <User className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No candidates found</p>
                  {searchQuery && (
                    <Button 
                      variant="link" 
                      onClick={() => setSearchQuery("")}
                      className="mt-2"
                    >
                      Clear search
                    </Button>
                  )}
                </div>
              ) : (
                recentCandidates.map((candidate: any) => (
                  <Link
                    key={candidate.id}
                    href={`/dashboard/candidates/${candidate.id}`}
                    className="grid grid-cols-6 gap-4 px-4 py-3 items-center hover:bg-muted/50 transition-colors"
                  >
                    {/* Candidate Column */}
                    <div className="col-span-2 flex items-center gap-3">
                      <Avatar
                        fallback={candidate.name}
                        size="sm"
                        className="h-9 w-9"
                      />
                      <div className="min-w-0">
                        <p className="font-medium truncate">{candidate.name}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {candidate.title || "No title"}
                        </p>
                      </div>
                    </div>
                    
{/* Linked Job - NEW: Read from linkedJobs */}
                    <div className="hidden md:block text-sm text-muted-foreground truncate">
                      {candidate.linkedJobs && candidate.linkedJobs.length > 0 
                        ? candidate.linkedJobs[0].jobTitle 
                        : "-"}
                    </div>
                    
                    {/* Source */}
                    <div className="hidden lg:block">
                      <Badge variant="outline" className="text-xs">
                        {candidate.source || "Direct"}
                      </Badge>
                    </div>
                    
{/* Stage - NEW: Read from linkedJobs */}
                    <div className="hidden sm:block">
                      <Badge
                        variant={getStageVariant(getPrimaryStage(candidate))}
                        className="text-xs"
                      >
                        {getStageLabel(getPrimaryStage(candidate))}
                      </Badge>
                    </div>
                    
                    {/* Added Date */}
                    <div className="text-right text-sm text-muted-foreground">
                      {formatDate(candidate.created_at)}
                    </div>
                  </Link>
                ))
              )}
            </div>
            
            {/* Table Footer - Last Activity indicator */}
            {recentCandidates.length > 0 && (
              <div className="px-4 py-2 bg-muted/30 text-xs text-muted-foreground border-t">
                Showing {recentCandidates.length} most recent candidates
              </div>
            )}
          </div>
        )}

        {/* Content: Pipeline View (Kanban - 7 columns) */}
        {viewMode === "pipeline" && (
          <div className="flex gap-4 overflow-x-auto pb-4">
            {pipelineStages.map((stage) => (
              <div
                key={stage.id}
                className="flex-shrink-0 w-64 sm:w-72"
              >
                {/* Column Header */}
                <div className="flex items-center justify-between px-3 py-2 bg-muted/50 rounded-t-lg border">
                  <div className="flex items-center gap-2">
                    <div className={`w-2.5 h-2.5 rounded-full ${stage.color}`} />
                    <span className="font-medium text-sm">{stage.label}</span>
                  </div>
                  <Badge variant="secondary" className="text-xs">
                    {pipelineCounts[stage.id as keyof typeof pipelineCounts]}
                  </Badge>
                </div>
                
                {/* Column Body */}
                <div className="border-x border-b rounded-b-lg bg-card/50 min-h-[200px] p-2 space-y-2">
                  {pipelineGroups[stage.id as keyof typeof pipelineGroups]?.length === 0 ? (
                    <div className="flex items-center justify-center h-32 text-sm text-muted-foreground italic">
                      Drag candidates here...
                    </div>
                  ) : (
                    pipelineGroups[stage.id as keyof typeof pipelineGroups].map((candidate: any) => (
                      <Link
                        key={candidate.id}
                        href={`/dashboard/candidates/${candidate.id}`}
                        className="block p-3 bg-background rounded-lg border shadow-sm hover:shadow-md transition-all"
                      >
                        <div className="flex items-start gap-2 mb-2">
                          <Avatar
                            fallback={candidate.name}
                            size="sm"
                            className="h-8 w-8"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-sm truncate">{candidate.name}</p>
                            <p className="text-xs text-muted-foreground truncate">
                              {candidate.title || "No title"}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{getTimeAgo(candidate.modified_at || candidate.created_at)}</span>
                        </div>
                      </Link>
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
