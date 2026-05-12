/**
 * Companies Page
 * 100% database-driven using TanStack Query hooks
 */

"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Building2, MapPin, Users, Globe, Linkedin, Search, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SimpleDialog } from "@/components/ui/simple-dialog";
import { Skeleton } from "@/components/ui/skeleton";
// Use TanStack Query hooks - server actions for DB access
import { useClients, useCreateClient, clientKeys } from "@/lib/hooks/query-client";

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

const columns = [
  { id: "new", title: "New", color: "bg-blue-500" },
  { id: "contacted", title: "Contacted", color: "bg-yellow-500" },
  { id: "qualified", title: "Qualified", color: "bg-orange-500" },
  { id: "proposal", title: "Proposal", color: "bg-purple-500" },
  { id: "closed", title: "Closed Won", color: "bg-green-500" },
];

export default function CompaniesPage() {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);

  // Use TanStack Query hooks - fetches from DB via server actions
  const { data: clients = [], isLoading, error } = useClients();
  const createClientMutation = useCreateClient();

  // Form state
  const [newCompanyName, setNewCompanyName] = useState("");
  const [newCompanyDomain, setNewCompanyDomain] = useState("");
  const [newCompanyIndustry, setNewCompanyIndustry] = useState("");
  const [newCompanyCity, setNewCompanyCity] = useState("");
  const [newCompanyState, setNewCompanyState] = useState("");
  const [newCompanyEmployeeCount, setNewCompanyEmployeeCount] = useState("");
  const [newCompanyRevenue, setNewCompanyRevenue] = useState("");
  const [newCompanyDescription, setNewCompanyDescription] = useState("");

  // Filter clients based on search
  const filteredClients = clients.filter((client: any) =>
    client.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    client.industry?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    client.city?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Convert DB client to Company interface
  const companies: Company[] = filteredClients.map((c: any) => ({
    id: c.id,
    name: c.name || "",
    domain: c.domain || "",
    city: c.city || "",
    state: c.state || "",
    country: c.country || "",
    employee_count: c.employee_count || 0,
    industry: c.industry || "",
    revenue: c.revenue || "",
    description: c.description || "",
    linkedin_url: c.linkedin_url || "",
  }));

  const handleAddCompany = async () => {
    if (!newCompanyName) return;

    // Build FormData for server action
    const formData = new FormData();
    formData.set("name", newCompanyName);
    formData.set("email", `${Date.now()}@placeholder.com`);
    formData.set("domain", newCompanyDomain);
    formData.set("industry", newCompanyIndustry);
    formData.set("city", newCompanyCity);
    formData.set("state", newCompanyState);
    formData.set("country", "US");
    if (newCompanyEmployeeCount) {
      formData.set("employee_count", newCompanyEmployeeCount);
    }
    formData.set("revenue", newCompanyRevenue);
    formData.set("description", newCompanyDescription);

    // Use mutation - handles DB save + query invalidation + toast
    await createClientMutation.mutateAsync(formData);

    // Close dialog and reset form
    setIsAddDialogOpen(false);
    resetForm();
  };

  const resetForm = () => {
    setNewCompanyName("");
    setNewCompanyDomain("");
    setNewCompanyIndustry("");
    setNewCompanyCity("");
    setNewCompanyState("");
    setNewCompanyEmployeeCount("");
    setNewCompanyRevenue("");
    setNewCompanyDescription("");
  };

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: clientKeys.lists() });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    queryClient.invalidateQueries({ queryKey: ['stats'] });
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Companies</h1>
          <p className="text-muted-foreground">Manage your target companies.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="p-4 rounded-lg border border-border bg-card">
              <Skeleton className="h-12 w-12 rounded-lg mb-3" />
              <Skeleton className="h-4 w-3/4 mb-2" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          ))}
        </div>
      </div>
    );
  }

// Error state - show empty state for auth errors, error for actual failures
  const isAuthError = error?.message?.includes('Unauthorized') || error?.message?.includes('Unauthorized');

  if (error && !isAuthError) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Companies</h1>
          <p className="text-muted-foreground">Manage your target companies.</p>
        </div>
        <div className="p-4 rounded-md bg-destructive/10 text-destructive">
          Failed to load companies. Please try again.
          <Button variant="outline" onClick={handleRefresh} className="ml-4">
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Companies</h1>
          <p className="text-muted-foreground">
            Manage your target companies.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleRefresh}>
            Refresh
          </Button>
          <Button onClick={() => setIsAddDialogOpen(true)} disabled={createClientMutation.isPending}>
            <Plus className="mr-2 h-4 w-4" />
            {createClientMutation.isPending ? "Adding..." : "Add Company"}
          </Button>
        </div>
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
            <Button
              onClick={handleAddCompany}
              disabled={!newCompanyName || createClientMutation.isPending}
            >
              {createClientMutation.isPending ? "Adding..." : "Add Company"}
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
      {companies.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {companies.map((company) => (
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
      ) : (
        <div className="p-8 text-center text-muted-foreground">
          <Building2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>No companies yet.</p>
          <Button onClick={() => setIsAddDialogOpen(true)} className="mt-4">
            <Plus className="mr-2 h-4 w-4" />
            Add Your First Company
          </Button>
        </div>
      )}
    </div>
  );
}
