"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Search, Loader2, User, Mail, Phone, Linkedin, MapPin, Briefcase, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Candidate {
  id: string;
  name: string;
  title?: string;
  organization?: string;
  email?: string;
  phone?: string;
  linkedin_url?: string;
  location?: string;
  headline?: string;
}

export default function CandidatesPage() {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("")
  const [location, setLocation] = useState("Boca Raton, FL");
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<Candidate[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

const searchCandidates = async () => {
    if (!query.trim()) return;

    setIsLoading(true);
    setError(null);
    setHasSearched(true);
    setResults([]);

    try {
      // Use Claude-powered search with Bedrock MCP agent
      const response = await fetch("/api/bedrock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{
            role: "user",
            content: `Search for candidates matching: "${query}" in or near "${location}". 
Focus on finding qualified candidates with their contact info.
Return structured results with name, title, company, location, LinkedIn, email if available.`
          }],
          useTools: true,
          model: "global.anthropic.claude-sonnet-4-6"
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.details || errorData.error || "Search failed");
      }

      const data = await response.json();

      // Parse AI response - extract candidate info
      let candidates: Candidate[] = [];
      
      if (data.response) {
        const lines = data.response.split('\n').filter((l: string) => l.trim());
        candidates = lines.slice(0, 15).map((line: string, i: number) => {
          const parts = line.split(/[|||,]/).map((p: string) => p.trim());
          return {
            id: `ai-${i}`,
            name: parts[0] || `Candidate ${i}`,
            title: parts[1] || "",
            organization: parts[2] || "",
            email: parts[3] || "",
            phone: "",
            linkedin_url: parts[4] || "",
            location: location,
            headline: line,
          };
        }).filter((c: Candidate) => c.name && c.name !== `Candidate ${c.id}`);
      }

      setResults(candidates);
      alert(`Found ${candidates.length} candidates via AI`);

    } catch (err: any) {
      console.error("Search error:", err);
      setError(`Search failed: ${err.message || "Check AWS Bedrock"}`);
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  };

const addToLead = async (candidate: Candidate) => {
    try {
      const response = await fetch("/api/data/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: candidate.name,
          email: candidate.email || "",
          phone: candidate.phone || "",
          company: candidate.organization || "",
          title: candidate.title || "",
          source: "apollo",
          linkedin_url: candidate.linkedin_url || "",
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to save lead");
      }

// Invalidate queries so dashboard stats update
      queryClient.invalidateQueries({ queryKey: ['leads'], refetchType: 'all' });
      queryClient.invalidateQueries({ queryKey: ['dashboard'], refetchType: 'all' });
      queryClient.invalidateQueries({ queryKey: ['stats'], refetchType: 'all' });
      // Also invalidate pipeline (leads and pipeline share data)
      queryClient.invalidateQueries({ queryKey: ['pipeline'], refetchType: 'all' });
      queryClient.invalidateQueries({ queryKey: ['clients'], refetchType: 'all' });
      
      alert(`Added ${candidate.name} to leads!`);
    } catch (err) {
      console.error("Error adding lead:", err);
      alert("Failed to add candidate to leads");
    }
  };

  return (
    <div className="space-y-6">
      <div>
<h1 className="text-3xl font-bold">Candidates</h1>
        <p className="text-muted-foreground">
          Find candidates/contacts for your pipeline.
        </p>
<Button variant="outline" onClick={() => {
          queryClient.invalidateQueries({ queryKey: ['leads'] });
          queryClient.invalidateQueries({ queryKey: ['pipeline'] });
          queryClient.invalidateQueries({ queryKey: ['dashboard'] });
          queryClient.invalidateQueries({ queryKey: ['stats'] });
        }} className="ml-4">
          Refresh
        </Button>
      </div>

      {/* Search Form */}
      <div className="p-6 rounded-lg border border-border bg-card">
        <div className="grid gap-4 md:grid-cols-4">
          <div className="space-y-2">
            <Label htmlFor="query">Job Title / Role</Label>
            <Input
              id="query"
              placeholder="Software Engineer"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="location">Location</Label>
            <Input
              id="location"
              placeholder="Boca Raton, FL"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </div>
          <div className="flex items-end">
            <Button onClick={searchCandidates} disabled={isLoading} className="w-full">
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Searching...
                </>
              ) : (
                <>
                  <Search className="mr-2 h-4 w-4" />
                  Search
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-md bg-destructive/10 text-destructive">
          {error}
        </div>
      )}

      {/* Results */}
      {results.length > 0 && (
        <div className="rounded-lg border border-border">
          <div className="p-4 border-b border-border">
            <h2 className="text-lg font-semibold">
              Found {results.length} candidates
            </h2>
          </div>
          <div className="divide-y divide-border">
            {results.map((candidate) => (
              <div
                key={candidate.id}
                className="p-4 flex items-center justify-between hover:bg-accent/50"
              >
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <User className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-medium">{candidate.name}</h3>
                    <div className="flex items-center gap-3 text-sm text-muted-foreground">
                      {candidate.title && (
                        <span className="flex items-center gap-1">
                          <Briefcase className="h-3 w-3" />
                          {candidate.title}
                          {candidate.organization && ` at ${candidate.organization}`}
                        </span>
                      )}
                      {candidate.location && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {candidate.location}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {candidate.email && (
                    <a
                      href={`mailto:${candidate.email}`}
                      className="px-3 py-1 text-sm text-primary hover:underline"
                    >
                      <Mail className="h-4 w-4" />
                    </a>
                  )}
                  {candidate.linkedin_url && (
                    <a
                      href={candidate.linkedin_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1 text-sm text-primary hover:underline"
                    >
                      <Linkedin className="h-4 w-4" />
                    </a>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => addToLead(candidate)}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Add
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {hasSearched && results.length === 0 && !isLoading && (
        <div className="p-8 text-center text-muted-foreground">
          No candidates found. Try adjusting your search criteria.
        </div>
      )}

      {!hasSearched && (
        <div className="p-8 text-center text-muted-foreground">
          <Search className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>Enter your search criteria above to find candidates.</p>
        </div>
      )}
    </div>
  );
}
