"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Search, Plus, RefreshCw, LayoutList, Kanban, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { IdBadge } from "@/components/ui/id-badge";
import { useClients, useUpdateClientStatus, useDeleteClient } from "@/lib/hooks/query-client";
import { SortableCompanyCard } from "@/components/company";
import { toast } from "sonner";

const companyStages = [
  { id: "targeting", label: "Targeting", color: "bg-blue-500" },
  { id: "active", label: "Active Client", color: "bg-green-500" },
  { id: "onhold", label: "On Hold", color: "bg-yellow-500" },
  { id: "past", label: "Past Client", color: "bg-purple-500" },
  { id: "closed", label: "Closed", color: "bg-red-500" },
];

export default function CompaniesPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "pipeline">("list");

const { data: companies = [], isLoading } = useClients();
  const updateStatus = useUpdateClientStatus();
  const deleteClient = useDeleteClient();

// ===== CHANGES ===== Handle delete company
  // ===== CHANGES =====
  const handleDeleteCompany = async (companyId: string) => {
    try {
      await deleteClient.mutateAsync(companyId);
    } catch (err) {
      toast.error("Failed to delete company");
    }
  };

  // ===== CHANGES ===== Handle edit company (stub for now)
  // ===== CHANGES =====
  const handleEditCompany = (company: any) => {
    // TODO: Wire up edit modal if needed
    console.log("Edit company:", company.id);
  };

  const filteredCompanies = useMemo(() => {
    return companies.filter((c: any) =>
      c.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.industry?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.location?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [companies, searchQuery]);

  const pipelineGroups = useMemo(() => {
    const groups: Record<string, any[]> = {
      targeting: [], active: [], onhold: [], past: [], closed: []
    };
    filteredCompanies.forEach((company: any) => {
      const status = (company.status || "targeting").toLowerCase();
      const stage = Object.keys(groups).find(key => status.includes(key)) || "targeting";
      groups[stage].push(company);
    });
    return groups;
  }, [filteredCompanies]);

  const pipelineCounts = {
    targeting: pipelineGroups.targeting.length,
    active: pipelineGroups.active.length,
    onhold: pipelineGroups.onhold.length,
    past: pipelineGroups.past.length,
    closed: pipelineGroups.closed.length,
  };

// === Move All to Active ===
  const moveAllToActive = async () => {
    if (!confirm("Move ALL companies to Active Client?")) return;
    
    try {
      await Promise.all(
        companies.map((company: any) =>
          updateStatus.mutateAsync({ clientId: company.id, status: "active" })
        )
      );
      toast.success("All companies moved to Active Client");
    } catch (err) {
      toast.error("Failed to update companies");
    }
  };

  if (isLoading) return <div className="p-8">Loading companies...</div>;

return (
    <div className="p-8 space-y-8 bg-background min-h-screen">
{/* HEADER - TITLE + TOGGLE + BUTTONS ON SAME LINE */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold">Companies</h1>
          <p className="text-muted-foreground">Manage your target companies.</p>
        </div>

        {/* Toggle in the middle */}
        <div className="flex justify-center lg:justify-start">
          <div className="inline-flex bg-muted rounded-lg p-1">
            <Button
              variant={viewMode === "list" ? "default" : "ghost"}
              onClick={() => setViewMode("list")}
              className="px-8"
            >
              List
            </Button>
            <Button
              variant={viewMode === "pipeline" ? "default" : "ghost"}
              onClick={() => setViewMode("pipeline")}
              className="px-8"
            >
              Pipeline
            </Button>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={() => window.location.reload()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button asChild>
            <Link href="/dashboard/companies/new">
              <Plus className="h-4 w-4 mr-2" />
              Add Company
            </Link>
          </Button>
        </div>
      </div>

      {/* Pipeline Overview */}
      <div className="grid grid-cols-5 gap-4">
        {companyStages.map((stage) => (
          <Card key={stage.id} className="cursor-pointer hover:shadow-md" onClick={() => setViewMode("pipeline")}>
            <CardContent className="p-6 text-center">
              <div className={`w-4 h-4 rounded-full ${stage.color} mx-auto mb-3`} />
              <p className="text-4xl font-bold">{pipelineCounts[stage.id as keyof typeof pipelineCounts]}</p>
              <p className="text-sm text-muted-foreground mt-1">{stage.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

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

      {/* LIST VIEW */}
      {viewMode === "list" && (
        <Card>
          <CardContent className="p-0">
            <table className="w-full">
<thead>
                <tr className="border-b">
<th className="text-left p-4">COMPANY</th>
                  <th className="text-left p-4">INDUSTRY</th>
                  <th className="text-left p-4">LOCATION</th>
                  <th className="text-left p-4">PRIMARY CONTACT</th>
                  <th className="text-left p-4">OPEN ROLES</th>
                  <th className="text-left p-4">STATUS</th>
                  <th className="text-left p-4">ID</th>
                  <th className="text-left p-4">ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {filteredCompanies.map((company: any) => (
<tr key={company.id} className="border-b hover:bg-muted/50">
                    <td className="p-4 font-medium">
                      <Link href={`/dashboard/companies/${company.id}`} className="hover:underline text-primary">
                        {company.name}
                      </Link>
                    </td>
                    <td className="p-4 text-muted-foreground">{company.industry || "-"}</td>
                    <td className="p-4 text-muted-foreground">{company.location || "-"}</td>
                    <td className="p-4 text-muted-foreground">-</td>
                    <td className="p-4 text-muted-foreground">{company.openRoles || 0}</td>
<td className="p-4">
                      <Badge variant="outline">{company.status || "Targeting"}</Badge>
                    </td>
                    <td className="p-4">
                      <IdBadge id={company.id} />
                    </td>
                    <td className="p-4">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          if (confirm(`Are you sure you want to delete "${company.name}"?`)) {
                            handleDeleteCompany(company.id);
                          }
                        }}
                        className="text-red-500 hover:text-red-700 hover:bg-red-50"
                      >
                        Delete
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

{/* PIPELINE VIEW - aligned with overview grid */}
      {viewMode === "pipeline" && (
        <div className="grid grid-cols-5 gap-4 overflow-x-auto pb-8" style={{ minWidth: '1000px' }}>
          {companyStages.map((stage) => (
            <div key={stage.id} className="min-w-0">
              <div className="bg-muted p-4 rounded-t-lg flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className={`w-4 h-4 rounded-full ${stage.color}`} />
                  <span className="font-semibold">{stage.label}</span>
                </div>
                <Badge>{pipelineGroups[stage.id].length}</Badge>
              </div>

<div className="min-h-[600px] border border-dashed border-muted-foreground/30 rounded-b-lg p-3 space-y-3">
                {/* ===== CHANGES ===== Use SortableCompanyCard with delete handler */}
                {pipelineGroups[stage.id].map((company: any) => (
                  <SortableCompanyCard
                    key={company.id}
                    company={company}
                    onEdit={handleEditCompany}
                    onDelete={handleDeleteCompany}
                  />
                ))}
                {pipelineGroups[stage.id].length === 0 && (
                  <div className="h-full flex items-center justify-center text-muted-foreground text-sm py-12">
                    Drag companies here...
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
