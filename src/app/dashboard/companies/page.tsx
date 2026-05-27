/**
 * Companies Page
 * Shows saved companies from DB + allows adding new ones + moving through pipeline
 * Supports drag-and-drop to move companies between stages
 */

"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Building2, MapPin, Users, Globe, Linkedin, Search, ExternalLink, FileText, X, Loader2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SimpleDialog } from "@/components/ui/simple-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useClients, useCreateClient, useUpdateClient, useUpdateClientStatus, useDeleteClient, clientKeys } from "@/lib/hooks/query-client";
import { companyStages } from "@/lib/schemas/client";
import { toast } from "sonner";
import CompanyEditModal from "@/components/company/CompanyEditModal";
import { Pencil, Trash2, GripVertical } from "lucide-react";
// Drag and drop imports
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
  defaultDropAnimationSideEffects,
  DropAnimation,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";

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
  status?: string;
}

// Use company stages for pipeline view - 8 stages
const pipelineStages = [
  { id: "identification", label: "Identification", color: "bg-blue-500" },
  { id: "outreach", label: "Outreach", color: "bg-yellow-500" },
  { id: "conversation", label: "Conversation", color: "bg-purple-500" },
  { id: "presented", label: "Presented", color: "bg-indigo-500" },
  { id: "meeting", label: "Meeting", color: "bg-orange-500" },
  { id: "proposal", label: "Proposal", color: "bg-pink-500" },
  { id: "closed_won", label: "Closed Won", color: "bg-green-500" },
  { id: "lost", label: "Lost", color: "bg-red-500" },
];

// Drop animation config
const dropAnimation: DropAnimation = {
  sideEffects: defaultDropAnimationSideEffects({
    styles: {
      active: {
        opacity: "0.5",
      },
    },
  }),
};

// Map legacy status to pipeline stage
function mapLegacyStatus(status?: string): string {
  if (!status) return "identification";
  if (pipelineStages.find(s => s.id === status)) {
    return status;
  }
  return "identification";
}

// Sortable Company Card Component
function SortableCompanyCard({
  company,
  onRefresh,
  onDelete,
}: {
  company: Company;
  onRefresh: () => void;
  onDelete: (companyId: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: company.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  // Get stage label from status
  const stageLabel =
    pipelineStages.find((s) => s.id === company.status)?.label || "New";

  const handleDelete = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (confirm(`Are you sure you want to delete ${company.name}?`)) {
      onDelete(company.id);
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`p-3 rounded-lg border border-border bg-background hover:border-primary transition-colors ${
        isDragging ? "opacity-50 ring-2 ring-primary" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <Link
            href={`/dashboard/companies/${company.id}`}
            className="font-medium text-sm truncate hover:text-primary transition-colors"
          >
            {company.name}
          </Link>
          {company.industry && (
            <p className="text-xs text-muted-foreground truncate">
              {company.industry}
            </p>
          )}
          {company.city && (
            <p className="text-xs text-muted-foreground truncate">
              {company.city}, {company.state}
            </p>
          )}
        </div>
        {/* Drag handle */}
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing p-1 text-muted-foreground hover:text-foreground"
          title="Drag to move"
        >
          <GripVertical className="h-4 w-4" />
        </button>
      </div>

      {/* Status Badge */}
      <Badge variant="outline" className="mt-2 text-xs capitalize">
        {stageLabel}
      </Badge>

      {/* Action buttons row */}
      <div className="flex flex-wrap gap-1 mt-2">
        <CompanyEditModal company={company} onSave={onRefresh}>
          <button
            type="button"
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
            title="Edit Company"
          >
            <Pencil className="h-3 w-3" />
            <span>Edit</span>
          </button>
        </CompanyEditModal>
        <button
          type="button"
          onClick={handleDelete}
          className="text-xs text-muted-foreground hover:text-destructive flex items-center gap-1"
          title="Delete Company"
        >
          <Trash2 className="h-3 w-3" />
          <span>Delete</span>
        </button>
</div>
    </div>
  );
}

// Column Component (Droppable)
function StageColumn({
  stage,
  companies,
  onRefresh,
  onDelete,
}: {
  stage: { id: string; label: string; color: string };
  companies: Company[];
  onRefresh: () => void;
  onDelete: (companyId: string) => void;
}) {
  // Make the column droppable using the stage id
  const { setNodeRef, isOver } = useDroppable({
    id: stage.id,
  });

  return (
    <div
      ref={setNodeRef}
      className={`rounded-lg border border-border bg-card min-h-[400px] flex flex-col transition-colors ${
        isOver ? 'border-primary bg-accent/20' : ''
      }`}
    >
      <div className="p-3 border-b border-border">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm">{stage.label}</h3>
          <Badge variant="secondary" className="text-xs">
            {companies.length || 0}
          </Badge>
        </div>
      </div>
      <div className="p-2 space-y-2 flex-1 overflow-y-auto">
        <SortableContext
          items={companies.map((c) => c.id)}
          strategy={verticalListSortingStrategy}
        >
          {companies.map((company) => (
            <SortableCompanyCard
              key={company.id}
              company={company}
              onRefresh={onRefresh}
              onDelete={onDelete}
            />
          ))}
        </SortableContext>
      </div>
    </div>
  );
}

export default function CompaniesPage() {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);

  // Setup sensors for drag detection
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Use TanStack Query hooks - fetches from DB via server actions
  const { data: clients = [], isLoading, error } = useClients();
  const createClientMutation = useCreateClient();
  const updateStatusMutation = useUpdateClientStatus();
  const deleteClientMutation = useDeleteClient();

  // Handle drag start
  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  // Handle drag end - update status when dropped in different column
  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const companyId = active.id as string;
    const oldCompany = companies.find((c) => c.id === companyId);

    if (!oldCompany) return;

    // Find which stage the company was dropped over
    let newStatus: string | null = null;

    // If dropped over a stage column
    const overStage = pipelineStages.find((s) => s.id === over.id);
    if (overStage) {
      newStatus = overStage.id;
    } else {
      // Dropped over another company - find their stage
      const overCompany = companies.find((c) => c.id === over.id);
      if (overCompany && overCompany.status) {
        newStatus = overCompany.status;
      }
    }

    // Default to identification if no valid status found
    if (!newStatus || !pipelineStages.find((s) => s.id === newStatus)) {
      newStatus = "identification";
    }

    // Get the current status from oldCompany (already mapped)
    const oldStatus = oldCompany.status || "identification";

    // Only update if status actually changed
    if (newStatus && newStatus !== oldStatus) {
      try {
        await updateStatusMutation.mutateAsync({
          clientId: companyId,
          status: newStatus,
        });
        queryClient.invalidateQueries({ queryKey: clientKeys.lists() });
        toast.success(`Moved to ${pipelineStages.find((s) => s.id === newStatus)?.label || newStatus}`);
      } catch (err: any) {
        console.error("Failed to update company status:", err);
        toast.error(`Failed to move: ${err.message}`);
      }
    }
  };

  // Handle delete company
  const handleDeleteCompany = async (companyId: string) => {
    try {
      await deleteClientMutation.mutateAsync(companyId);
      toast.success("Company deleted");
    } catch (err: any) {
      console.error("Failed to delete company:", err);
      toast.error(`Failed to delete: ${err.message}`);
    }
  };

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

// Convert DB client to Company interface (include status with mapped legacy)
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
    status: mapLegacyStatus(c.status),
  }));

  // Group companies by status for pipeline view
  const companiesByStage = pipelineStages.reduce((acc, stage) => {
    acc[stage.id] = companies.filter(c => c.status === stage.id);
    return acc;
  }, {} as Record<string, Company[]>);

const handleAddCompany = async () => {
    if (!newCompanyName) return;

    try {
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

      // Success - close dialog and reset form
      toast.success(`${newCompanyName} added successfully!`);
      setIsAddDialogOpen(false);
      resetForm();
    } catch (error) {
      // Error handling - show error message
      console.error("Failed to add company:", error);
      toast.error(`Failed to add ${newCompanyName}. Please try again.`);
    }
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

// Error state - show message for load errors
  if (error) {
    const errorMsg = error.message || '';
    const isAuthError = errorMsg.includes('Unauthorized') || errorMsg.includes('Session') || errorMsg.includes('login');

    // For auth errors, redirect to login
    if (isAuthError) {
      return (
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-bold">Companies</h1>
            <p className="text-muted-foreground">Manage your target companies.</p>
          </div>
          <div className="p-4 rounded-md bg-destructive/10 text-destructive">
            Please log in to view companies.
            <Button 
              variant="outline" 
              onClick={() => window.location.href = '/login'} 
              className="ml-4"
            >
              Go to Login
            </Button>
          </div>
        </div>
      );
    }

    // For other errors, show retry option
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Companies</h1>
          <p className="text-muted-foreground">Manage your target companies.</p>
        </div>
        <div className="p-4 rounded-md bg-destructive/10 text-destructive">
          Failed to load companies: {errorMsg}
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

{/* Kanban Pipeline View with Drag and Drop */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="grid grid-cols-8 gap-2">
          {pipelineStages.map((stage) => {
            const stageCompanies = companiesByStage[stage.id] || [];
            return (
              <StageColumn
                key={stage.id}
                stage={stage}
                companies={stageCompanies}
                onRefresh={handleRefresh}
                onDelete={handleDeleteCompany}
              />
            );
          })}
        </div>

        {/* Drag Overlay for visual feedback */}
        <DragOverlay dropAnimation={dropAnimation}>
          {activeId ? (
            <div className="p-3 rounded-lg border-2 border-primary bg-background shadow-lg opacity-90">
              {(() => {
                const company = companies.find((c) => c.id === activeId);
                if (!company) return null;
                return (
                  <>
                    <h4 className="font-medium text-sm truncate">{company.name}</h4>
                    {company.industry && (
                      <p className="text-xs text-muted-foreground truncate">
                        {company.industry}
                      </p>
                    )}
                  </>
                );
              })()}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {companies.length === 0 && (
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
