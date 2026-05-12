/**
 * Pipeline Page
 * 100% database-driven using TanStack Query hooks
 * Kanban board with drag-and-drop
 */

"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, MoreHorizontal, Mail, Phone, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SimpleDialog } from "@/components/ui/simple-dialog";
import { Skeleton } from "@/components/ui/skeleton";
// Use TanStack Query hooks - server actions for DB access
import { usePipeline, useCreatePipeline, useUpdatePipeline, pipelineKeys } from "@/lib/hooks/query-pipeline";
import { leadKeys } from "@/lib/hooks/query-lead";
import { clientKeys } from "@/lib/hooks/query-client";

interface Lead {
  id: string;
  name: string;
  email: string;
  company?: string;
  phone?: string;
  status: "new" | "contacted" | "qualified" | "proposal" | "closed";
  notes?: string;
  created_at: string;
}

const columns = [
  { id: "new", title: "New", color: "bg-blue-500" },
  { id: "contacted", title: "Contacted", color: "bg-yellow-500" },
  { id: "qualified", title: "Qualified", color: "bg-orange-500" },
  { id: "proposal", title: "Proposal", color: "bg-purple-500" },
  { id: "closed", title: "Closed Won", color: "bg-green-500" },
];

export default function PipelinePage() {
  const queryClient = useQueryClient();
  const [draggedLead, setDraggedLead] = useState<string | null>(null);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);

  // Use TanStack Query hooks - fetches from DB via server actions
  const { data: pipelineItems = [], isLoading, error } = usePipeline();
  const createPipelineMutation = useCreatePipeline();
  const updatePipelineMutation = useUpdatePipeline();

  // Form state
  const [newLeadName, setNewLeadName] = useState("");
  const [newLeadEmail, setNewLeadEmail] = useState("");
  const [newLeadCompany, setNewLeadCompany] = useState("");
  const [newLeadPhone, setNewLeadPhone] = useState("");
  const [newLeadNotes, setNewLeadNotes] = useState("");

// Convert DB items to Lead interface
  // Note: Pipeline uses 'stage' field, not 'status'
  const leads: Lead[] = pipelineItems.map((item: any) => ({
    id: item.id,
    name: item.name || "",
    email: item.email || "",
    company: item.company || "",
    phone: item.phone || "",
    // Use stage field (new, contacted, qualified, proposal, closed)
    status: (item.stage as Lead["status"]) || (item.status as Lead["status"]) || "new",
    notes: item.notes || "",
    created_at: item.created_at || new Date().toISOString(),
  }));

  const getLeadsByStatus = (status: string) => {
    return leads.filter((lead) => lead.status === status);
  };

  const handleDragStart = (leadId: string) => {
    setDraggedLead(leadId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

const handleDrop = async (status: Lead["status"]) => {
    if (!draggedLead) return;

    // Build FormData for update - use 'stage' for pipeline
    const formData = new FormData();
    formData.set("stage", status);

    // Use mutation - handles DB save + query invalidation + toast
    await updatePipelineMutation.mutateAsync({
      pipelineId: draggedLead,
      formData,
    });

    setDraggedLead(null);
  };

  const handleAddLead = async () => {
    if (!newLeadName || !newLeadEmail) return;

    // Build FormData for server action - use 'stage' for pipeline
    const formData = new FormData();
    formData.set("name", newLeadName);
    formData.set("email", newLeadEmail);
    formData.set("company", newLeadCompany);
    formData.set("phone", newLeadPhone);
    formData.set("notes", newLeadNotes);
    formData.set("stage", "new");

    // Use mutation - handles DB save + query invalidation + toast
    await createPipelineMutation.mutateAsync(formData);

    // Close dialog and reset form
    setIsAddDialogOpen(false);
    resetForm();
  };

  const resetForm = () => {
    setNewLeadName("");
    setNewLeadEmail("");
    setNewLeadCompany("");
    setNewLeadPhone("");
    setNewLeadNotes("");
  };

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: pipelineKeys.lists() });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    queryClient.invalidateQueries({ queryKey: ['stats'] });
  };

  const getColumnCount = (status: string) => {
    return leads.filter((lead) => lead.status === status).length;
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Pipeline</h1>
          <p className="text-muted-foreground">Manage your outreach leads.</p>
        </div>
        <div className="flex gap-4 overflow-x-auto">
          {columns.map((col) => (
            <div key={col.id} className="flex-shrink-0 w-72">
              <div className="flex items-center gap-2 mb-3">
                <div className={`h-2 w-2 rounded-full ${col.color}`} />
                <h3 className="font-medium">{col.title}</h3>
              </div>
              <div className="space-y-3 min-h-[400px] p-2 rounded-lg bg-muted/50">
                {[1, 2].map((i) => (
                  <div key={i} className="p-3 rounded-md bg-background border">
                    <Skeleton className="h-4 w-24 mb-2" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

// Error state - show empty state for auth errors
  const isAuthError = error?.message?.includes('Unauthorized');
  
  // Log error for debugging
  if (error) {
    console.log('[PIPELINE-PAGE] Error:', error?.message);
  }

  if (error && !isAuthError) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Pipeline</h1>
          <p className="text-muted-foreground">Manage your outreach leads.</p>
        </div>
        <div className="p-4 rounded-md bg-destructive/10 text-destructive">
          Failed to load pipeline. Please try again.
          <br />
          <span className="text-xs">Error: {error?.message}</span>
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
          <h1 className="text-3xl font-bold">Pipeline</h1>
          <p className="text-muted-foreground">
            Manage your outreach leads.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleRefresh}>
            Refresh
          </Button>
          <Button onClick={() => setIsAddDialogOpen(true)} disabled={createPipelineMutation.isPending}>
            <Plus className="mr-2 h-4 w-4" />
            {createPipelineMutation.isPending ? "Adding..." : "Add Lead"}
          </Button>
        </div>
      </div>

      {/* Add Lead Dialog */}
      <SimpleDialog
        open={isAddDialogOpen}
        onOpenChange={setIsAddDialogOpen}
        title="Add New Lead"
        description="Add a new lead to your pipeline."
        footer={
          <>
            <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAddLead}
              disabled={!newLeadName || !newLeadEmail || createPipelineMutation.isPending}
            >
              {createPipelineMutation.isPending ? "Adding..." : "Add Lead"}
            </Button>
          </>
        }
      >
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="name">Name *</Label>
            <Input
              id="name"
              value={newLeadName}
              onChange={(e) => setNewLeadName(e.target.value)}
              placeholder="John Smith"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="email">Email *</Label>
            <Input
              id="email"
              type="email"
              value={newLeadEmail}
              onChange={(e) => setNewLeadEmail(e.target.value)}
              placeholder="john@example.com"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="company">Company</Label>
            <Input
              id="company"
              value={newLeadCompany}
              onChange={(e) => setNewLeadCompany(e.target.value)}
              placeholder="ABC Construction"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="phone">Phone</Label>
            <Input
              id="phone"
              type="tel"
              value={newLeadPhone}
              onChange={(e) => setNewLeadPhone(e.target.value)}
              placeholder="561-555-0100"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={newLeadNotes}
              onChange={(e) => setNewLeadNotes(e.target.value)}
              placeholder="Add any notes about this lead..."
            />
          </div>
        </div>
      </SimpleDialog>

      {/* Pipeline Board */}
      <div className="flex gap-4 overflow-x-auto pb-4">
        {columns.map((column) => (
          <div
            key={column.id}
            className="flex-shrink-0 w-72"
            onDragOver={handleDragOver}
            onDrop={() => handleDrop(column.id as Lead["status"])}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className={`h-2 w-2 rounded-full ${column.color}`} />
                <h3 className="font-medium">{column.title}</h3>
              </div>
              <span className="text-sm text-muted-foreground">
                {getColumnCount(column.id)}
              </span>
            </div>

            <div className="space-y-3 min-h-[400px] p-2 rounded-lg bg-muted/50">
              {getLeadsByStatus(column.id).map((lead) => (
                <div
                  key={lead.id}
                  draggable
                  onDragStart={() => handleDragStart(lead.id)}
                  className="p-3 rounded-md bg-background border border-border cursor-move hover:border-primary/50 transition-colors"
                >
                  <div className="flex items-start justify-between mb-2">
                    <h4 className="font-medium text-sm">{lead.name}</h4>
                    <button className="text-muted-foreground hover:text-foreground">
                      <MoreHorizontal className="h-4 w-4" />
                    </button>
                  </div>

                  {lead.company && (
                    <div className="flex items-center gap-1 text-sm text-muted-foreground mb-2">
                      <Building2 className="h-3 w-3" />
                      {lead.company}
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2 text-sm">
                    <a
                      href={`mailto:${lead.email}`}
                      className="flex items-center gap-1 text-muted-foreground hover:text-primary"
                    >
                      <Mail className="h-3 w-3" />
                    </a>
                    {lead.phone && (
                      <a
                        href={`tel:${lead.phone}`}
                        className="flex items-center gap-1 text-muted-foreground hover:text-primary"
                      >
                        <Phone className="h-3 w-3" />
                      </a>
                    )}
                  </div>

                  {lead.notes && (
                    <p className="mt-2 text-xs text-muted-foreground line-clamp-2">
                      {lead.notes}
                    </p>
                  )}

                  <p className="mt-2 text-xs text-muted-foreground">
                    {new Date(lead.created_at).toLocaleDateString()}
                  </p>
                </div>
              ))}

              {getLeadsByStatus(column.id).length === 0 && (
                <div className="p-4 text-center text-sm text-muted-foreground">
                  No leads in this stage
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
