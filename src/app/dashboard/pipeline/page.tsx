"use client";

import { useState, useEffect } from "react";
import { Plus, MoreHorizontal, Mail, Phone, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SimpleDialog } from "@/components/ui/simple-dialog";
// Use client API (SECURE - goes through server API, not directly to AWS)
import { fetchLeads, createLead, updateLead, deleteLead } from "@/lib/api/client-api";

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

// Mock data for demo (fallback when no DB)
const initialLeads: Lead[] = [
  {
    id: "1",
    name: "John Smith",
    email: "john@abcconstruction.com",
    company: "ABC Construction Corp",
    phone: "561-555-0101",
    status: "new",
    created_at: new Date().toISOString(),
  },
  {
    id: "2",
    name: "Sarah Johnson",
    email: "sarah@sunrisebuilders.com",
    company: "Sunrise Builders Inc",
    phone: "561-555-0102",
    status: "contacted",
    notes: "Interested in our staffing services",
    created_at: new Date().toISOString(),
  },
  {
    id: "3",
    name: "Mike Williams",
    email: "mike@elitecontractors.com",
    company: "Elite Contractors LLC",
    phone: "561-555-0103",
    status: "qualified",
    notes: "Looking for 5+ candidates",
    created_at: new Date().toISOString(),
  },
];

// Get tenant ID from session or use default
// Note: auth.ts stores this as "tenantId" not "tenant_id"
function getTenantId(): string {
  if (typeof window === "undefined") return "default";
  // Check both keys for compatibility
  return localStorage.getItem("tenantId") || localStorage.getItem("tenant_id") || "default";
}

const columns = [
  { id: "new", title: "New", color: "bg-blue-500" },
  { id: "contacted", title: "Contacted", color: "bg-yellow-500" },
  { id: "qualified", title: "Qualified", color: "bg-orange-500" },
  { id: "proposal", title: "Proposal", color: "bg-purple-500" },
  { id: "closed", title: "Closed Won", color: "bg-green-500" },
];

export default function PipelinePage() {
  const [leads, setLeads] = useState<Lead[]>(initialLeads);
  const [draggedLead, setDraggedLead] = useState<string | null>(null);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [dbReady, setDbReady] = useState(false);
  
  // New lead form state
  const [newLeadName, setNewLeadName] = useState("");
  const [newLeadEmail, setNewLeadEmail] = useState("");
  const [newLeadCompany, setNewLeadCompany] = useState("");
  const [newLeadPhone, setNewLeadPhone] = useState("");
  const [newLeadNotes, setNewLeadNotes] = useState("");

// Load leads from API or localStorage on mount
  useEffect(() => {
    async function loadLeads() {
      try {
        // Try secure API first (uses session cookie for auth/tenant)
        const dbLeads = await fetchLeads();
        if (dbLeads && dbLeads.length > 0) {
          // Convert DB format to Lead format
          const formattedLeads: Lead[] = dbLeads.map((l: any) => ({
            id: l.id,
            name: l.name,
            email: l.email,
            company: l.company || "",
            phone: l.phone || "",
            status: (l.status as Lead["status"]) || "new",
            notes: l.notes || "",
            created_at: l.created_at || new Date().toISOString(),
          }));
          setLeads(formattedLeads);
          setDbReady(true);
          // Also save to localStorage for backup
          localStorage.setItem("leads", JSON.stringify(formattedLeads));
          return;
        }
      } catch (err) {
        console.log("DynamoDB not available, checking localStorage...");
      }
      
      // Fallback to localStorage
      const stored = localStorage.getItem("leads");
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          setLeads(parsed);
          setDbReady(false);
          return;
        } catch {}
      }
      
      // No data found - use mock but save to localStorage
      localStorage.setItem("leads", JSON.stringify(initialLeads));
    }
    loadLeads();
  }, []);

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
    if (draggedLead) {
      const leadId = draggedLead;
      // Update state and persist to localStorage
      setLeads((prev) => {
        const updated = prev.map((lead) =>
          lead.id === draggedLead ? { ...lead, status } : lead
        );
        localStorage.setItem("leads", JSON.stringify(updated));
        return updated;
      });
      
// Save status change to API (tenant_id enforced by server from session cookie)
      if (dbReady) {
        try {
          const lead = leads.find(l => l.id === leadId);
          if (lead) {
            await updateLead(leadId, {
              name: lead.name,
              email: lead.email,
              company: lead.company || "",
              status: status,
              notes: lead.notes || "",
            });
          }
        } catch (err) {
          console.error("Failed to update lead status in DB:", err);
        }
      }
      
      setDraggedLead(null);
    }
  };

  const getColumnCount = (status: string) => {
    return leads.filter((lead) => lead.status === status).length;
  };

const handleAddLead = async () => {
    if (!newLeadName || !newLeadEmail) return;
    
    const newLead: Lead = {
      id: Date.now().toString(),
      name: newLeadName,
      email: newLeadEmail,
      company: newLeadCompany,
      phone: newLeadPhone,
      status: "new",
      notes: newLeadNotes,
      created_at: new Date().toISOString(),
    };
    
    // Update state and persist to localStorage
    setLeads((prev) => {
      const updated = [...prev, newLead];
      localStorage.setItem("leads", JSON.stringify(updated));
      return updated;
    });
    setIsAddDialogOpen(false);
    
// Save to API (tenant_id enforced by server from session cookie)
    if (dbReady) {
      try {
        await createLead({
          name: newLead.name,
          email: newLead.email,
          company: newLead.company,
          phone: newLead.phone,
          status: newLead.status,
          notes: newLeadNotes,
        });
      } catch (err) {
        console.error("Failed to save lead to DB:", err);
      }
    }
    
    // Reset form
    setNewLeadName("");
    setNewLeadEmail("");
    setNewLeadCompany("");
    setNewLeadPhone("");
    setNewLeadNotes("");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Pipeline</h1>
          <p className="text-muted-foreground">
            Manage your outreach leads.
          </p>
        </div>
        <Button onClick={() => setIsAddDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Lead
        </Button>
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
            <Button onClick={handleAddLead} disabled={!newLeadName || !newLeadEmail}>
              Add Lead
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
