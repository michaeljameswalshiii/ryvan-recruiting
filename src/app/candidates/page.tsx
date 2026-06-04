"use client";

import { useState } from "react";
import Link from "next/link";
import { Search, Plus, Mail, MapPin, User, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLeads, leadKeys } from "@/lib/hooks/query-lead";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

const pipelineStages = [
  { id: "last18", label: "LAST 18", color: "bg-blue-500" },
  { id: "submitted", label: "SUBMITTED", color: "bg-slate-500" },
  { id: "interview", label: "INTERVIEW", color: "bg-amber-500" },
  { id: "offer", label: "OFFER OUT", color: "bg-orange-500" },
  { id: "accepted", label: "ACCEPTED", color: "bg-green-500" },
];

export default function CandidatesPage() {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");

  const { data: leads = [], isLoading, error } = useLeads();

  const filteredCandidates = leads.filter((lead: any) =>
    lead.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    lead.location?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    lead.title?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: leadKeys.lists() });
    toast.success("Candidates refreshed");
  };

  // Pipeline counts (you can expand this logic)
  const pipelineCounts = {
    last18: filteredCandidates.length,
    submitted: filteredCandidates.filter((c: any) => c.status === "submitted").length,
    interview: filteredCandidates.filter((c: any) => c.status === "interview").length,
    offer: filteredCandidates.filter((c: any) => c.status === "offer").length,
    accepted: filteredCandidates.filter((c: any) => c.status === "accept").length,
  };

  if (isLoading) {
    return <div className="p-8 text-center">Loading candidates...</div>;
  }

  return (
    <div className="flex h-full">
      {/* Main Content */}
      <div className="flex-1 p-8 space-y-8 overflow-auto">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Candidates</h1>
            <p className="text-muted-foreground">Manage your talent pipeline</p>
          </div>
          <Button onClick={handleRefresh} variant="outline">
            <RefreshCw className="mr-2 h-4 w-4" /> Refresh
          </Button>
        </div>

        {/* Pipeline Summary */}
        <div className="grid grid-cols-5 gap-4">
          {pipelineStages.map((stage) => (
            <Card key={stage.id} className="text-center">
              <CardContent className="pt-6">
                <div className={`mx-auto w-3 h-3 rounded-full ${stage.color} mb-2`} />
                <p className="text-3xl font-bold">{pipelineCounts[stage.id as keyof typeof pipelineCounts]}</p>
                <p className="text-sm text-muted-foreground">{stage.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Search + Add Button */}
        <div className="flex gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search candidates..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Button asChild>
            <Link href="/candidates/new">
              <Plus className="mr-2 h-4 w-4" /> Add Candidate
            </Link>
          </Button>
        </div>

        {/* Candidates Grid */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {filteredCandidates.map((candidate: any) => (
            <Card key={candidate.id} className="hover:shadow-md transition-all">
              <CardContent className="pt-6">
                <Link href={`/candidates/${candidate.id}`} className="block">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="font-semibold text-lg">{candidate.name}</h3>
                      {candidate.title && <p className="text-sm text-muted-foreground">{candidate.title}</p>}
                    </div>
                    <Badge variant="outline">{candidate.status || "New"}</Badge>
                  </div>

                  {candidate.location && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                      <MapPin className="h-4 w-4" /> {candidate.location}
                    </div>
                  )}
                  {candidate.email && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Mail className="h-4 w-4" /> {candidate.email}
                    </div>
                  )}
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>

        {filteredCandidates.length === 0 && (
          <div className="text-center py-20">
            <User className="mx-auto h-16 w-16 text-muted-foreground mb-4" />
            <p>No candidates found</p>
          </div>
        )}
      </div>

      {/* Right Sidebar - Quick Actions + Recent Activity */}
      <div className="w-80 border-l bg-card p-6 space-y-8 hidden lg:block">
        <div>
          <h3 className="font-semibold mb-4">Quick Actions</h3>
          <div className="space-y-3">
            <Button className="w-full justify-start" variant="outline">
              <Plus className="mr-2 h-4 w-4" /> Add New Candidate
            </Button>
            <Button className="w-full justify-start" variant="outline">
              <Mail className="mr-2 h-4 w-4" /> Send Bulk Email
            </Button>
          </div>
        </div>

        <div>
          <h3 className="font-semibold mb-4">Recent Activity</h3>
          <div className="space-y-4 text-sm">
            {/* You can make this dynamic later */}
            <div>• New candidate added today</div>
            <div>• 3 candidates moved to Interview</div>
          </div>
        </div>
      </div>
    </div>
  );
}
