"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useCreateClient } from "@/lib/hooks/query-client";
import { toast } from "sonner";
import { ArrowLeft, Building2, Loader2 } from "lucide-react";

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

export default function NewCompanyPage() {
  const router = useRouter();
  const createClient = useCreateClient();
  const [isSaving, setIsSaving] = useState(false);
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
  });

  const update = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleCancel = () => {
    router.push("/dashboard/companies");
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error("Company name is required");
      return;
    }

    setIsSaving(true);
    try {
      const payload = new FormData();
      payload.set("name", formData.name.trim());
      payload.set("domain", formData.domain.trim());
      payload.set("industry", formData.industry.trim());
      payload.set("city", formData.city.trim());
      payload.set("state", formData.state.trim());
      payload.set("country", "US");
      payload.set("employee_count", formData.employee_count);
      payload.set("revenue", formData.revenue);
      payload.set("description", formData.description.trim());
      payload.set("linkedin_url", formData.linkedin_url.trim());
      payload.set("status", formData.status);
      // Placeholder email required by create schema
      payload.set("email", `${Date.now()}@placeholder.com`);

      await createClient.mutateAsync(payload);
      toast.success(`${formData.name.trim()} created successfully!`);

      // Hard navigate so companies list refetches
      if (typeof window !== "undefined") {
        window.location.href = "/dashboard/companies";
      } else {
        router.push("/dashboard/companies");
      }
    } catch (err: any) {
      console.error("Failed to create company:", err);
      toast.error(err?.message || "Failed to create company");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] -m-6 flex flex-col bg-slate-50">
      {/* Page header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 sticky top-0 z-20">
        <div className="max-w-3xl mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <Link
              href="/dashboard/companies"
              className="inline-flex items-center text-sm text-slate-600 hover:text-blue-600 mb-2"
            >
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              Back to Companies
            </Link>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 flex items-center gap-3">
              <span className="h-10 w-10 rounded-xl bg-blue-50 flex items-center justify-center">
                <Building2 className="h-5 w-5 text-blue-600" />
              </span>
              Add New Company
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Full-page form — scroll freely, save when ready
            </p>
          </div>
          <div className="hidden sm:flex items-center gap-2 shrink-0">
            <Button variant="outline" onClick={handleCancel} disabled={isSaving}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={!formData.name.trim() || isSaving}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving…
                </>
              ) : (
                "Add Company"
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Scrollable form body */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-6 pb-28">
        <div className="max-w-3xl mx-auto">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 sm:p-8 space-y-6">
            {/* Basics */}
            <section className="space-y-4">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                Company details
              </h2>

              <div className="space-y-2">
                <Label htmlFor="company-name">
                  Company Name <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="company-name"
                  value={formData.name}
                  onChange={(e) => update("name", e.target.value)}
                  placeholder="ABC Construction Corp"
                  className="h-11"
                  autoFocus
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="company-domain">Website</Label>
                  <Input
                    id="company-domain"
                    value={formData.domain}
                    onChange={(e) => update("domain", e.target.value)}
                    placeholder="abconstr.com"
                    className="h-11"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="company-industry">Industry</Label>
                  <Input
                    id="company-industry"
                    value={formData.industry}
                    onChange={(e) => update("industry", e.target.value)}
                    placeholder="Construction"
                    className="h-11"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="company-city">City</Label>
                  <Input
                    id="company-city"
                    value={formData.city}
                    onChange={(e) => update("city", e.target.value)}
                    placeholder="Miami"
                    className="h-11"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="company-state">State</Label>
                  <Input
                    id="company-state"
                    value={formData.state}
                    onChange={(e) => update("state", e.target.value)}
                    placeholder="FL"
                    className="h-11"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="company-linkedin">LinkedIn URL</Label>
                <Input
                  id="company-linkedin"
                  value={formData.linkedin_url}
                  onChange={(e) => update("linkedin_url", e.target.value)}
                  placeholder="https://linkedin.com/company/abc-construction"
                  className="h-11"
                />
              </div>
            </section>

            <div className="border-t border-slate-100" />

            {/* Pipeline */}
            <section className="space-y-4">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                Pipeline
              </h2>
              <div className="space-y-2">
                <Label htmlFor="company-status">Pipeline Stage</Label>
                <select
                  id="company-status"
                  value={formData.status}
                  onChange={(e) => update("status", e.target.value)}
                  className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  {pipelineStages.map((stage) => (
                    <option key={stage.id} value={stage.id}>
                      {stage.label}
                    </option>
                  ))}
                </select>
              </div>
            </section>

            <div className="border-t border-slate-100" />

            {/* Notes */}
            <section className="space-y-4">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                Notes
              </h2>
              <div className="space-y-2">
                <Label htmlFor="company-description">Description / Notes</Label>
                <Textarea
                  id="company-description"
                  value={formData.description}
                  onChange={(e) => update("description", e.target.value)}
                  placeholder="Brief description of the company, opportunity notes, next steps…"
                  rows={6}
                  className="resize-y min-h-[120px]"
                />
              </div>
            </section>
          </div>
        </div>
      </div>

      {/* Sticky mobile / always-visible bottom actions */}
      <div className="fixed bottom-0 left-0 right-0 sm:left-72 z-30 border-t border-slate-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80 px-4 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.04)]">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
          <p className="text-xs text-slate-500 hidden sm:block">
            {formData.name.trim()
              ? `Ready to add “${formData.name.trim()}”`
              : "Company name is required"}
          </p>
          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <Button
              variant="outline"
              onClick={handleCancel}
              disabled={isSaving}
              className="flex-1 sm:flex-none"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={!formData.name.trim() || isSaving}
              className="flex-1 sm:flex-none bg-blue-600 hover:bg-blue-700"
            >
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving…
                </>
              ) : (
                "Add Company"
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
