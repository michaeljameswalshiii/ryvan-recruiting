"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, FileText, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { parseSalaryBasis, formatMoney, computePlacementFee } from "@/lib/invoices/fee";

type Template = {
  id: string;
  name: string;
  is_default?: boolean;
  default_fee_type?: "percent" | "flat";
  default_fee_percent?: number;
  default_fee_flat?: number;
};

type Props = {
  open: boolean;
  onClose: () => void;
  /** Optional — invoices can be created from company without a job */
  jobId?: string;
  jobTitle?: string;
  /** Company Dynamo id — used for activity/notes on the company record */
  companyId?: string;
  companyName?: string;
  salaryRange?: string;
  candidates?: Array<{ id: string; name: string }>;
  onCreated?: (invoice: { id: string; invoice_number: string }) => void;
};

export function CreateInvoiceModal({
  open,
  onClose,
  jobId,
  jobTitle,
  companyId,
  companyName,
  salaryRange,
  candidates = [],
  onCreated,
}: Props) {
  const sal = useMemo(() => parseSalaryBasis(salaryRange), [salaryRange]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [templateId, setTemplateId] = useState("");
  const [clientName, setClientName] = useState(companyName || "");
  const [clientEmail, setClientEmail] = useState("");
  const [candidateId, setCandidateId] = useState("");
  const [feeType, setFeeType] = useState<"percent" | "flat">("percent");
  const [feePercent, setFeePercent] = useState(20);
  const [feeFlat, setFeeFlat] = useState(0);
  const [salaryBasis, setSalaryBasis] = useState(sal.basis || 0);
  const [notes, setNotes] = useState("");
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [createdNumber, setCreatedNumber] = useState("");

  useEffect(() => {
    if (!open) return;
    setClientName(companyName || "");
    setSalaryBasis(sal.basis || 0);
    setCreatedId(null);
    setLoading(true);
    (async () => {
      try {
        const res = await fetch("/api/invoice-templates", {
          credentials: "include",
        });
        const data = await res.json();
        if (!res.ok) {
          if (res.status === 403) {
            toast.error("Only company admins can create invoices");
          } else {
            toast.error(data.error || "Failed to load templates");
          }
          return;
        }
        const tpls: Template[] = data.templates || [];
        setTemplates(tpls);
        const def = tpls.find((t) => t.is_default) || tpls[0];
        if (def) {
          setTemplateId(def.id);
          setFeeType(def.default_fee_type || "percent");
          setFeePercent(def.default_fee_percent ?? 20);
          setFeeFlat(def.default_fee_flat || 0);
        }
      } catch {
        toast.error("Failed to load invoice templates");
      } finally {
        setLoading(false);
      }
    })();
  }, [open, companyName, sal.basis]);

  const previewFee = computePlacementFee({
    feeType,
    feePercent,
    feeFlat,
    salaryBasis,
  });

  const candidateName =
    candidates.find((c) => c.id === candidateId)?.name || undefined;

  const create = async (downloadAfter: boolean) => {
    if (!clientName.trim()) {
      toast.error("Client name is required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/invoices", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_id: jobId || undefined,
          client_id: companyId || undefined,
          client_name: clientName.trim(),
          client_email: clientEmail.trim() || undefined,
          candidate_id: candidateId || undefined,
          candidate_name: candidateName,
          template_id: templateId || undefined,
          fee_type: feeType,
          fee_percent: feeType === "percent" ? feePercent : undefined,
          fee_flat: feeType === "flat" ? feeFlat : undefined,
          salary_basis:
            feeType === "percent" ? salaryBasis || undefined : undefined,
          salary_range_label: salaryRange,
          notes: notes.trim() || undefined,
          status: "draft",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to create invoice");
        return;
      }
      const inv = data.invoice;
      setCreatedId(inv.id);
      setCreatedNumber(inv.invoice_number);
      onCreated?.(inv);
      toast.success(`Invoice ${inv.invoice_number} created (Draft)`);
      if (downloadAfter) {
        window.open(`/api/invoices/${inv.id}/pdf`, "_blank");
      }
    } catch {
      toast.error("Failed to create invoice");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-hidden
      />
      <div
        data-ink-on-light
        data-popover-surface
        className="surface-light relative z-10 w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-gray-200 bg-white p-5 shadow-xl"
      >
        <div className="mb-4 flex items-start justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
              <FileText className="h-5 w-5 text-emerald-600" />
              Create invoice
            </h2>
            <p className="text-xs text-slate-600 mt-0.5">
              Placement fee
              {jobTitle
                ? ` for ${jobTitle}`
                : companyName
                  ? ` for ${companyName}`
                  : ""}{" "}
              · logged on company activity · PDF download
            </p>
          </div>
          <button
            type="button"
            className="text-sm text-slate-500 hover:text-slate-800"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          </div>
        ) : createdId ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
              <p className="font-semibold">{createdNumber} saved as Draft</p>
              <p className="text-xs mt-1">
                {companyId
                  ? "Logged on this company timeline / notes. "
                  : ""}
                Manage status under Settings → Invoices or download the PDF now.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() =>
                  window.open(`/api/invoices/${createdId}/pdf`, "_blank")
                }
              >
                <Download className="h-4 w-4 mr-2" />
                Download PDF
              </Button>
              <Button variant="outline" onClick={onClose}>
                Done
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <Label>Client (bill to)</Label>
              <Input
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="Client company name"
              />
            </div>
            <div>
              <Label>Client email (optional)</Label>
              <Input
                type="email"
                value={clientEmail}
                onChange={(e) => setClientEmail(e.target.value)}
              />
            </div>
            {candidates.length > 0 && (
              <div>
                <Label>Candidate (optional)</Label>
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={candidateId}
                  onChange={(e) => setCandidateId(e.target.value)}
                >
                  <option value="">— None —</option>
                  {candidates.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <Label>Template</Label>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={templateId}
                onChange={(e) => {
                  const id = e.target.value;
                  setTemplateId(id);
                  const t = templates.find((x) => x.id === id);
                  if (t) {
                    setFeeType(t.default_fee_type || "percent");
                    setFeePercent(t.default_fee_percent ?? 20);
                    setFeeFlat(t.default_fee_flat || 0);
                  }
                }}
              >
                {templates.length === 0 && (
                  <option value="">Default (no custom template)</option>
                )}
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                    {t.is_default ? " (default)" : ""}
                  </option>
                ))}
              </select>
              {templates.length === 0 && (
                <p className="text-[11px] text-slate-500 mt-1">
                  Tip: create branded templates under Settings → Invoices.
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Fee type</Label>
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={feeType}
                  onChange={(e) =>
                    setFeeType(e.target.value as "percent" | "flat")
                  }
                >
                  <option value="percent">% of salary</option>
                  <option value="flat">Flat fee</option>
                </select>
              </div>
              {feeType === "percent" ? (
                <div>
                  <Label>Fee %</Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step={0.5}
                    value={feePercent}
                    onChange={(e) => setFeePercent(Number(e.target.value))}
                  />
                </div>
              ) : (
                <div>
                  <Label>Flat amount ($)</Label>
                  <Input
                    type="number"
                    min={0}
                    step={100}
                    value={feeFlat}
                    onChange={(e) => setFeeFlat(Number(e.target.value))}
                  />
                </div>
              )}
            </div>
            {feeType === "percent" && (
              <div>
                <Label>Salary basis ($)</Label>
                <Input
                  type="number"
                  min={0}
                  step={1000}
                  value={salaryBasis || ""}
                  onChange={(e) => setSalaryBasis(Number(e.target.value))}
                  placeholder={
                    sal.basis
                      ? `Default mid from range: ${sal.basis}`
                      : "e.g. 75000"
                  }
                />
                {sal.label && (
                  <p className="text-[11px] text-slate-500 mt-1">
                    From job compensation: {sal.label}
                  </p>
                )}
              </div>
            )}
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
              <span className="text-slate-600">Preview total: </span>
              <span className="font-semibold text-slate-900">
                {formatMoney(previewFee.amount)}
              </span>
              <span className="block text-[11px] text-slate-500 mt-0.5">
                {previewFee.description}
              </span>
            </div>
            <div>
              <Label>Notes (optional)</Label>
              <textarea
                className="w-full min-h-[70px] rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Payment instructions, PO #, etc."
              />
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button disabled={saving} onClick={() => void create(true)}>
                {saving ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Download className="h-4 w-4 mr-2" />
                )}
                Create & download PDF
              </Button>
              <Button
                variant="outline"
                disabled={saving}
                onClick={() => void create(false)}
              >
                Save draft only
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
