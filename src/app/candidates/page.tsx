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
  { id: "last18", label: "LAST 18", color: "bg-blue-500" },
  { id: "submitted", label: "SUBMITTED", color: "bg-slate-500" },
  { id: "interview", label: "INTERVIEW", color: "bg-amber-500" },
  { id: "offer", label: "OFFER OUT", color: "bg-orange-500" },
  { id: "accepted", label: "ACCEPTED", color: "bg-green-500" },
];

function formatDate(dateStr: string | undefined): string {
  if (!dateStr) return "-";
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return "-";
  }
}

function mapStatusToPipeline(status: string | undefined): string {
  if (!status) return "last18";
  const s = status.toLowerCase();
  if (["accept", "accepted"].includes(s)) return "accepted";
  if (["interview"].includes(s)) return "interview";
  if (["presented", "offer"].includes(s)) return "offer";
  if (["contacted", "qualified", "interested", "conversation", "outreach"].includes(s)) return "submitted";
  return "last18";
}

export default function CandidatesPage() {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("list");

  const { data: leads = [], isLoading, error } = useLeads();

  const filteredCandidates = useMemo(() => {
    return leads.filter((lead: any) => {
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return (
        lead.name?.toLowerCase().includes(q) ||
        lead.title?.toLowerCase().includes(q) ||
        lead.location?.toLowerCase().includes(q) ||
        lead.email?.toLowerCase().includes(q)
      );
    });
  }, [leads, searchQuery]);

  const recentCandidates = useMemo(() => {
    return [...filteredCandidates]
      .sort((a: any, b: any) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
      .slice(0, 20);
  }, [filteredCandidates]);

  const pipelineGroups = useMemo(() => {
    const groups: Record<string, any[]> = { last18: [], submitted: [], interview: [], offer: [], accepted: [] };
    filteredCandidates.forEach((lead: any) => {
      const stage = mapStatusToPipeline(lead.status);
      groups[stage].push(lead);
    });
    return groups;
  }, [filteredCandidates]);

  const pipelineCounts = {
    last18: pipelineGroups.last18.length,
    submitted: pipelineGroups.submitted.length,
    interview: pipelineGroups.interview.length,
    offer: pipelineGroups.offer.length,
    accepted: pipelineGroups.accepted.length,
  };

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: leadKeys.lists() });
    toast.success("Candidates refreshed");
  };

  if (isLoading) {
    return <div className="p-8 text-center">Loading candidates...</div>;
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Candidates</h1>
          <p className="text-muted-foreground">Manage your talent pipeline</p>
        </div>

        <div className="flex items-center gap-3">
          {/* View Toggle */}
          <div className="flex bg-muted rounded-lg p-1">
            <Button variant={viewMode === "list" ? "default" : "ghost"} size="sm" onClick={() => setViewMode("list")}>
              <LayoutList className="h-4 w-4 mr-1.5" /> List
            </Button>
            <Button variant={viewMode === "pipeline" ? "default" : "ghost"} size="sm" onClick={() => setViewMode("pipeline")}>
              <Kanban className="h-4 w-4 mr-1.5" /> Pipeline
            </Button>
          </div>

          <Button asChild>
            <Link href="/candidates/new">
              <Plus className="h-4 w-4 mr-2" /> Add Candidate
            </Link>
          </Button>
        </div>
      </div>

      {/* Pipeline Overview */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {pipelineStages.map((stage) => (
          <Card key={stage.id} className="cursor-pointer hover:shadow-md transition-all" onClick={() => setViewMode("pipeline")}>
            <CardContent className="py-4 px-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${stage.color}`} />
                  <span className="font-medium">{stage.label}</span>
                </div>
                <span className="text-2xl font-bold">{pipelineCounts[stage.id as keyof typeof pipelineCounts]}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search candidates..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* List View */}
      {viewMode === "list" && (
        <Card>
          <CardContent className="p-0">
            {/* Table content from archive - clean version */}
            <div className="divide-y">
              {recentCandidates.map((candidate: any) => (
                <Link
                  key={candidate.id}
                  href={`/candidates/${candidate.id}`}
                  className="grid grid-cols-12 gap-4 px-6 py-4 items-center hover:bg-muted/50"
                >
                  <div className="col-span-5 flex items-center gap-3">
                    <Avatar fallback={candidate.name} className="h-10 w-10" />
                    <div>
                      <p className="font-medium">{candidate.name}</p>
                      <p className="text-sm text-muted-foreground">{candidate.title || "No title"}</p>
                    </div>
                  </div>
                  <div className="col-span-2 text-sm text-muted-foreground hidden md:block">
                    {candidate.linked_job || "-"}
                  </div>
                  <div className="col-span-2">
                    <Badge variant="outline">{candidate.source || "Manual"}</Badge>
                  </div>
                  <div className="col-span-2">
                    <Badge>{candidate.status || "New"}</Badge>
                  </div>
                  <div className="col-span-1 text-sm text-muted-foreground text-right">
                    {formatDate(candidate.created_at)}
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pipeline View */}
      {viewMode === "pipeline" && (
        <div className="flex gap-4 overflow-x-auto pb-8">
          {pipelineStages.map((stage) => (
            <div key={stage.id} className="flex-shrink-0 w-80">
              <div className="bg-muted/50 rounded-t-lg p-3 flex items-center justify-between border">
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${stage.color}`} />
                  <span className="font-semibold">{stage.label}</span>
                </div>
                <Badge>{pipelineCounts[stage.id as keyof typeof pipelineCounts]}</Badge>
              </div>
              <div className="min-h-[500px] border border-dashed border-muted-foreground/30 rounded-b-lg p-3">
                {/* Future drag-and-drop area */}
                <p className="text-center text-muted-foreground mt-20">Drag candidates here...</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
