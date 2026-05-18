"use client";

import { useState, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Search, Loader2, User, Mail, Phone, Linkedin, MapPin, Briefcase, Plus, FileText, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useCreateLead } from "@/lib/hooks/query-lead";
import { toast } from "sonner";

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
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState("Boca Raton, FL");
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<Candidate[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  // Add Candidate Form State
  const [showAddForm, setShowAddForm] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    title: "",
    company: "",
    linkedin_url: "",
    notes: "",
  });
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const createLead = useCreateLead();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type === "application/pdf") {
      setResumeFile(file);
    } else if (file) {
      toast.error("Please upload a PDF file");
    }
  };

  const handleAddCandidate = async () => {
    if (!formData.name) {
      toast.error("Name is required");
      return;
    }

    try {
      const formDataToSend = new FormData();
      formDataToSend.set("name", formData.name);
      formDataToSend.set("email", formData.email);
      formDataToSend.set("phone", formData.phone);
      formDataToSend.set("title", formData.title);
      formDataToSend.set("company", formData.company);
      formDataToSend.set("linkedin_url", formData.linkedin_url);
      formDataToSend.set("notes", formData.notes);
      formDataToSend.set("source", "manual_entry");

      if (resumeFile) {
        formDataToSend.set("resume", resumeFile);
      }

      await createLead.mutateAsync(formDataToSend);

      toast.success(`${formData.name} added successfully!`);
      setShowAddForm(false);
      setFormData({ name: "", email: "", phone: "", title: "", company: "", linkedin_url: "", notes: "" });
      setResumeFile(null);

      // Refresh queries
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['pipeline'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
    } catch (err: any) {
      console.error("Failed to add candidate:", err);
      toast.error(`Failed to add candidate: ${err.message}`);
    }
  };

  const searchCandidates = async () => {
    if (!query.trim()) return;

    setIsLoading(true);
    setError(null);
    setHasSearched(true);
    setResults([]);

    try {
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
      toast.success(`Found ${candidates.length} candidates via AI`);

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

      queryClient.invalidateQueries({ queryKey: ['leads'], refetchType: 'all' });
      queryClient.invalidateQueries({ queryKey: ['dashboard'], refetchType: 'all' });
      queryClient.invalidateQueries({ queryKey: ['stats'], refetchType: 'all' });
      queryClient.invalidateQueries({ queryKey: ['pipeline'], refetchType: 'all' });
      queryClient.invalidateQueries({ queryKey: ['clients'], refetchType: 'all' });
      
      toast.success(`Added ${candidate.name} to leads!`);
    } catch (err) {
      console.error("Error adding lead:", err);
      toast.error("Failed to add candidate to leads");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Candidates</h1>
          <p className="text-muted-foreground">
            Find candidates/contacts for your pipeline.
          </p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            onClick={() => {
              queryClient.invalidateQueries({ queryKey: ['leads'] });
              queryClient.invalidateQueries({ queryKey: ['pipeline'] });
              queryClient.invalidateQueries({ queryKey: ['dashboard'] });
              queryClient.invalidateQueries({ queryKey: ['stats'] });
            }}
          >
            Refresh
          </Button>
          <Button onClick={() => setShowAddForm(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add New Candidate
          </Button>
        </div>
      </div>

      {/* Add Candidate Form */}
      {showAddForm && (
        <div className="p-6 rounded-lg border border-border bg-card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Add New Candidate</h2>
            <button 
              onClick={() => setShowAddForm(false)}
              className="p-2 hover:bg-accent rounded-lg"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">Full Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="John Smith"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="john.smith@company.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="(555) 123-4567"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="title">Job Title</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="Senior Software Engineer"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="company">Company</Label>
              <Input
                id="company"
                value={formData.company}
                onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                placeholder="Acme Corp"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="linkedin">LinkedIn URL</Label>
              <Input
                id="linkedin"
                value={formData.linkedin_url}
                onChange={(e) => setFormData({ ...formData, linkedin_url: e.target.value })}
                placeholder="https://linkedin.com/in/johnsmith"
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="resume">Resume (PDF)</Label>
              <div className="flex items-center gap-4">
                <input
                  type="file"
                  ref={fileInputRef}
                  accept=".pdf"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="mr-2 h-4 w-4" />
                  {resumeFile ? "Change File" : "Upload Resume"}
                </Button>
                {resumeFile && (
                  <div className="flex items-center gap-2 text-sm text-green-600">
                    <FileText className="h-4 w-4" />
                    {resumeFile.name}
                    <button
                      type="button"
                      onClick={() => setResumeFile(null)}
                      className="p-1 hover:bg-accent rounded"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Additional notes about this candidate..."
                rows={3}
              />
            </div>
          </div>
          
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setShowAddForm(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleAddCandidate}
              disabled={!formData.name || createLead.isPending}
            >
              {createLead.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Adding...
                </>
              ) : (
                <>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Candidate
                </>
              )}
            </Button>
          </div>
        </div>
      )}

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
          <p>Enter your search criteria above to find candidates, or click "Add New Candidate" to manually add.</p>
        </div>
      )}
    </div>
  );
}
