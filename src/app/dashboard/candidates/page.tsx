"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Search, Plus, LayoutList, Kanban, User, RefreshCw, Trash2, MoreVertical, Briefcase, Link2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { IdBadge } from "@/components/ui/id-badge";
import { useLeads, leadKeys } from "@/lib/hooks/query-lead";
import { deleteLeadAction } from "@/lib/actions/lead-actions";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { LinkJobModal } from "@/components/candidate/LinkJobModal";
import { APPLICATION_STAGES, getStageLabel, getStageColor } from "@/lib/schemas/lead";

type ViewMode = "list" | "pipeline";

// Pipeline stages using new APPLICATION_STAGES model
const pipelineStages = APPLICATION_STAGES.map((stage) => ({
  id: stage.value,
  label: stage.label,
  color: `bg-${stage.color}-500`,
}));

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

// Map lead status to new APPLICATION_STAGES
function mapStatusToPipeline(status: string | undefined): string {
  if (!status) return "sourced";
  const statusLower = status.toLowerCase();
  
  // Map legacy statuses to new APPLICATION_STAGES
  if (["offer_accepted", "accept", "accepted"].includes(statusLower)) return "offer_accepted";
  if (["placed"].includes(statusLower)) return "placed";
  if (["offer_out", "offer"].includes(statusLower)) return "offer_out";
  if (["interview", "interviewing"].includes(statusLower)) return "interviewing";
  if (["submitted", "presented"].includes(statusLower)) return "submitted";
  if (["pre_screened", "screened"].includes(statusLower)) return "pre_screened";
  if (["contacted"].includes(statusLower)) return "contacted";
  if (["email", "text", "left_message"].includes(statusLower)) return statusLower === "email" ? "email" : statusLower === "text" ? "text" : "left_message";
  if (["rejected"].includes(statusLower)) return "rejected";
  if (["not_interested"].includes(statusLower)) return "not_interested";
  if (["outreach", "interested", "qualified", "conversation"].includes(statusLower)) return "contacted";
  
  // Default to sourced for new/unknown statuses
  return "sourced";
}

type SortField = "created_at" | "modified_at";
type SortDirection = "asc" | "desc";

export default function CandidatesPage() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>("created_at");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  
  // Link Job Modal state
  const [linkJobModalOpen, setLinkJobModalOpen] = useState(false);
  const [selectedCandidate, setSelectedCandidate] = useState<{
    id: string;
    name: string;
    linkedJobIds: string[];
  } | null>(null);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "desc" ? "asc" : "desc");
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  const { data: leads = [], isLoading, error } = useLeads();

// Filter candidates based on search query and active filter
  const filteredCandidates = useMemo(() => {
    let candidates = leads;
    
    // Apply stage filter if active
    if (activeFilter) {
      candidates = candidates.filter((candidate: any) =>
        candidate.linkedJobs?.some((job: any) => job.stage === activeFilter)
      );
    }
    
    // Apply search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      candidates = candidates.filter((lead: any) =>
        lead.name?.toLowerCase().includes(query) ||
        lead.title?.toLowerCase().includes(query) ||
        lead.location?.toLowerCase().includes(query) ||
        lead.email?.toLowerCase().includes(query) ||
        lead.source?.toLowerCase().includes(query)
      );
    }
    
    return candidates;
  }, [leads, searchQuery, activeFilter]);

// Get candidates sorted by selected field
  const recentCandidates = useMemo(() => {
    return [...filteredCandidates]
      .sort((a: any, b: any) => {
        const dateA = new Date(a[sortField] || 0).getTime();
        const dateB = new Date(b[sortField] || 0).getTime();
        return sortDirection === "desc" ? dateB - dateA : dateA - dateB;
      })
      .slice(0, 20);
  }, [filteredCandidates, sortField, sortDirection]);

// Group candidates by pipeline stage using linkedJobs[].stage
  const pipelineGroups = useMemo(() => {
    const groups: Record<string, any[]> = {};
    
    // Initialize groups for all APPLICATION_STAGES
    APPLICATION_STAGES.forEach((stage) => {
      groups[stage.value] = [];
    });
    
    filteredCandidates.forEach((lead: any) => {
      // READ STAGE FROM linkedJobs array
      if (lead.linkedJobs && lead.linkedJobs.length > 0) {
        // Group by ALL linked job stages (add to multiple groups if needed)
        lead.linkedJobs.forEach((job: any) => {
          const jobStage = job.stage || "sourced";
          if (groups[jobStage]) {
            // Avoid duplicates if same candidate in multiple jobs at same stage
            if (!groups[jobStage].some((c: any) => c.id === lead.id)) {
              groups[jobStage].push(lead);
            }
          } else {
            groups['sourced'].push(lead);
          }
        });
      } else {
        // Default to 'sourced' for unlinked candidates
        groups['sourced'].push(lead);
      }
    });
    
    return groups;
  }, [filteredCandidates]);

  // Pipeline counts
  const pipelineCounts: Record<string, number> = {};
  APPLICATION_STAGES.forEach((stage) => {
    pipelineCounts[stage.value] = pipelineGroups[stage.value]?.length || 0;
  });

const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: leadKeys.lists() });
    toast.success("Candidates refreshed");
  };

  const handleDelete = async (leadId: string) => {
    setDeleting(true);
    try {
      const result = await deleteLeadAction(leadId);
      if (result?.error) {
        toast.error(result.error);
      } else {
        toast.success("Candidate deleted");
        queryClient.invalidateQueries({ queryKey: leadKeys.lists() });
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to delete");
    } finally {
      setDeleting(false);
      setDeleteDialogOpen(null);
    }
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
{/* HEADER - TITLE + TOGGLE + BUTTONS ON SAME LINE */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-bold">Candidates</h1>
            <p className="text-muted-foreground">Manage your candidate pipeline.</p>
          </div>

          {/* Toggle in the middle */}
          <div className="flex justify-center lg:justify-start">
            <div className="inline-flex bg-muted rounded-lg p-1">
              <Button
                variant={viewMode === "list" ? "default" : "ghost"}
                onClick={() => setViewMode("list")}
                className="px-8"
              >
                List
              </Button>
              <Button
                variant={viewMode === "pipeline" ? "default" : "ghost"}
                onClick={() => setViewMode("pipeline")}
                className="px-8"
              >
                Pipeline
              </Button>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={handleRefresh}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
            <Button asChild>
              <Link href="/dashboard/candidates/new">
                <Plus className="h-4 w-4 mr-2" />
                Add Candidate
              </Link>
            </Button>
          </div>
        </div>

{/* Top Stage Counters - FIXED to use linkedJobs[].stage */}
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 xl:grid-cols-8 2xl:grid-cols-13 gap-3 mb-6">
          {APPLICATION_STAGES.map((stage) => {
            const count = leads.filter((candidate: any) =>
              candidate.linkedJobs?.some((job: any) => job.stage === stage.value)
            ).length;
            
            const isActive = activeFilter === stage.value;

            return (
              <div 
                key={stage.value} 
                onClick={() => setActiveFilter(isActive ? null : stage.value)}
                className={`bg-card border rounded-xl p-3 text-center cursor-pointer transition-all hover:bg-accent ${
                  isActive ? "ring-2 ring-blue-500 bg-blue-50" : "hover:bg-accent"
                }`}
              >
                <div className={`text-2xl font-semibold ${getStageColor(stage.value)}`}>
                  {count}
                </div>
                <div className="text-sm text-muted-foreground mt-1">{stage.label}</div>
              </div>
            );
          })}
        </div>
        
        {/* Clear Filter Button */}
        {activeFilter && (
          <div className="mb-4">
            <Button variant="outline" onClick={() => setActiveFilter(null)}>
              Clear Filter ({activeFilter})
            </Button>
          </div>
        )}

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

{/* Content: List View - FIXED TABLE LAYOUT */}
        {viewMode === "list" && (
          <Card>
            <CardContent className="p-0">
              <table className="w-full table-fixed">
<thead>
<tr className="border-b bg-muted/50">
                    <th className="text-left p-4 font-medium w-12"></th>
                    <th className="text-left p-4 font-medium">CANDIDATE</th>
                    <th className="text-left p-4 font-medium w-56">LINKED JOB</th>
                    <th className="text-left p-4 font-medium w-48">STAGE</th>
                    <th className="text-left p-4 font-medium w-36">
                      <button 
                        onClick={() => handleSort("created_at")}
                        className="hover:text-foreground transition-colors cursor-pointer text-left"
                      >
                        ADDED {sortField === "created_at" && (sortDirection === "desc" ? "↓" : "↑")}
                      </button>
                    </th>
                    <th className="text-left p-4 font-medium w-36">
                      <button 
                        onClick={() => handleSort("modified_at")}
                        className="hover:text-foreground transition-colors cursor-pointer text-left"
                      >
                        LAST ACTIVITY {sortField === "modified_at" && (sortDirection === "desc" ? "↓" : "↑")}
                      </button>
                    </th>
                    <th className="text-left p-4 font-medium w-32">ACTIONS</th>
                    <th className="text-left p-4 font-medium w-28">ID</th>
                  </tr>
                </thead>
                <tbody>
{recentCandidates.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-12 text-center text-muted-foreground">
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
                      </td>
                    </tr>
                  ) : (
                    recentCandidates.map((candidate: any) => (
                      <tr key={candidate.id} className="border-b hover:bg-muted/50 group">
                        {/* Avatar */}
                        <td className="p-4">
                          <Avatar fallback={candidate.name} size="sm" className="h-9 w-9" />
                        </td>
                        
                        {/* CANDIDATE */}
                        <td className="p-4">
                          <Link href={`/dashboard/candidates/${candidate.id}`} className="hover:underline">
                            <div className="font-medium">{candidate.name}</div>
                            <div className="text-sm text-muted-foreground">{candidate.title || "No title"}</div>
                          </Link>
                        </td>
                        
{/* LINKED JOB - showing up to 2 jobs with +X more badge and stage */}
                        <td className="p-4">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 flex flex-col gap-1">
                              {candidate.linkedJobs && candidate.linkedJobs.length > 0 ? (
                                <>
                                  {candidate.linkedJobs.slice(0, 2).map((job: any) => (
                                    <div key={job.jobId} className="flex items-center gap-1">
                                      <Badge 
                                        variant="secondary" 
                                        className="cursor-pointer hover:bg-blue-100 text-xs"
                                        onClick={() => router.push(`/dashboard/jobs/${job.jobId}`)}
                                      >
                                        {job.jobTitle}
                                      </Badge>
                                    </div>
                                  ))}
                                  {candidate.linkedJobs.length > 2 && (
                                    <Badge variant="outline" className="text-xs">
                                      +{candidate.linkedJobs.length - 2} more
                                    </Badge>
                                  )}
                                </>
                              ) : (
                                <span className="text-muted-foreground text-sm">— No job linked —</span>
                              )}
                            </div>
                            {/* Link Job Button */}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 text-primary hover:bg-primary/10 flex-shrink-0"
                              onClick={() => {
                                setSelectedCandidate({
                                  id: candidate.id,
                                  name: candidate.name,
                                  linkedJobIds: candidate.linkedJobIds || [],
                                });
                                setLinkJobModalOpen(true);
                              }}
                              title="Link job to candidate"
                            >
                              <Link2 className="h-4 w-4" />
                            </Button>
                          </div>
</td>
                        
                        {/* STAGE - showing up to 2 stages from linkedJobs */}
                        <td className="p-4">
                          {candidate.linkedJobs && candidate.linkedJobs.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {candidate.linkedJobs.slice(0, 2).map((job: any) => {
                                const stageInfo = APPLICATION_STAGES.find(s => s.value === job.stage);
                                return (
                                  <Badge key={job.jobId} variant="secondary" className="text-xs">
                                    {stageInfo?.label || job.stage}
                                  </Badge>
                                );
                              })}
                              {candidate.linkedJobs.length > 2 && (
                                <Badge variant="outline" className="text-xs">+{candidate.linkedJobs.length - 2}</Badge>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">— No stage —</span>
                          )}
                        </td>
                        
                        {/* ADDED */}
                        <td className="p-4 text-sm text-muted-foreground">
                          {formatDate(candidate.created_at)}
                        </td>
                        
                        {/* LAST ACTIVITY */}
                        <td className="p-4 text-sm text-muted-foreground">
                          {getTimeAgo(candidate.modified_at || candidate.created_at)}
                        </td>
                        
{/* ACTIONS */}
                        <td className="p-4">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 text-red-500 hover:text-red-700 hover:bg-red-50"
                            onClick={() => {
                              if (confirm(`Delete ${candidate.name}?`)) {
                                handleDelete(candidate.id);
                              }
                            }}
                            disabled={deleting}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </td>
                        
                        {/* ID */}
                        <td className="p-4">
                          <IdBadge id={candidate.id} />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
              
              {/* Table Footer */}
              {recentCandidates.length > 0 && (
                <div className="px-4 py-2 bg-muted/30 text-xs text-muted-foreground border-t">
                  Showing {recentCandidates.length} most recent candidates
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Content: Pipeline View (Kanban) */}
        {viewMode === "pipeline" && (
          <div className="flex gap-4 overflow-x-auto pb-4">
            {pipelineStages.map((stage) => (
              <div
                key={stage.id}
                className="flex-shrink-0 w-72 sm:w-80"
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

      {/* Link Job Modal */}
      <LinkJobModal
        open={linkJobModalOpen}
        onOpenChange={setLinkJobModalOpen}
        candidateId={selectedCandidate?.id || ""}
        candidateName={selectedCandidate?.name || ""}
        currentLinkedJobIds={selectedCandidate?.linkedJobIds || []}
      />
    </div>
  );
}
