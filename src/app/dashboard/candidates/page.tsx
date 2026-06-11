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

// Map lead status to pipeline stage
function mapStatusToPipeline(status: string | undefined): string {
  if (!status) return "identification";
  const statusLower = status.toLowerCase();
  
  if (["accept", "accepted"].includes(statusLower)) return "accept";
  if (["rejected", "reject"].includes(statusLower)) return "rejected";
  if (["interview"].includes(statusLower)) return "interview";
  if (["presented"].includes(statusLower)) return "presented";
  if (["conversation"].includes(statusLower)) return "conversation";
  if (["outreach", "contacted", "interested", "qualified"].includes(statusLower)) return "outreach";
  
  return "identification";
}

type SortField = "created_at" | "modified_at";
type SortDirection = "asc" | "desc";

export default function CandidatesPage() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("list");
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

// Group candidates by pipeline stage
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
      const stage = mapStatusToPipeline(lead.status);
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

{/* Pipeline Overview Cards (always visible above content) */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
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
                    <span className="text-xs font-medium text-muted-foreground hidden sm:inline">
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

{/* Content: List View - FIXED TABLE LAYOUT */}
        {viewMode === "list" && (
          <Card>
            <CardContent className="p-0">
              <table className="w-full table-fixed">
<thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-4 font-medium w-12"></th>
                    <th className="text-left p-4 font-medium">CANDIDATE</th>
                    <th className="text-left p-4 font-medium w-80">LINKED JOB</th>
                    <th className="text-left p-4 font-medium w-36">STAGE</th>
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
                        
{/* LINKED JOB - showing up to 2 jobs with +X more badge */}
                        <td className="p-4">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 flex flex-wrap gap-1">
                              {candidate.linkedJobs && candidate.linkedJobs.length > 0 ? (
                                <>
                                  {candidate.linkedJobs.slice(0, 2).map((job: any) => (
                                    <Badge 
                                      key={job.jobId} 
                                      variant="secondary" 
                                      className="cursor-pointer hover:bg-blue-100 text-xs"
                                      onClick={() => router.push(`/dashboard/jobs/${job.jobId}`)}
                                    >
                                      {job.jobTitle}
                                    </Badge>
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
                        
                        {/* STAGE */}
                        <td className="p-4">
                          <Badge
                            variant={
                              candidate.status === "accept" || candidate.status === "accepted"
                                ? "default"
                                : candidate.status === "interview"
                                ? "secondary"
                                : "outline"
                            }
                            className="text-xs"
                          >
                            {candidate.status || "New"}
                          </Badge>
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
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 text-primary hover:bg-primary/10"
                              onClick={() => {
                                setSelectedCandidate({
                                  id: candidate.id,
                                  name: candidate.name,
                                  linkedJobIds: candidate.linkedJobIds || [],
                                });
                                setLinkJobModalOpen(true);
                              }}
                            >
                              <Link2 className="h-4 w-4" />
                            </Button>
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
                          </div>
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
