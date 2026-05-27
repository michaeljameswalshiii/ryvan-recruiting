/**
 * Candidates Public Page
 * Shows candidates without dashboard functionality
 */

"use client";

import { useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { User, Search, Plus, Mail, MapPin, Briefcase } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLeads, leadKeys } from "@/lib/hooks/query-lead";
import { toast } from "sonner";

// Pipeline stages
const pipelineStages = [
  { id: "identification", label: "Identification" },
  { id: "outreach", label: "Attempted Outreach" },
  { id: "conversation", label: "Conversation" },
  { id: "presented", label: "Candidate Presented" },
  { id: "interview", label: "Interview" },
  { id: "accept", label: "Accept" },
  { id: "rejected", label: "Rejected" },
];

function getStageLabel(status?: string): string {
  if (!status) return "New";
  const stage = pipelineStages.find(s => s.id === status);
  return stage?.label || status;
}

export default function CandidatesPage() {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");

  // Fetch candidates from API
  const { data: leads = [], isLoading, error } = useLeads();

  // Filter candidates based on search
  const filteredCandidates = leads.filter((lead: any) =>
    lead.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    lead.location?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    lead.title?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: leadKeys.lists() });
    toast.success("Refreshed");
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="container mx-auto py-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold mb-8">Candidates</h1>
          <p className="text-muted-foreground">Loading candidates...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="container mx-auto py-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold mb-8">Candidates</h1>
          <p className="text-destructive">Failed to load candidates: {error.message}</p>
          <Button onClick={handleRefresh} className="mt-4">
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Candidates</h1>
          <p className="text-muted-foreground">
            Browse our talent pipeline
          </p>
        </div>
        <Button variant="outline" onClick={handleRefresh}>
          Refresh
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search candidates by name, location, or title..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Candidates
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{filteredCandidates.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              In Identification
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {filteredCandidates.filter((c: any) => c.status === "identification").length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              In Interview
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {filteredCandidates.filter((c: any) => c.status === "interview").length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Accepted
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {filteredCandidates.filter((c: any) => c.status === "accept").length}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Candidate List */}
      {filteredCandidates.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredCandidates.map((candidate: any) => (
            <Card key={candidate.id} className="hover:border-primary transition-colors">
              <CardContent className="pt-4">
                <Link href={`/candidates/${candidate.id}`}>
                  <div className="space-y-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-semibold hover:text-primary transition-colors">
                          {candidate.name}
                        </h3>
                        {candidate.title && (
                          <p className="text-sm text-muted-foreground">
                            {candidate.title}
                          </p>
                        )}
                      </div>
                    </div>
                    
                    {candidate.location && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="h-3 w-3" />
                        <span>{candidate.location}</span>
                      </div>
                    )}

                    {candidate.email && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Mail className="h-3 w-3" />
                        <span>{candidate.email}</span>
                      </div>
                    )}

                    <Badge variant="outline" className="mt-2 text-xs">
                      {getStageLabel(candidate.status)}
                    </Badge>
                  </div>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="text-center py-12">
          <User className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
          <p className="text-muted-foreground">
            {searchQuery ? "No candidates match your search" : "No candidates yet"}
          </p>
        </div>
      )}
    </div>
  );
}
