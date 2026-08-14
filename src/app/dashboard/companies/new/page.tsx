"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useCreateClient } from "@/lib/hooks/query-client";
import { useAddContact } from "@/lib/hooks/contact-mutations";
import { companyStageOptions } from "@/lib/schemas/client";
import { toast } from "sonner";
import { TagEditor } from "@/components/shared/TagEditor";
import { tagsFromRecord } from "@/lib/tags";
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  Loader2,
  UserPlus,
} from "lucide-react";
import {
  PlacementFeeFields,
  appendPlacementFeeToFormData,
  emptyPlacementFeeForm,
  type PlacementFeeForm,
} from "@/components/company/PlacementFeeFields";

const pipelineStages = companyStageOptions.map((s) => ({
  id: s.id,
  label: s.label,
}));

type Step = "company" | "contact";

export default function NewCompanyPage() {
  const router = useRouter();
  const createClient = useCreateClient();
  const addContact = useAddContact();

  const [step, setStep] = useState<Step>("company");
  const [isSaving, setIsSaving] = useState(false);
  const [createdCompany, setCreatedCompany] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    domain: "",
    phone: "",
    industry: "",
    city: "",
    state: "",
    employee_count: "",
    revenue: "",
    description: "",
    linkedin_url: "",
    status: "identification",
  });
  const [fee, setFee] = useState<PlacementFeeForm>(emptyPlacementFeeForm());
  const [tags, setTags] = useState<string[]>([]);
  const [tagsTouched, setTagsTouched] = useState(false);

  const [contactForm, setContactForm] = useState({
    name: "",
    title: "",
    email: "",
    phone: "",
    isPrimary: true,
  });

  const update = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const updateContact = (field: string, value: string | boolean) => {
    setContactForm((prev) => ({ ...prev, [field]: value }));
  };

  useEffect(() => {
    if (tagsTouched) return;
    const generated = tagsFromRecord({
      objectType: "company",
      title: formData.name,
      industry: formData.industry,
      description: formData.description,
    }).tags;
    setTags(generated);
  }, [formData.name, formData.industry, formData.description, tagsTouched]);

  const handleCancel = () => {
    router.push("/dashboard/companies");
  };

  const goToCompanyPage = () => {
    if (createdCompany?.id) {
      router.push(
        `/dashboard/companies/${createdCompany.id}?tab=contacts`
      );
    } else {
      router.push("/dashboard/companies");
    }
  };

  const handleSaveCompany = async () => {
    if (!formData.name.trim()) {
      toast.error("Company name is required");
      return;
    }

    setIsSaving(true);
    try {
      const payload = new FormData();
      payload.set("name", formData.name.trim());
      payload.set("email", formData.email.trim());
      payload.set("domain", formData.domain.trim());
      payload.set("phone", formData.phone.trim());
      payload.set("industry", formData.industry.trim());
      payload.set("city", formData.city.trim());
      payload.set("state", formData.state.trim());
      payload.set("country", "US");
      payload.set("employee_count", formData.employee_count);
      payload.set("revenue", formData.revenue);
      payload.set("description", formData.description.trim());
      payload.set("linkedin_url", formData.linkedin_url.trim());
      payload.set("status", formData.status);
      appendPlacementFeeToFormData(payload, fee);
      payload.set("tags", JSON.stringify(tags));

      const client = await createClient.mutateAsync(payload);
      const id = client?.id || client?.client?.id;
      const name = client?.name || formData.name.trim();

      if (!id) {
        toast.success(`${name} created — opening company…`);
        router.push("/dashboard/companies");
        return;
      }

      setCreatedCompany({ id: String(id), name: String(name) });
      setStep("contact");
      toast.success(`${name} created — add a contact next`);
    } catch (err: any) {
      console.error("Failed to create company:", err);
      toast.error(err?.message || "Failed to create company");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveContact = async () => {
    if (!createdCompany?.id) return;
    if (!contactForm.name.trim()) {
      toast.error("Contact name is required");
      return;
    }

    setIsSaving(true);
    try {
      await addContact.mutateAsync({
        clientId: createdCompany.id,
        contactData: {
          name: contactForm.name.trim(),
          title: contactForm.title.trim(),
          email: contactForm.email.trim(),
          phone: contactForm.phone.trim(),
          isPrimary: contactForm.isPrimary,
          tags: tagsFromRecord({
            objectType: "contact",
            title: contactForm.title.trim(),
            description: createdCompany.name,
          }).tags,
        },
      });
      // useAddContact already toasts success
      router.push(`/dashboard/companies/${createdCompany.id}?tab=contacts`);
    } catch {
      // toast handled by mutation
    } finally {
      setIsSaving(false);
    }
  };

  const handleSkipContact = () => {
    goToCompanyPage();
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
                {step === "contact" ? (
                  <UserPlus className="h-5 w-5 text-blue-600" />
                ) : (
                  <Building2 className="h-5 w-5 text-blue-600" />
                )}
              </span>
              {step === "company" ? "Add New Company" : "Add Primary Contact"}
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              {step === "company"
                ? "Step 1 of 2 — company details, then add a contact"
                : `Step 2 of 2 — contact for ${createdCompany?.name || "this company"}`}
            </p>
          </div>
          <div className="hidden sm:flex items-center gap-2 shrink-0">
            {step === "company" ? (
              <>
                <Button
                  variant="outline"
                  onClick={handleCancel}
                  disabled={isSaving}
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => void handleSaveCompany()}
                  disabled={!formData.name.trim() || isSaving}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving…
                    </>
                  ) : (
                    "Save & add contact"
                  )}
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="outline"
                  onClick={handleSkipContact}
                  disabled={isSaving}
                >
                  Skip for now
                </Button>
                <Button
                  onClick={() => void handleSaveContact()}
                  disabled={!contactForm.name.trim() || isSaving}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving…
                    </>
                  ) : (
                    "Save contact"
                  )}
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Step indicator */}
        <div className="max-w-3xl mx-auto mt-4 flex items-center gap-2">
          <div
            className={`flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${
              step === "company"
                ? "bg-blue-100 text-blue-800"
                : "bg-emerald-50 text-emerald-800"
            }`}
          >
            {step === "contact" ? (
              <CheckCircle2 className="h-3.5 w-3.5" />
            ) : (
              <span className="h-4 w-4 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px]">
                1
              </span>
            )}
            Company
          </div>
          <div className="h-px flex-1 bg-slate-200 max-w-[40px]" />
          <div
            className={`flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${
              step === "contact"
                ? "bg-blue-100 text-blue-800"
                : "bg-slate-100 text-slate-500"
            }`}
          >
            <span
              className={`h-4 w-4 rounded-full flex items-center justify-center text-[10px] ${
                step === "contact"
                  ? "bg-blue-600 text-white"
                  : "bg-slate-300 text-white"
              }`}
            >
              2
            </span>
            Contact
          </div>
        </div>
      </div>

      {/* Scrollable form body */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-6 pb-28">
        <div className="max-w-3xl mx-auto">
          {step === "company" ? (
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 sm:p-8 space-y-6">
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
                    <Label htmlFor="company-phone">Phone</Label>
                    <Input
                      id="company-phone"
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => update("phone", e.target.value)}
                      placeholder="(555) 123-4567"
                      className="h-11"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="company-email">Company email</Label>
                  <Input
                    id="company-email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => update("email", e.target.value)}
                    placeholder="info@company.com or jobs@company.com"
                    className="h-11"
                  />
                  <p className="text-xs text-slate-500">
                    General company inbox (not a personal contact). Optional.
                  </p>
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

              <section className="space-y-4">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                  Placement fee
                </h2>
                <PlacementFeeFields value={fee} onChange={setFee} />
              </section>

              <div className="border-t border-slate-100" />

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

              <section className="space-y-4">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                  Notes
                </h2>
                <div className="space-y-2">
                  <Label htmlFor="company-description">
                    Description / Notes
                  </Label>
                  <Textarea
                    id="company-description"
                    value={formData.description}
                    onChange={(e) => update("description", e.target.value)}
                    placeholder="Brief description of the company, opportunity notes, next steps…"
                    rows={6}
                    className="resize-y min-h-[120px]"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Tags</Label>
                  <TagEditor
                    value={tags}
                    onChange={(next) => {
                      setTagsTouched(true);
                      setTags(next);
                    }}
                    objectType="company"
                    placeholder="Add tag…"
                  />
                  <p className="text-xs text-slate-500">
                    Auto-filled from name, industry, and notes. You can edit
                    before saving.
                  </p>
                </div>
              </section>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 px-4 py-3 flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-emerald-900">
                    {createdCompany?.name} is saved
                  </p>
                  <p className="text-xs text-emerald-800/80 mt-0.5">
                    Add a primary contact now — you can always add more later
                    from the company page.
                  </p>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 sm:p-8 space-y-5">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                  Primary contact
                </h2>

                <div className="space-y-2">
                  <Label htmlFor="contact-name">
                    Full name <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="contact-name"
                    value={contactForm.name}
                    onChange={(e) => updateContact("name", e.target.value)}
                    placeholder="Jane Smith"
                    className="h-11"
                    autoFocus
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="contact-title">Title</Label>
                    <Input
                      id="contact-title"
                      value={contactForm.title}
                      onChange={(e) => updateContact("title", e.target.value)}
                      placeholder="HR Director"
                      className="h-11"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="contact-phone">Phone</Label>
                    <Input
                      id="contact-phone"
                      value={contactForm.phone}
                      onChange={(e) => updateContact("phone", e.target.value)}
                      placeholder="(555) 123-4567"
                      className="h-11"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="contact-email">Email</Label>
                  <Input
                    id="contact-email"
                    type="email"
                    value={contactForm.email}
                    onChange={(e) => updateContact("email", e.target.value)}
                    placeholder="jane@company.com"
                    className="h-11"
                  />
                </div>

                <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={contactForm.isPrimary}
                    onChange={(e) =>
                      updateContact("isPrimary", e.target.checked)
                    }
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  Mark as primary contact
                </label>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Sticky bottom actions */}
      <div className="fixed bottom-0 left-0 right-0 sm:left-72 z-30 border-t border-slate-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80 px-4 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.04)]">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
          <p className="text-xs text-slate-500 hidden sm:block">
            {step === "company"
              ? formData.name.trim()
                ? `Ready to add “${formData.name.trim()}”`
                : "Company name is required"
              : contactForm.name.trim()
                ? `Add contact for ${createdCompany?.name}`
                : "Contact name is required (or skip)"}
          </p>
          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            {step === "company" ? (
              <>
                <Button
                  variant="outline"
                  onClick={handleCancel}
                  disabled={isSaving}
                  className="flex-1 sm:flex-none"
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => void handleSaveCompany()}
                  disabled={!formData.name.trim() || isSaving}
                  className="flex-1 sm:flex-none bg-blue-600 hover:bg-blue-700"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving…
                    </>
                  ) : (
                    "Save & add contact"
                  )}
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="outline"
                  onClick={handleSkipContact}
                  disabled={isSaving}
                  className="flex-1 sm:flex-none"
                >
                  Skip for now
                </Button>
                <Button
                  onClick={() => void handleSaveContact()}
                  disabled={!contactForm.name.trim() || isSaving}
                  className="flex-1 sm:flex-none bg-blue-600 hover:bg-blue-700"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving…
                    </>
                  ) : (
                    "Save contact"
                  )}
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
