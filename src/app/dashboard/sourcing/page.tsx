/**
 * Candidate Sourcing Page
 * Search candidates (people) via AI Apollo and add to pipeline as leads
 */

"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Search, Loader2, User, MapPin, Briefcase, Mail, Phone, Linkedin, UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { SimpleDialog } from "@/components/ui/simple-dialog";
import { useCreateLead } from "@/lib/hooks/query-lead";
import { toast } from "sonner";

interface Candidate {
  id: string;
  name: string;
  first_name?: string;
  last_name?: string;
  title?: string;
  company?: string;
  email?: string;
  phone?: string;
  linkedin_url?: string;
  city?: string;
  state?: string;
  country?: string;
  industry?: string;
  skills?: string[];
}

export default function CandidateSourcingPage() {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<Candidate[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  
  // Preview modal state
  const [previewCandidate, setPreviewCandidate] = useState<Candidate | null>(null);

  // Create lead mutation hook
  const createLead = useCreateLead();

  const addToPipeline = async (candidate: Candidate) => {
    // Build lead data object - create as a candidate lead
    const leadData = {
      name: candidate.name || `${candidate.first_name || ''} ${candidate.last_name || ''}`.trim(),
      company: candidate.company || "",
      title: candidate.title || "Decision Maker",
      email: candidate.email || "",
      phone: candidate.phone || "",
      source: "apollo_candidate_sourcing",
      status: "new",
      linkedin_url: candidate.linkedin_url || "",
      city: candidate.city || "",
      state: candidate.state || "",
      industry: candidate.industry || "",
    };

    try {
      // Check session first
      const sessionRes = await fetch("/api/auth/session", {
        method: "GET",
        credentials: "include",
      });

      if (!sessionRes.ok) {
        toast.error("Please log in to add candidates to pipeline");
        window.location.href = "/login?redirect=/dashboard/sourcing";
        return;
      }

      const session = await sessionRes.json();

      if (!session?.userId) {
        toast.error("Please log in to add candidates to pipeline");
        window.location.href = "/login?redirect=/dashboard/sourcing";
        return;
      }

      // Create the lead via FormData
      const formData = new FormData();
      Object.entries(leadData).forEach(([key, value]) => {
        if (value) formData.set(key, value);
      });

      // Use mutation - handles DB save + query invalidation + toast
      await createLead.mutateAsync(formData);

      toast.success(`Added ${leadData.name} to Candidates Pipeline!`);
    } catch (err: any) {
      console.error("Failed to add lead:", err);
      if (err.message?.includes("401")) {
        toast.error("Session expired. Please log in again.");
        window.location.href = "/login?redirect=/dashboard/sourcing";
      } else {
        toast.error(`Failed to add ${candidate.name}. Please try again.`);
      }
    }
  };

  const searchCandidates = async () => {
    if (!query.trim()) {
      toast.error("Please enter a search query");
      return;
    }

    setIsLoading(true);
    setError(null);
    setHasSearched(true);
    setResults([]);

    try {
      // Use AI Apollo / Bedrock with native MCP tool calling for people search
      const response = await fetch("/api/bedrock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{
            role: "user",
            content: `Find candidates for hiring/sourcing. Search: "${query}" ${location ? `in ${location}` : ''}.
Search Apollo for people, get their names, titles, companies, emails, phones, LinkedIn profiles.
Return structured list: Name | Title | Company | Location | Email | Phone | LinkedIn
Focus on finding decision makers, executives, and professionals.`
          }],
          useTools: true,  // Use MCP agent with native tool calling
          model: "global.anthropic.claude-sonnet-4-6"
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.details || errorData.message || errorData.error || `Bedrock Error ${response.status}`);
      }

      const data = await response.json();
      
      // Parse AI response - try to extract structured candidate data
      let candidates: Candidate[] = [];
      
      if (data.response) {
        // Parse response lines looking for person info
        const lines = data.response.split('\n').filter((l: string) => l.trim());
        candidates = lines.slice(0, 15).map((line: string, i: number) => {
          // Try to extract parts from the line
          const parts = line.split(/[|||,]/).map((p: string) => p.trim());
          return {
            id: `ai-${i}`,
            name: parts[0] || `Candidate ${i}`,
            first_name: parts[0]?.split(' ')[0] || "",
last_name: parts[0]?.split(' ').slice(1).join(' ') || "",
            title: parts[1] || "",
            company: parts[2] || "",
            city: location?.split(',')[0] || parts[3] || "",
            state: location?.split(',')[1]?.trim() || parts[4] || "",
            country: "US",
            email: parts[5] || "",
            phone: parts[6] || "",
            linkedin_url: parts[7] || "",
            industry: query,
          };
        }).filter((c: Candidate) => c.name && c.name !== `Candidate ${c.id?.split('-')[1]}`);
      }

      setResults(candidates);
      toast.success(`Found ${candidates.length} candidates via AI`);

    } catch (err: any) {
      console.error("Search error:", err);
      setError(`Search failed: ${err.message || "Check AWS Bedrock configuration"}`);
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Candidate Sourcing</h1>
        <p className="text-muted-foreground">
          Find candidates to add to your pipeline using AI-powered search.
        </p>
      </div>

      {/* Search Form */}
      <div className="p-6 rounded-lg border border-border bg-card">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="query">Job Title / Skills / Keywords</Label>
            <Input
              id="query"
              placeholder="e.g. software engineer, sales director, marketing manager, CEO..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && searchCandidates()}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="location">Location</Label>
            <Input
              id="location"
              placeholder="e.g. San Francisco, CA or Remote"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && searchCandidates()}
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
                  Search Candidates
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Quick Search Buttons */}
        <div className="flex flex-wrap gap-2 mt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setQuery("software engineer"); setLocation(""); searchCandidates(); }}
            disabled={isLoading}
          >
            💻 Software Engineers
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setQuery("sales director"); setLocation(""); searchCandidates(); }}
            disabled={isLoading}
          >
            💰 Sales Directors
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setQuery("marketing manager"); setLocation(""); searchCandidates(); }}
            disabled={isLoading}
          >
            📢 Marketing Managers
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setQuery("CEO"); setLocation(""); searchCandidates(); }}
            disabled={isLoading}
          >
            👔 CEOs / Founders
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setQuery("product manager"); setLocation(""); searchCandidates(); }}
            disabled={isLoading}
          >
            📦 Product Managers
          </Button>
        </div>

        {/* Tip */}
        <p className="text-xs text-muted-foreground mt-2">
          Tip: Use specific job titles like "software engineer", "sales director", "marketing manager"
        </p>
      </div>

      {/* Status Indicator */}
      <div className="text-xs p-2 rounded bg-green-100 border border-green-300 text-green-700">
        ✅ AI-Powered Candidate Search (Claude Sonnet 4.6 on Bedrock + Apollo)
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
                        </span>
                      )}
                      {candidate.company && (
                        <span className="text-primary">
                          {candidate.company}
                        </span>
                      )}
                      {candidate.city && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {candidate.city}, {candidate.state}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {candidate.linkedin_url && (
                    <a
                      href={candidate.linkedin_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1 text-sm text-primary hover:underline"
                    >
                      LinkedIn
                    </a>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPreviewCandidate(candidate)}
                  >
                    <UserPlus className="mr-1 h-4 w-4" />
                    Add to Pipeline
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

      {/* Candidate Preview Modal */}
      <SimpleDialog
        open={!!previewCandidate}
        onOpenChange={(open) => !open && setPreviewCandidate(null)}
        title="Add Candidate to Pipeline"
        description="Review candidate details before adding to your pipeline."
        footer={
          <>
            <Button variant="outline" onClick={() => setPreviewCandidate(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (previewCandidate) {
                  addToPipeline(previewCandidate);
                  setPreviewCandidate(null);
                }
              }}
              disabled={createLead.isPending}
            >
              {createLead.isPending ? "Adding..." : "Confirm & Add to Pipeline"}
            </Button>
          </>
        }
      >
        {previewCandidate && (
          <div className="space-y-4">
            {/* Credit Notice */}
            <div className="p-3 rounded-md bg-amber-50 border border-amber-200 text-amber-800 text-sm">
              💡 Adding this candidate will consume 1 sourcing credit from Apollo
            </div>

            {/* Candidate Details */}
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <User className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-lg">{previewCandidate.name}</h3>
                  {previewCandidate.title && (
                    <p className="text-sm text-muted-foreground">{previewCandidate.title}</p>
                  )}
                  {previewCandidate.company && (
                    <Badge variant="secondary" className="mt-1">
                      {previewCandidate.company}
                    </Badge>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 p-4 rounded-lg bg-muted/50">
                {previewCandidate.email && (
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <a
                      href={`mailto:${previewCandidate.email}`}
                      className="text-sm font-medium text-primary hover:underline"
                    >
                      {previewCandidate.email}
                    </a>
                  </div>
                )}
                {previewCandidate.phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <a
                      href={`tel:${previewCandidate.phone}`}
                      className="text-sm font-medium text-primary hover:underline"
                    >
                      {previewCandidate.phone}
                    </a>
                  </div>
                )}
                {previewCandidate.city && (
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">
                      {previewCandidate.city}, {previewCandidate.state}
                    </span>
                  </div>
                )}
                {previewCandidate.linkedin_url && (
                  <div className="flex items-center gap-2">
                    <Linkedin className="h-4 w-4 text-muted-foreground" />
                    <a
                      href={previewCandidate.linkedin_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-medium text-primary hover:underline"
                    >
                      LinkedIn Profile
                    </a>
                  </div>
                )}
              </div>

              {/* Lead Details That Will Be Created */}
              <div className="p-4 rounded-lg border border-border">
                <h4 className="text-sm font-medium mb-3">Lead Details</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Source:</span>
                    <Badge variant="outline">Apollo Candidate Sourcing</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Status:</span>
                    <Badge>New</Badge>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </SimpleDialog>
    </div>
  );
}
