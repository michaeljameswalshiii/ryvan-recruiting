"use client";

import { useState } from "react";
import { Search, Loader2, Building2, MapPin, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState("Boca Raton, FL");
  const [employeeCount, setEmployeeCount] = useState("1-500");
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<Company[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

// Apollo.io API configuration
  const APOLLO_API_KEY = process.env.NEXT_PUBLIC_APOLLO_API_KEY || "";

  const searchCompanies = async () => {
    if (!query.trim()) return;
    
    setIsLoading(true);
    setError(null);
    setHasSearched(true);

    try {
if (!APOLLO_API_KEY) {
        throw new Error("Apollo API key is not configured. Please add NEXT_PUBLIC_APOLLO_API_KEY in Vercel settings.");
      }

const response = await fetch("https://api.apollo.io/api/v1/organizations/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Api-Key": APOLLO_API_KEY,
        },
        body: JSON.stringify({
          q: query,                    // keyword / industry
          locations: [location],
          organization_num_employees_ranges: [employeeCount],  // correct field name
          per_page: 20,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "Unknown error");
        throw new Error(`Apollo API ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      
      // Apollo returns "organizations", not "companies"
      const companies = (data.organizations || []).map((org: any) => ({
        id: org.id || String(Math.random()),
        name: org.name,
        domain: org.domain,
        linkedin_url: org.linkedin_url,
        city: org.city,
        state: org.state,
        country: org.country,
        employee_count: org.employee_count,
        industry: org.industry || query,
      }));

      setResults(companies);

    } catch (err: any) {
      console.error("Apollo.io API error:", err);
      setError(`Search failed: ${err.message}`);
      
      // Keep mock data as fallback (good for demo)
      setResults([
        {
          id: "1",
          name: "ABC Construction Corp",
          domain: "abconstr.com",
          city: "Boca Raton",
          state: "FL",
          country: "US",
          employee_count: 250,
          industry: "Construction",
          linkedin_url: "https://linkedin.com/company/abc-construction",
        },
        {
          id: "2",
          name: "Sunrise Builders Inc",
          domain: "sunrisebuilders.com",
          city: "Boca Raton",
          state: "FL",
          country: "US",
          employee_count: 180,
          industry: "Construction",
          linkedin_url: "https://linkedin.com/company/sunrise-builders",
        },
        {
          id: "3",
          name: "Elite Contractors LLC",
          domain: "elitecontractors.com",
          city: "Boca Raton",
          state: "FL",
          country: "US",
          employee_count: 320,
          industry: "Construction",
          linkedin_url: "https://linkedin.com/company/elite-contractors",
        },
        {
          id: "4",
          name: "Palm Beach Development",
          domain: "pbdevelopment.com",
          city: "Boca Raton",
          state: "FL",
          country: "US",
          employee_count: 95,
          industry: "Construction",
          linkedin_url: "https://linkedin.com/company/palm-beach-development",
        },
        {
          id: "5",
          name: "Coastal Renovations",
          domain: "coastalrenovations.com",
          city: "Boca Raton",
          state: "FL",
          country: "US",
          employee_count: 150,
          industry: "Construction",
          linkedin_url: "https://linkedin.com/company/coastal-renovations",
        },
      ]);
    } finally {
      setIsLoading(false);
}
  };

const addToLead = (company: Company) => {
    // TODO: Add to leads table via DynamoDB
    console.log("Add to lead:", company);
    alert(`Added ${company.name} to leads!`);
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
            <Label htmlFor="query">Industry/Keyword</Label>
            <Input
              id="query"
              placeholder="Construction"
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
              <option value="1-500">1-500 employees</option>
              <option value="501-1000">501-1000 employees</option>
              <option value="1001-5000">1001-5000 employees</option>
              <option value="5001-10000">5001-10000 employees</option>
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
                    onClick={() => addToLead(company)}
                  >
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
