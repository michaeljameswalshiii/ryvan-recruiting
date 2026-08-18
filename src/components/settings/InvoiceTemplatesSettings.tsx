"use client";

import { useEffect, useState } from "react";
import {
  Loader2,
  Plus,
  FileText,
  Trash2,
  Star,
  Save,
  ExternalLink,
  Link2,
} from "lucide-react";
import { INVOICE_MERGE_FIELDS } from "@/lib/invoices/merge-fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { toast } from "sonner";
import Link from "next/link";

type Template = {
  id: string;
  name: string;
  is_default?: boolean;
  logo_url?: string | null;
  primary_color?: string;
  header_text?: string;
  footer_text?: string;
  payment_terms?: string;
  from_name?: string;
  from_address?: string;
  from_email?: string;
  from_phone?: string;
  default_fee_type?: "percent" | "flat";
  default_fee_percent?: number;
  default_fee_flat?: number;
  source_kind?: "built_in" | "google_doc" | "docx" | "pdf";
  source_url?: string | null;
  source_file_key?: string | null;
  source_file_name?: string | null;
  source_file_type?: string | null;
};

type InvoiceRow = {
  id: string;
  invoice_number: string;
  status: string;
  client_name: string;
  total: number;
  job_title?: string;
  created_at: string;
};

const emptyForm = (): Partial<Template> => ({
  name: "Standard placement",
  is_default: true,
  logo_url: null,
  primary_color: "#2563eb",
  header_text: "INVOICE",
  footer_text: "Thank you for your business.",
  payment_terms:
    "Payment due within 30 days of invoice date. Please include invoice number with payment.",
  from_name: "",
  from_address: "",
  from_email: "",
  from_phone: "",
  default_fee_type: "percent",
  default_fee_percent: 20,
  default_fee_flat: 0,
  source_kind: "built_in",
  source_url: "",
  source_file_key: null,
  source_file_name: null,
  source_file_type: null,
});

export function InvoiceTemplatesSettings() {
  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [orgLogo, setOrgLogo] = useState<string | null>(null);
  const [orgName, setOrgName] = useState("");
  const [editing, setEditing] = useState<Partial<Template> | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [checkingDoc, setCheckingDoc] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [tRes, iRes] = await Promise.all([
        fetch("/api/invoice-templates", { credentials: "include" }),
        fetch("/api/invoices", { credentials: "include" }),
      ]);
      const tData = await tRes.json();
      const iData = await iRes.json();
      if (tRes.ok) {
        setTemplates(tData.templates || []);
        setOrgLogo(tData.org_logo_url || null);
        setOrgName(tData.org_name || "");
      }
      if (iRes.ok) setInvoices(iData.invoices || []);
    } catch {
      toast.error("Failed to load invoices");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const save = async () => {
    if (!editing?.name?.trim()) {
      toast.error("Template name required");
      return;
    }
    if (editing.source_kind === "google_doc" && !editing.source_url?.trim()) {
      toast.error("Paste a Google Doc link");
      return;
    }
    if (
      (editing.source_kind === "docx" || editing.source_kind === "pdf") &&
      !editing.source_file_key
    ) {
      toast.error("Upload a Word or PDF file first");
      return;
    }
    setSaving(true);
    try {
      const isNew = !editing.id;
      const url = isNew
        ? "/api/invoice-templates"
        : `/api/invoice-templates/${editing.id}`;
      const res = await fetch(url, {
        method: isNew ? "POST" : "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editing.name,
          is_default: editing.is_default ?? false,
          logo_url: editing.logo_url || null,
          primary_color: editing.primary_color || "#2563eb",
          header_text: editing.header_text,
          footer_text: editing.footer_text,
          payment_terms: editing.payment_terms,
          from_name: editing.from_name,
          from_address: editing.from_address,
          from_email: editing.from_email,
          from_phone: editing.from_phone,
          default_fee_type: editing.default_fee_type || "percent",
          default_fee_percent: editing.default_fee_percent ?? 20,
          default_fee_flat: editing.default_fee_flat,
          source_kind: editing.source_kind || "built_in",
          source_url:
            editing.source_kind === "google_doc"
              ? editing.source_url || null
              : null,
          source_file_key:
            editing.source_kind === "docx" || editing.source_kind === "pdf"
              ? editing.source_file_key || null
              : null,
          source_file_name:
            editing.source_kind === "docx" || editing.source_kind === "pdf"
              ? editing.source_file_name || null
              : null,
          source_file_type:
            editing.source_kind === "docx" || editing.source_kind === "pdf"
              ? editing.source_file_type || null
              : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Save failed");
        return;
      }
      toast.success(isNew ? "Template created" : "Template updated");
      setEditing(null);
      await load();
    } catch {
      toast.error("Save failed");
    } finally {
      setSaving(false);
    }
  };

  const sourceLabel = (t: Partial<Template>) => {
    if (t.source_kind === "google_doc") return "Google Doc";
    if (t.source_kind === "docx") return t.source_file_name || "Word file";
    if (t.source_kind === "pdf") return t.source_file_name || "PDF file";
    return "Trio layout";
  };

  const uploadFile = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/invoice-templates/file", {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Upload failed");
        return;
      }
      setEditing((p) => ({
        ...p,
        source_kind: data.file.kind,
        source_file_key: data.file.key,
        source_file_name: data.file.name,
        source_file_type: data.file.type,
        source_url: "",
      }));
      toast.success("Template file uploaded");
    } catch {
      toast.error("Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const checkGoogleDoc = async () => {
    const url = editing?.source_url?.trim();
    if (!url) {
      toast.error("Paste a Google Doc link first");
      return;
    }
    setCheckingDoc(true);
    try {
      const res = await fetch(
        `/api/invoice-templates/file?url=${encodeURIComponent(url)}`,
        { credentials: "include" }
      );
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Could not open that Google Doc");
        return;
      }
      toast.success(data.message || "Google Doc is readable");
    } catch {
      toast.error("Could not check that Google Doc");
    } finally {
      setCheckingDoc(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this template?")) return;
    const res = await fetch(`/api/invoice-templates/${id}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!res.ok) {
      toast.error("Delete failed");
      return;
    }
    toast.success("Template deleted");
    await load();
  };

  const setStatus = async (id: string, status: string) => {
    const res = await fetch(`/api/invoices/${id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      toast.error("Status update failed");
      return;
    }
    toast.success(`Marked ${status}`);
    await load();
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Invoice templates
            </CardTitle>
            <CardDescription>
              Use Trio&apos;s layout, or attach the Google Doc / Word / PDF
              invoice you already use. Put merge fields like{" "}
              <code className="text-[11px]">{"{{client_name}}"}</code> in the
              file.
            </CardDescription>
          </div>
          <Button
            size="sm"
            onClick={() =>
              setEditing({
                ...emptyForm(),
                from_name: orgName,
                primary_color: "#2563eb",
              })
            }
          >
            <Plus className="h-4 w-4 mr-1" />
            New template
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {orgLogo && (
            <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={orgLogo}
                alt="Org logo"
                className="h-10 w-auto max-w-[120px] object-contain"
              />
              <span className="text-slate-600">
                Default logo (organization). Templates without a logo override use this.
              </span>
            </div>
          )}

          {templates.length === 0 && !editing && (
            <p className="text-sm text-slate-600">
              No templates yet. Create one and attach your Google Doc, Word, or PDF invoice.
            </p>
          )}

          <ul className="space-y-2">
            {templates.map((t) => (
              <li
                key={t.id}
                className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="font-medium text-slate-900 truncate">
                    {t.name}
                    {t.is_default && (
                      <span className="ml-2 inline-flex items-center gap-0.5 text-[10px] font-bold uppercase text-amber-700">
                        <Star className="h-3 w-3" /> Default
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-slate-500">
                    Fee:{" "}
                    {t.default_fee_type === "flat"
                      ? `$${t.default_fee_flat || 0} flat`
                      : `${t.default_fee_percent ?? 20}%`}
                    {" · "}
                    {sourceLabel(t)}
                  </p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setEditing({ ...t })}
                  >
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-red-600"
                    onClick={() => void remove(t.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>

          {editing && (
            <div className="mt-4 space-y-3 rounded-xl border border-blue-200 bg-blue-50/40 p-4">
              <p className="text-sm font-semibold text-slate-900">
                {editing.id ? "Edit template" : "New template"}
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Label>Name</Label>
                  <Input
                    value={editing.name || ""}
                    onChange={(e) =>
                      setEditing((p) => ({ ...p, name: e.target.value }))
                    }
                  />
                </div>
                <div className="sm:col-span-2 space-y-2">
                  <Label>Invoice document</Label>
                  <select
                    className="h-10 w-full rounded-md border px-3 text-sm"
                    value={editing.source_kind || "built_in"}
                    onChange={(e) =>
                      setEditing((p) => ({
                        ...p,
                        source_kind: e.target.value as Template["source_kind"],
                      }))
                    }
                  >
                    <option value="built_in">Trio layout (built-in PDF)</option>
                    <option value="google_doc">Google Doc template</option>
                    <option value="docx">Uploaded Word (.docx)</option>
                    <option value="pdf">Uploaded PDF</option>
                  </select>
                  {(editing.source_kind || "built_in") === "google_doc" && (
                    <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-3">
                      <Label>Google Doc link</Label>
                      <Input
                        value={editing.source_url || ""}
                        onChange={(e) =>
                          setEditing((p) => ({
                            ...p,
                            source_url: e.target.value,
                          }))
                        }
                        placeholder="https://docs.google.com/document/d/…"
                      />
                      <p className="text-[11px] text-slate-500">
                        Share the doc as <strong>Anyone with the link can view</strong>.
                        In the doc, type merge fields such as{" "}
                        <code>{"{{client_name}}"}</code>,{" "}
                        <code>{"{{total}}"}</code>,{" "}
                        <code>{"{{invoice_number}}"}</code>,{" "}
                        <code>{"{{candidate_name}}"}</code>.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={checkingDoc}
                          onClick={() => void checkGoogleDoc()}
                        >
                          {checkingDoc ? (
                            <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                          ) : (
                            <Link2 className="h-3.5 w-3.5 mr-1" />
                          )}
                          Test link
                        </Button>
                        {editing.source_url ? (
                          <Button size="sm" variant="ghost" asChild>
                            <a
                              href={editing.source_url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              <ExternalLink className="h-3.5 w-3.5 mr-1" />
                              Open doc
                            </a>
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  )}
                  {(editing.source_kind === "docx" ||
                    editing.source_kind === "pdf") && (
                    <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-3">
                      <Label>Upload Word or PDF</Label>
                      <input
                        type="file"
                        accept=".docx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                        className="block w-full text-sm"
                        disabled={uploading}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) void uploadFile(f);
                          e.target.value = "";
                        }}
                      />
                      {editing.source_file_name ? (
                        <p className="text-xs text-slate-600">
                          Attached: {editing.source_file_name}
                        </p>
                      ) : (
                        <p className="text-[11px] text-slate-500">
                          Word files can use {"{{merge}}"} fields. A PDF keeps
                          your layout; Trio stamps invoice number, client, and
                          total at the top (or fills PDF form fields if present).
                        </p>
                      )}
                      {uploading ? (
                        <p className="inline-flex items-center gap-1 text-xs text-slate-500">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Uploading…
                        </p>
                      ) : null}
                    </div>
                  )}
                  {(editing.source_kind || "built_in") !== "built_in" && (
                    <p className="text-[11px] text-slate-500">
                      Available fields:{" "}
                      {INVOICE_MERGE_FIELDS.map((f) => `{{${f}}}`).join(" ")}
                    </p>
                  )}
                </div>
                <div>
                  <Label>Header</Label>
                  <Input
                    value={editing.header_text || ""}
                    onChange={(e) =>
                      setEditing((p) => ({
                        ...p,
                        header_text: e.target.value,
                      }))
                    }
                  />
                </div>
                <div>
                  <Label>Primary color</Label>
                  <Input
                    type="color"
                    value={editing.primary_color || "#2563eb"}
                    onChange={(e) =>
                      setEditing((p) => ({
                        ...p,
                        primary_color: e.target.value,
                      }))
                    }
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label>Logo URL override (optional)</Label>
                  <Input
                    value={editing.logo_url || ""}
                    onChange={(e) =>
                      setEditing((p) => ({
                        ...p,
                        logo_url: e.target.value || null,
                      }))
                    }
                    placeholder="Leave blank to use organization logo"
                  />
                </div>
                <div>
                  <Label>From name</Label>
                  <Input
                    value={editing.from_name || ""}
                    onChange={(e) =>
                      setEditing((p) => ({ ...p, from_name: e.target.value }))
                    }
                  />
                </div>
                <div>
                  <Label>From email</Label>
                  <Input
                    value={editing.from_email || ""}
                    onChange={(e) =>
                      setEditing((p) => ({ ...p, from_email: e.target.value }))
                    }
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label>From address</Label>
                  <Input
                    value={editing.from_address || ""}
                    onChange={(e) =>
                      setEditing((p) => ({
                        ...p,
                        from_address: e.target.value,
                      }))
                    }
                  />
                </div>
                <div>
                  <Label>Default fee type</Label>
                  <select
                    className="h-10 w-full rounded-md border px-3 text-sm"
                    value={editing.default_fee_type || "percent"}
                    onChange={(e) =>
                      setEditing((p) => ({
                        ...p,
                        default_fee_type: e.target.value as "percent" | "flat",
                      }))
                    }
                  >
                    <option value="percent">% of salary</option>
                    <option value="flat">Flat fee</option>
                  </select>
                </div>
                {(editing.default_fee_type || "percent") === "percent" ? (
                  <div>
                    <Label>Default fee %</Label>
                    <Input
                      type="number"
                      value={editing.default_fee_percent ?? 20}
                      onChange={(e) =>
                        setEditing((p) => ({
                          ...p,
                          default_fee_percent: Number(e.target.value),
                        }))
                      }
                    />
                  </div>
                ) : (
                  <div>
                    <Label>Default flat ($)</Label>
                    <Input
                      type="number"
                      value={editing.default_fee_flat ?? 0}
                      onChange={(e) =>
                        setEditing((p) => ({
                          ...p,
                          default_fee_flat: Number(e.target.value),
                        }))
                      }
                    />
                  </div>
                )}
                <div className="sm:col-span-2">
                  <Label>Payment terms</Label>
                  <textarea
                    className="w-full min-h-[70px] rounded-md border px-3 py-2 text-sm"
                    value={editing.payment_terms || ""}
                    onChange={(e) =>
                      setEditing((p) => ({
                        ...p,
                        payment_terms: e.target.value,
                      }))
                    }
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label>Footer</Label>
                  <Input
                    value={editing.footer_text || ""}
                    onChange={(e) =>
                      setEditing((p) => ({
                        ...p,
                        footer_text: e.target.value,
                      }))
                    }
                  />
                </div>
                <label className="flex items-center gap-2 text-sm sm:col-span-2">
                  <input
                    type="checkbox"
                    checked={!!editing.is_default}
                    onChange={(e) =>
                      setEditing((p) => ({
                        ...p,
                        is_default: e.target.checked,
                      }))
                    }
                  />
                  Set as default template
                </label>
              </div>
              <div className="flex gap-2">
                <Button disabled={saving} onClick={() => void save()}>
                  {saving ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  Save template
                </Button>
                <Button variant="outline" onClick={() => setEditing(null)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent invoices</CardTitle>
          <CardDescription>
            Draft → Sent → Paid · Void. PDF download on each row.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {invoices.length === 0 ? (
            <p className="text-sm text-slate-600">
              No invoices yet. Create one from a job page.
            </p>
          ) : (
            <ul className="space-y-2">
              {invoices.slice(0, 25).map((inv) => (
                <li
                  key={inv.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900">
                      {inv.invoice_number}{" "}
                      <span className="font-normal text-slate-500">
                        · {inv.status}
                      </span>
                    </p>
                    <p className="text-xs text-slate-500 truncate">
                      {inv.client_name}
                      {inv.job_title ? ` · ${inv.job_title}` : ""} · $
                      {Number(inv.total || 0).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <select
                      className="h-8 rounded border px-2 text-xs"
                      value={inv.status}
                      onChange={(e) => void setStatus(inv.id, e.target.value)}
                    >
                      <option value="draft">Draft</option>
                      <option value="sent">Sent</option>
                      <option value="paid">Paid</option>
                      <option value="void">Void</option>
                    </select>
                    <Button size="sm" variant="outline" asChild>
                      <a
                        href={`/api/invoices/${inv.id}/pdf`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <ExternalLink className="h-3.5 w-3.5 mr-1" />
                        PDF
                      </a>
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-slate-500">
            Job page → <strong>Create invoice</strong> pre-fills client and fee
            from the req.{" "}
            <Link href="/dashboard/jobs" className="text-blue-600 underline">
              Go to jobs
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
