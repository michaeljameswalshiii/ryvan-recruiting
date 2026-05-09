"use client";

import { useState } from "react";
import { Plus, Building2, MapPin, Users, Globe, Linkedin, Search, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SimpleDialog } from "@/components/ui/simple-dialog";

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
  revenue?: string;
  description?: string;
}

// Mock data for demo
const initialCompanies: Company[] = [
  {
    id: "1",
    name: "ABC Construction Corp",
    domain: "abconstr.com",
    linkedin_url: "https://linkedin.com/company/abc-construction",
    city: "Boca Raton",
    state: "FL",
    country: "US",
    employee_count: 250,
    industry: "Construction",
    revenue: "$25M-$50M",
    description: "General construction company specializing in commercial buildings",
  },
  {
    id: "2",
    name: "Sunrise Builders Inc",
    domain: "sunrisebuilders.com",
    linkedin_url: "https://linkedin.com/company/sunrise-builders",
    city: "Boca Raton",
    state: "FL",
    country: "US",
    employee_count: 180,
    industry: "Construction",
    revenue: "$10M-$25M",
    description: "Residential and commercial builder",
  },
  {
    id: "3",
    name: "Elite Contractors LLC",
    domain: "elitecontractors.com",
    linkedin_url: "https://linkedin.com/company/elite-contractors",
    city: "Boca Raton",
    state: "FL",
    country: "US",
    employee_count: 320,
    industry: "Construction",
    revenue: "$50M-$100M",
    description: "High-end commercial contractor",
  },
];

export default function CompaniesPage() {
  const [companies] = useState<Company[]>(initialCompanies);
  const [searchQuery, setSearchQuery] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  
  // New company form state
  const [newCompanyName, setNewCompanyName] = useState("");
  const [newCompanyDomain, setNewCompanyDomain] = useState("");
  const [newCompanyIndustry, setNewCompanyIndustry] = useState("");
  const [newCompanyCity, setNewCompanyCity] = useState("");
  const [newCompanyState, setNewCompanyState] = useState("");
  const [newCompanyEmployeeCount, setNewCompanyEmployeeCount] = useState("");
  const [newCompanyRevenue, setNewCompanyRevenue] = useState("");
  const [newCompanyDescription, setNewCompanyDescription] = useState("");

  const filteredCompanies = companies.filter((company) =>
    company.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    company.industry?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    company.city?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleAddCompany = () => {
    if (!newCompanyName) return;
    
    setIsAddDialogOpen(false);
    
    // Reset form
    setNewCompanyName("");
    setNewCompanyDomain("");
    setNewCompanyIndustry("");
    setNewCompanyCity("");
    setNewCompanyState("");
    setNewCompanyEmployeeCount("");
    setNewCompanyRevenue("");
    setNewCompanyDescription("");
    
    // Note: In a real app, we'd call an API to add the company
    // For demo, we just show a success message
    alert(`Company "${newCompanyName}" added! (Demo mode - data not persisted)`);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Companies</h1>
          <p className="text-muted-foreground">
            Manage your target companies.
          </p>
        </div>
        <Button onClick={() => setIsAddDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Company
        </Button>
      </div>

      {/* Add Company Dialog */}
      <SimpleDialog
        open={isAddDialogOpen}
        onOpenChange={setIsAddDialogOpen}
        title="Add New Company"
        description="Add a new target company to your list."
        footer={
          <>
            <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddCompany} disabled={!newCompanyName}>
              Add Company
            </Button>
          </>
        }
      >
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="companyName">Company Name *</Label>
            <Input
              id="companyName"
              value={newCompanyName}
              onChange={(e) => setNewCompanyName(e.target.value)}
              placeholder="ABC Construction Corp"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="domain">Website</Label>
            <Input
              id="domain"
              value={newCompanyDomain}
              onChange={(e) => setNewCompanyDomain(e.target.value)}
              placeholder="abconstr.com"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="industry">Industry</Label>
            <Input
              id="industry"
              value={newCompanyIndustry}
              onChange={(e) => setNewCompanyIndustry(e.target.value)}
              placeholder="Construction"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="grid gap-2">
              <Label htmlFor="city">City</Label>
              <Input
                id="city"
                value={newCompanyCity}
                onChange={(e) => setNewCompanyCity(e.target.value)}
                placeholder="Miami"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="state">State</Label>
              <Input
                id="state"
                value={newCompanyState}
                onChange={(e) => setNewCompanyState(e.target.value)}
                placeholder="FL"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="grid gap-2">
              <Label htmlFor="employees">Employees</Label>
              <Input
                id="employees"
                type="number"
                value={newCompanyEmployeeCount}
                onChange={(e) => setNewCompanyEmployeeCount(e.target.value)}
                placeholder="250"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="revenue">Revenue</Label>
              <Input
                id="revenue"
                value={newCompanyRevenue}
                onChange={(e) => setNewCompanyRevenue(e.target.value)}
                placeholder="$25M-$50M"
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={newCompanyDescription}
              onChange={(e) => setNewCompanyDescription(e.target.value)}
              placeholder="Brief description of the company..."
            />
          </div>
        </div>
      </SimpleDialog>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search companies..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Companies Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filteredCompanies.map((company) => (
          <div
            key={company.id}
            className="p-4 rounded-lg border border-border bg-card hover:border-primary/50 transition-colors"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                <Building2 className="h-6 w-6 text-primary" />
              </div>
              <button className="text-muted-foreground hover:text-foreground">
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </div>

            <h3 className="font-semibold mb-1">{company.name}</h3>
            
            {company.industry && (
              <p className="text-sm text-muted-foreground mb-3">
                {company.industry}
              </p>
            )}

            <div className="space-y-2 text-sm">
              {company.city && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <MapPin className="h-3 w-3" />
                  {company.city}, {company.state}
                </div>
              )}
              
              {company.employee_count && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Users className="h-3 w-3" />
                  {company.employee_count} employees
                </div>
              )}

              {company.revenue && (
                <div className="text-primary">
                  {company.revenue}
                </div>
              )}
            </div>

            {company.description && (
              <p className="mt-3 text-sm text-muted-foreground line-clamp-2">
                {company.description}
              </p>
            )}

            <div className="flex gap-2 mt-3 pt-3 border-t border-border">
              {company.linkedin_url && (
                <a
                  href={company.linkedin_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-sm text-muted-foreground hover:text-primary"
                >
                  <Linkedin className="h-4 w-4" />
                  LinkedIn
                </a>
              )}
              {company.domain && (
                <a
                  href={`https://${company.domain}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-sm text-muted-foreground hover:text-primary"
                >
                  <Globe className="h-4 w-4" />
                  Website
                </a>
              )}
            </div>
          </div>
        ))}
      </div>

      {filteredCompanies.length === 0 && (
        <div className="p-8 text-center text-muted-foreground">
          No companies found matching your search.
        </div>
      )}
    </div>
  );
}
