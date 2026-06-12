"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SimpleDialog } from "@/components/ui/simple-dialog";
import { useCreateClient, useUpdateClient, clientKeys } from "@/lib/hooks/query-client";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

interface Company {
  id: string;
  name: string;
  domain?: string;
  industry?: string;
  city?: string;
  state?: string;
  country?: string;
  employee_count?: number;
  revenue?: string;
  description?: string;
  linkedin_url?: string;
  status?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
}

interface CompanyEditModalProps {
  company?: Company;
  onSave: () => void;
  children?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

// Pipeline stages (companies - 8 stages from schema)
const pipelineStages = [
  { id: "identification", label: "Identification" },
  { id: "outreach", label: "Outreach" },
  { id: "conversation", label: "Conversation" },
  { id: "presented", label: "Presented" },
  { id: "meeting", label: "Meeting" },
  { id: "proposal", label: "Proposal" },
  { id: "closed_won", label: "Closed Won" },
  { id: "lost", label: "Lost" },
];

export default function CompanyEditModal({
  company,
  onSave,
  children,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: CompanyEditModalProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Use controlled props if provided, otherwise use internal state
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = isControlled 
    ? (value: boolean) => controlledOnOpenChange?.(value)
    : setInternalOpen;

  // Form state - initialize with company data
  const [formData, setFormData] = useState({
    name: "",
    domain: "",
    industry: "",
    city: "",
    state: "",
    employee_count: "",
    revenue: "",
    description: "",
    linkedin_url: "",
    status: "identification",
    contactName: "",
    contactEmail: "",
    contactPhone: "",
  });

  // Mutations
  const createClientMutation = useCreateClient();
  const updateClientMutation = useUpdateClient();

  // Reset form when modal opens or company changes
  useEffect(() => {
    if (open && company) {
      setFormData({
        name: company.name || "",
        domain: company.domain || "",
        industry: company.industry || "",
        city: company.city || "",
        state: company.state || "",
        employee_count: company.employee_count?.toString() || "",
        revenue: company.revenue || "",
        description: company.description || "",
        linkedin_url: company.linkedin_url || "",
        status: company.status || "identification",
        contactName: company.contactName || "",
        contactEmail: company.contactEmail || "",
        contactPhone: company.contactPhone || "",
      });
    }
  }, [open, company]);

  const handleSave = async () => {
    if (!formData.name) {
      toast.error("Company name is required");
      return;
    }

    setIsSaving(true);

    try {
      const formDataToSend = new FormData();
      formDataToSend.set("name", formData.name);
      formDataToSend.set("domain", formData.domain);
      formDataToSend.set("industry", formData.industry);
      formDataToSend.set("city", formData.city);
      formDataToSend.set("state", formData.state);
      formDataToSend.set("country", "US");
      formDataToSend.set("employee_count", formData.employee_count);
      formDataToSend.set("revenue", formData.revenue);
      formDataToSend.set("description", formData.description);
      formDataToSend.set("linkedin_url", formData.linkedin_url);
      formDataToSend.set("status", formData.status);

      if (company?.id) {
        // Update existing company
        await updateClientMutation.mutateAsync({
          clientId: company.id,
          formData: formDataToSend,
        });
        toast.success(`${formData.name} updated successfully!`);
      } else {
        // Create new company - add placeholder email
        formDataToSend.set("email", `${Date.now()}@placeholder.com`);
        await createClientMutation.mutateAsync(formDataToSend);
        toast.success(`${formData.name} created successfully!`);
      }

      onSave();
      setOpen(false);
    } catch (err: any) {
      console.error("Failed to save company:", err);
      toast.error(err.message || "Failed to save company");
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen && company) {
      // Reset form when closing
      setFormData({
        name: company.name || "",
        domain: company.domain || "",
        industry: company.industry || "",
        city: company.city || "",
        state: company.state || "",
        employee_count: company.employee_count?.toString() || "",
        revenue: company.revenue || "",
        description: company.description || "",
        linkedin_url: company.linkedin_url || "",
        status: company.status || "identification",
        contactName: company.contactName || "",
        contactEmail: company.contactEmail || "",
        contactPhone: company.contactPhone || "",
      });
    } else if (!isOpen) {
      // Reset for new company
      setFormData({
        name: "",
        domain: "",
        industry: "",
        city: "",
        state: "",
        employee_count: "",
        revenue: "",
        description: "",
        linkedin_url: "",
        status: "identification",
        contactName: "",
        contactEmail: "",
        contactPhone: "",
      });
    }
    setOpen(isOpen);
  };

  return (
    <>
      {/* Wrap the trigger button */}
      {children && (
        <span onClick={() => setOpen(true)} className="cursor-pointer">
          {children}
        </span>
      )}

      <SimpleDialog
        open={open}
        onOpenChange={handleOpenChange}
        title={company ? "Edit Company" : "Add New Company"}
        description={company ? "Update company information." : "Add a new company to your list."}
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={isSaving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={!formData.name || isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                company ? "Save Changes" : "Add Company"
              )}
            </Button>
          </>
        }
      >
        <div className="grid gap-4">
          {/* Company Name */}
          <div className="grid gap-2">
            <Label htmlFor="company-name">Company Name *</Label>
            <Input
              id="company-name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="ABC Construction Corp"
            />
          </div>

          {/* Website */}
          <div className="grid gap-2">
            <Label htmlFor="company-domain">Website</Label>
            <Input
              id="company-domain"
              value={formData.domain}
              onChange={(e) => setFormData({ ...formData, domain: e.target.value })}
              placeholder="abconstr.com"
            />
          </div>

          {/* Industry */}
          <div className="grid gap-2">
            <Label htmlFor="company-industry">Industry</Label>
            <Input
              id="company-industry"
              value={formData.industry}
              onChange={(e) => setFormData({ ...formData, industry: e.target.value })}
              placeholder="Construction"
            />
          </div>

          {/* City and State - side by side */}
          <div className="grid grid-cols-2 gap-2">
            <div className="grid gap-2">
              <Label htmlFor="company-city">City</Label>
              <Input
                id="company-city"
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                placeholder="Miami"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="company-state">State</Label>
              <Input
                id="company-state"
                value={formData.state}
                onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                placeholder="FL"
              />
            </div>
          </div>

{/* Hide Employees and Revenue from UI - kept in DB only */}
          {/* <div className="grid grid-cols-2 gap-2">
            <div className="grid gap-2">
              <Label htmlFor="company-employees">Employees</Label>
              <Input
                id="company-employees"
                type="number"
                value={formData.employee_count}
                onChange={(e) => setFormData({ ...formData, employee_count: e.target.value })}
                placeholder="250"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="company-revenue">Revenue</Label>
              <Input
                id="company-revenue"
                value={formData.revenue}
                onChange={(e) => setFormData({ ...formData, revenue: e.target.value })}
                placeholder="$25M-$50M"
              />
            </div>
          </div> */}

          {/* LinkedIn URL */}
          <div className="grid gap-2">
            <Label htmlFor="company-linkedin">LinkedIn URL</Label>
            <Input
              id="company-linkedin"
              value={formData.linkedin_url}
              onChange={(e) => setFormData({ ...formData, linkedin_url: e.target.value })}
              placeholder="https://linkedin.com/company/abc-construction"
            />
          </div>

          {/* Status/Stage */}
          <div className="grid gap-2">
            <Label htmlFor="company-status">Pipeline Stage</Label>
            <select
              id="company-status"
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value })}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pipelineStages.map((stage) => (
                <option key={stage.id} value={stage.id}>
                  {stage.label}
                </option>
              ))}
            </select>
          </div>

          {/* Description / Notes */}
          <div className="grid gap-2">
            <Label htmlFor="company-description">Description / Notes</Label>
            <Textarea
              id="company-description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Brief description of the company..."
              rows={4}
            />
          </div>
        </div>
      </SimpleDialog>
    </>
  );
}
