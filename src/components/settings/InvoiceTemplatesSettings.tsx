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
} from "lucide-react";
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
});

export function InvoiceTemplatesSettings() {
  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [orgLogo, setOrgLogo] = useState<string | null>(null);
  const [orgName, setOrgName] = useState("");
  const [editing, setEditing] = useState<Partial<Template> | null>(null);
  const [saving, setSaving] = useState(false);

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
              Brand variations for placement invoices. Org logo from Settings →
              Organization is the default; override per template if needed.
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
              No templates yet. Create one to set fee defaults, colors, and payment terms.
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
                    {t.logo_url ? " · Custom logo" : " · Org logo"}
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
