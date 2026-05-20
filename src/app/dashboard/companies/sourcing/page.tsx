/**
 * Company Sourcing Page
 * Search companies via AI Apollo and add to companies list
 */

"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Search, Loader2, Building2, Building, MapPin, Users, Globe, Linkedin, Mail, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { SimpleDialog } from "@/components/ui/simple-dialog";
import { useCreateClient } from "@/lib/hooks/query-client";
import { toast } from "sonner";

interface CompanyResult {
  id: string;
  name: string;
  domain?: string;
  industry?: string;
  description?: string;
  employee_count?: number;
  revenue?: string;
  city?: string;
  state?: string;
  country?: string;
  linkedin_url?: string;
  phone?: string;
  email?: string;
}

export default function CompanySourcingPage() {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<CompanyResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  
  // Preview modal state
  const [previewCompany, setPreviewCompany] = useState<CompanyResult | null>(null);

  // Create client mutation hook
  const createClientMutation = useCreateClient();

  const addToCompanies = async (company: CompanyResult) => {
    // Build client data object
    const clientData = {
      name: company.name || "",
      domain: company.domain || "",
      industry: company.industry || "",
      description: company.description || "",
      employee_count: company.employee_count?.toString() || "",
      revenue: company.revenue || "",
      city: company.city || "",
      state: company.state || "",
      country: company.country || "US",
      linkedin_url: company.linkedin_url || "",
      phone: company.phone || "",
      email: company.email || `${Date.now()}@placeholder.com`,
    };

    try {
      // Check session first
      const sessionRes = await fetch("/api/auth/session", {
        method: "GET",
        credentials: "include",
      });

      if (!sessionRes.ok) {
        toast.error("Please log in to add companies");
        window.location.href = "/login?redirect=/dashboard/companies/sourcing";
        return;
      }

      const session = await sessionRes.json();

      if (!session?.userId) {
        toast.error("Please log in to add companies");
        window.location.href = "/login?redirect=/dashboard/companies/sourcing";
        return;
      }

      // Create the client via FormData
      const formData = new FormData();
      Object.entries(clientData).forEach(([key, value]) => {
        if (value) formData.set(key, value);
      });

      // Use mutation
      await createClientMutation.mutateAsync(formData);

      toast.success(`Added ${clientData.name} to Companies!`);
    } catch (err: any) {
      console.error("Failed to add company:", err);
      if (err.message?.includes("401")) {
        toast.error("Session expired. Please log in again.");
        window.location.href = "/login?redirect=/dashboard/companies/sourcing";
      } else {
        toast.error(`Failed to add ${company.name}. Please try again.`);
      }
    }
  };

  const searchCompanies = async () => {
    if (!query.trim()) {
      toast.error("Please enter a search query");
      return;
    }

    setIsLoading(true);
    setError(null);
    setHasSearched(true);
    setResults([]);

    try {
      // Use AI Apollo / Bedrock for company search
      const response = await fetch("/api/bedrock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{
            role: "user",
            content: `Find companies for B2B sales/sourcing. Search: "${query}" ${location ? `in ${location}` : ''}.
Search Apollo for companies, get their names, domains, industries, employee counts, locations, LinkedIn pages.
Return structured list: Company Name | Domain | Industry | Employee Count | Location | LinkedIn | Phone
Focus on finding successful companies in the ${query} space.`
          }],
          useTools: true,
          model: "global.anthropic.claude-sonnet-4-6"
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.details || errorData.message || errorData.error || `Bedrock Error ${response.status}`);
      }

      const data = await response.json();
      
      // Parse AI response
      let companies: CompanyResult[] = [];
      
      if (data.response) {
        const lines = data.response.split('\n').filter((l: string) => l.trim());
        companies = lines.slice(0, 15).map((line: string, i: number) => {
          const parts = line.split(/[|||,]/).map((p: string) => p.trim());
          return {
            id: `ai-${i}`,
            name: parts[0] || `Company ${i}`,
            domain: parts[1] || "",
            industry: parts[2] || query,
            employee_count: parseInt(parts[3]) || 0,
            city: location?.split(',')[0] || parts[4] || "",
            state: location?.split(',')[1]?.trim() || parts[5] || "",
            country: "US",
            linkedin_url: parts[6] || "",
            phone: parts[7] || "",
            description: `${query} company`,
          };
        }).filter((c: CompanyResult) => c.name && c.name !== `Company ${c.id?.split('-')[1]}`);
      }

      setResults(companies);
      toast.success(`Found ${companies.length} companies via AI`);

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
        <h1 className="text-3xl font-bold">Company Sourcing</h1>
        <p className="text-muted-foreground">
          Find companies to add to your list using AI-powered search.
        </p>
      </div>

      {/* Search Form */}
      <div className="p-6 rounded-lg border border-border bg-card">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="query">Industry / Keywords</Label>
            <Input
              id="query"
              placeholder="e.g. construction, SaaS, healthcare, manufacturing..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && searchCompanies()}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="location">Location</Label>
            <Input
              id="location"
              placeholder="e.g. Miami, FL or Remote"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && searchCompanies()}
            />
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
                  Search Companies
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
            onClick={() => { setQuery("construction"); setLocation(""); searchCompanies(); }}
            disabled={isLoading}
          >
            🏗️ Construction
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setQuery("software"); setLocation(""); searchCompanies(); }}
            disabled={isLoading}
          >
            💻 Software / Tech
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setQuery("healthcare"); setLocation(""); searchCompanies(); }}
            disabled={isLoading}
          >
            🏥 Healthcare
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setQuery("manufacturing"); setLocation(""); searchCompanies(); }}
            disabled={isLoading}
          >
            🏭 Manufacturing
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setQuery("finance"); setLocation(""); searchCompanies(); }}
            disabled={isLoading}
          >
            💰 Finance
          </Button>
        </div>

        <p className="text-xs text-muted-foreground mt-2">
          Tip: Use specific industries like "construction", "healthcare", "manufacturing"
        </p>
      </div>

      {/* Status Indicator */}
      <div className="text-xs p-2 rounded bg-green-100 border border-green-300 text-green-700">
        ✅ AI-Powered Company Search (Claude Sonnet 4.6 on Bedrock + Apollo)
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
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Building2 className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-medium">{company.name}</h3>
                    <div className="flex items-center gap-3 text-sm text-muted-foreground">
                      {company.industry && (
                        <span className="flex items-center gap-1">
                          {company.industry}
                        </span>
                      )}
                      {company.employee_count && (
                        <span className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {company.employee_count} employees
                        </span>
                      )}
                      {company.city && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {company.city}, {company.state}
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
                  {company.domain && (
                    <a
                      href={`https://${company.domain}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1 text-sm text-primary hover:underline"
                    >
                      Website
                    </a>
                  )}
<Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPreviewCompany(company)}
                  >
                    <Building className="mr-1 h-4 w-4" />
                    Add to Companies
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

      {/* Company Preview Modal */}
      <SimpleDialog
        open={!!previewCompany}
        onOpenChange={(open) => !open && setPreviewCompany(null)}
        title="Add Company to List"
        description="Review company details before adding to your companies list."
        footer={
          <>
            <Button variant="outline" onClick={() => setPreviewCompany(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (previewCompany) {
                  addToCompanies(previewCompany);
                  setPreviewCompany(null);
                }
              }}
              disabled={createClientMutation.isPending}
            >
              {createClientMutation.isPending ? "Adding..." : "Confirm & Add to Companies"}
            </Button>
          </>
        }
      >
        {previewCompany && (
          <div className="space-y-4">
            {/* Company Details */}
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Building2 className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-lg">{previewCompany.name}</h3>
                  {previewCompany.industry && (
                    <p className="text-sm text-muted-foreground">{previewCompany.industry}</p>
                  )}
                  {previewCompany.domain && (
                    <Badge variant="secondary" className="mt-1">
                      {previewCompany.domain}
                    </Badge>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 p-4 rounded-lg bg-muted/50">
                {previewCompany.employee_count && (
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">
                      {previewCompany.employee_count} employees
                    </span>
                  </div>
                )}
                {previewCompany.city && (
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">
                      {previewCompany.city}, {previewCompany.state}
                    </span>
                  </div>
                )}
                {previewCompany.linkedin_url && (
                  <div className="flex items-center gap-2">
                    <Linkedin className="h-4 w-4 text-muted-foreground" />
                    <a
                      href={previewCompany.linkedin_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-medium text-primary hover:underline"
                    >
                      LinkedIn Page
                    </a>
                  </div>
                )}
                {previewCompany.domain && (
                  <div className="flex items-center gap-2">
                    <Globe className="h-4 w-4 text-muted-foreground" />
                    <a
                      href={`https://${previewCompany.domain}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-medium text-primary hover:underline"
                    >
                      Website
                    </a>
                  </div>
                )}
              </div>

              {/* Client Details That Will Be Created */}
              <div className="p-4 rounded-lg border border-border">
                <h4 className="text-sm font-medium mb-3">Company Details</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Source:</span>
                    <Badge variant="outline">Apollo Company Sourcing</Badge>
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
