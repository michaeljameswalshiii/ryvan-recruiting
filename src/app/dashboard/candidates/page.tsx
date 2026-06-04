"use client";

import { useState } from "react";
import Link from "next/link";
import { Search, Plus, LayoutList, Kanban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useLeads, leadKeys } from "@/lib/hooks/query-lead";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

const pipelineStages = [
  { label: "LAST 18", key: "last18", value: 2, color: "bg-blue-500" },
  { label: "SUBMITTED", key: "submitted", value: 0, color: "bg-slate-500" },
  { label: "INTERVIEW", key: "interview", value: 0, color: "bg-amber-500" },
  { label: "OFFER OUT", key: "offer", value: 0, color: "bg-orange-500" },
  { label: "ACCEPTED", key: "accepted", value: 0, color: "bg-green-500" },
];

export default function CandidatesPage() {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [view, setView] = useState<"list" | "pipeline">("list");

  const { data: leads = [], isLoading } = useLeads();

  const filteredCandidates = leads
    .filter((lead: any) =>
      lead.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      lead.title?.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .slice(0, 20);

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: leadKeys.lists() });
    toast.success("Candidates refreshed");
  };

  return (
    <div className="p-8 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Candidates</h1>
          <p className="text-muted-foreground">Manage your candidate pipeline.</p>
        </div>

        {/* Toggle */}
        <div className="flex bg-muted p-1 rounded-lg">
          <Button
            variant={view === "list" ? "default" : "ghost"}
            size="sm"
            onClick={() => setView("list")}
            className="flex items-center gap-2"
          >
            <LayoutList className="h-4 w-4" /> List
          </Button>
          <Button
            variant={view === "pipeline" ? "default" : "ghost"}
            size="sm"
            onClick={() => setView("pipeline")}
            className="flex items-center gap-2"
          >
            <Kanban className="h-4 w-4" /> Pipeline
          </Button>
        </div>

        {/* Search */}
        <div className="relative w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search candidates..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Pipeline Overview */}
      <div className="grid grid-cols-5 gap-4">
        {pipelineStages.map((stage) => (
          <Card key={stage.key}>
            <CardContent className="pt-6 text-center">
              <p className="text-4xl font-bold">{stage.value}</p>
              <p className="text-sm text-muted-foreground mt-1">{stage.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex justify-end">
        <Button asChild>
          <Link href="/candidates/new">
            <Plus className="mr-2 h-4 w-4" /> Add Candidate
          </Link>
        </Button>
      </div>

      {view === "list" ? (
        /* LIST VIEW */
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">CANDIDATE</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">LINKED JOB</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">SOURCE</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">STAGE</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">ADDED</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">LAST ACTIVITY</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                        Loading candidates...
                      </td>
                    </tr>
                  ) : filteredCandidates.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                        No candidates found
                      </td>
                    </tr>
                  ) : (
                    filteredCandidates.map((candidate: any) => (
                      <tr key={candidate.id} className="border-b hover:bg-muted/50">
                        <td className="px-4 py-3">
                          <Link href={`/candidates/${candidate.id}`} className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-medium">
                              {candidate.name?.slice(0,2).toUpperCase()}
                            </div>
                            <div>
                              <div className="font-medium">{candidate.name}</div>
                              {candidate.title && <div className="text-sm text-muted-foreground">{candidate.title}</div>}
                            </div>
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">-</td>
                        <td className="px-4 py-3">
                          <Badge variant="outline">Manual</Badge>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="secondary">New</Badge>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">Jun 1, 2026</td>
                        <td className="px-4 py-3 text-muted-foreground">Today</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : (
        /* PIPELINE VIEW (Basic) */
        <div className="grid grid-cols-5 gap-6">
          {pipelineStages.map((stage) => (
            <Card key={stage.key} className="h-[600px]">
              <CardContent className="p-6 h-full flex flex-col">
                <div className="flex justify-between mb-6">
                  <div>
                    <p className="font-semibold">{stage.label}</p>
                    <p className="text-3xl font-bold">{stage.value}</p>
                  </div>
                  <div className={`w-5 h-5 rounded-full ${stage.color}`} />
                </div>
                <div className="flex-1 border border-dashed border-muted-foreground/30 rounded-xl flex items-center justify-center text-muted-foreground">
                  Drag candidates here...
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
