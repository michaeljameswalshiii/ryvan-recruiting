/**
 * Sourcing Page
 * Search companies via Apollo API and add to pipeline
 */

"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Search, Loader2, Building2, MapPin, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCreateLead } from "@/lib/hooks/query-lead";
import { toast } from "sonner";

interface Company {
  id: string;
  name: string;
  domain?: string;
  linkedin_url?: string;
  city?: string;
  state?: string;
  country?: string;
  employee_count?: number;
  industry?: string;
}

export default function SourcingPage() {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("construction");
  const [location, setLocation] = useState("Boca Raton, FL");
  const [employeeCount, setEmployeeCount] = useState("1-100");
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<Company[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  // Create lead mutation hook
  const createLead = useCreateLead();

  const addToPipeline = async (company: Company) => {
    // Build lead data object
    const leadData = {
      name: company.name || "",
      company: company.name || "",
      title: "Decision Maker / Owner",
      email: company.domain ? `info@${company.domain}` : "",
      phone: "",
      source: "apollo_sourcing",
      status: "new",
      linkedin_url: company.linkedin_url || "",
      city: company.city || "",
      state: company.state || "",
      industry: company.industry || "",
    };

    try {
      // Check session first
      const sessionRes = await fetch("/api/auth/session", {
        method: "GET",
        credentials: "include",
      });

      if (!sessionRes.ok) {
        toast.error("Please log in to add companies to pipeline");
        window.location.href = "/login?redirect=/dashboard/sourcing";
        return;
      }

      const session = await sessionRes.json();

      if (!session?.userId) {
        toast.error("Please log in to add companies to pipeline");
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

      toast.success(`Added ${company.name} to Pipeline!`);
    } catch (err: any) {
      console.error("Failed to add lead:", err);
      if (err.message?.includes("401")) {
        toast.error("Session expired. Please log in again.");
        window.location.href = "/login?redirect=/dashboard/sourcing";
      } else {
        toast.error(`Failed to add ${company.name}. Please try again.`);
      }
    }
  };

const searchCompanies = async () => {
    if (!query.trim()) return;

    setIsLoading(true);
    setError(null);
    setHasSearched(true);
    setResults([]);

    try {
      // Use AI Apollo / Bedrock with native MCP tool calling
      const response = await fetch("/api/bedrock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{
            role: "user",
            content: `Find companies for sourcing. Query: "${query}" in ${location}, company size: ${employeeCount} employees.
Search Apollo for companies, get their domain, LinkedIn, emails, phones.
Return structured list: Company Name | Location | Size | Industry | Domain | LinkedIn`
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
      
      // Parse AI response - try to extract structured company data
      let companies: Company[] = [];
      
      if (data.response) {
        // Parse response lines looking for company info
        const lines = data.response.split('\n').filter((l: string) => l.trim());
        companies = lines.slice(0, 15).map((line: string, i: number) => {
          // Try to extract parts from the line
          const parts = line.split(/[|||,]/).map((p: string) => p.trim());
          return {
            id: `ai-${i}`,
            name: parts[0] || `Company ${i}`,
            domain: parts[4] || "",
            linkedin_url: parts[5] || "",
            city: location.split(',')[0],
            state: location.split(',')[1]?.trim() || "",
            country: "US",
            employee_count: parseInt(employeeCount.split('-')[0]) || 100,
            industry: query,
          };
        }).filter((c: Company) => c.name);
      }

      setResults(companies);
      toast.success(`Found ${companies.length} sourcing targets via AI`);

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
        <h1 className="text-3xl font-bold">Sourcing</h1>
        <p className="text-muted-foreground">
          Find companies to target for business development.
        </p>
      </div>

      {/* Search Form */}
      <div className="p-6 rounded-lg border border-border bg-card">
        <div className="grid gap-4 md:grid-cols-4">
          <div className="space-y-2">
            <Label htmlFor="query">Keyword</Label>
            <Input
              id="query"
              placeholder="construction company, dental clinic, hvac, staffing agency, software firm..."
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
          <div className="space-y-2">
            <Label htmlFor="employeeCount">Company Size</Label>
            <select
              id="employeeCount"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={employeeCount}
              onChange={(e) => setEmployeeCount(e.target.value)}
            >
              <option value="1-10">1-10 employees</option>
              <option value="11-50">11-50 employees</option>
              <option value="51-200">51-200 employees</option>
              <option value="201-500">201-500 employees</option>
              <option value="501-1000">501-1000 employees</option>
              <option value="1001-5000">1001-5000 employees</option>
              <option value="5001-10000">5001-10000 employees</option>
              <option value="10001+">10001+ employees</option>
            </select>
          </div>
          <div className="flex items-end">
            <Button onClick={searchCompanies} disabled={isLoading} className="w-full">
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

        {/* Quick Search Buttons */}
        <div className="flex flex-wrap gap-2 mt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setQuery("construction"); setEmployeeCount("1-100"); searchCompanies(); }}
            disabled={isLoading}
          >
            🏗️ Construction
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setQuery("dental clinic"); setEmployeeCount("1-50"); searchCompanies(); }}
            disabled={isLoading}
          >
            🦷 Dental/Medical
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setQuery("software"); setEmployeeCount("1-100"); searchCompanies(); }}
            disabled={isLoading}
          >
            💻 Software & IT
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setQuery("staffing agency"); setEmployeeCount("1-50"); searchCompanies(); }}
            disabled={isLoading}
          >
            👥 Staffing
          </Button>
        </div>

        {/* Tip */}
        <p className="text-xs text-muted-foreground mt-2">
          Tip: Use specific terms like "dental clinic", "general contractor", "HVAC company", "staffing agency"
        </p>
      </div>

{/* Status Indicator */}
      <div className="text-xs p-2 rounded bg-green-100 border border-green-300 text-green-700">
        ✅ AI-Powered Sourcing (Claude Sonnet 4.6 on Bedrock + Apollo)
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
              Found {results.length} companies
            </h2>
          </div>
          <div className="divide-y divide-border">
            {results.map((company) => (
              <div
                key={company.id}
                className="p-4 flex items-center justify-between hover:bg-accent/50"
              >
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <Building2 className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-medium">{company.name}</h3>
                    <div className="flex items-center gap-3 text-sm text-muted-foreground">
                      {company.city && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {company.city}, {company.state}
                        </span>
                      )}
                      {company.employee_count && (
                        <span className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {company.employee_count} employees
                        </span>
                      )}
                      {company.industry && (
                        <span className="text-primary">
                          {company.industry}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {company.linkedin_url && (
                    <a
                      href={company.linkedin_url}
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
                    onClick={() => addToPipeline(company)}
                    disabled={createLead.isPending}
                  >
                    {createLead.isPending ? "Adding..." : "Add to Pipeline"}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {hasSearched && results.length === 0 && !isLoading && (
        <div className="p-8 text-center text-muted-foreground">
          No companies found. Try adjusting your search criteria.
        </div>
      )}

      {!hasSearched && (
        <div className="p-8 text-center text-muted-foreground">
          <Search className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>Enter your search criteria above to find companies.</p>
        </div>
      )}
    </div>
  );
}
