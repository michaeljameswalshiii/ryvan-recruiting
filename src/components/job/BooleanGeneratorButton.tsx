"use client";

import { useState } from "react";
import { Binary, Check, Copy, Loader2, RefreshCw, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import type { BooleanCache, BooleanString } from "@/lib/sourcing/boolean-prompt";

type BooleanResponse = BooleanCache & {
  cached?: boolean;
  regenerated?: boolean;
  saved?: boolean;
  error?: string;
};

interface BooleanGeneratorButtonProps {
  jobId: string;
  jobTitle?: string;
  className?: string;
}

function platformTone(platform: string): string {
  const p = platform.toLowerCase();
  if (p.includes("linkedin")) return "border-sky-200 bg-sky-50 text-sky-800";
  if (p.includes("indeed")) return "border-indigo-200 bg-indigo-50 text-indigo-800";
  if (p.includes("apollo")) return "border-amber-200 bg-amber-50 text-amber-800";
  if (p.includes("google")) return "border-emerald-200 bg-emerald-50 text-emerald-800";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

export function BooleanGeneratorButton({
  jobId,
  jobTitle,
  className,
}: BooleanGeneratorButtonProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [result, setResult] = useState<BooleanResponse | null>(null);
  const [drafts, setDrafts] = useState<BooleanString[]>([]);
  const [dirty, setDirty] = useState(false);

  const applyPayload = (data: BooleanResponse) => {
    setResult(data);
    setDrafts(Array.isArray(data.strings) ? data.strings : []);
    setDirty(false);
  };

  const loadOrGenerate = async (regenerate = false) => {
    if (!jobId) {
      toast.error("Missing job id");
      return;
    }
    setLoading(true);
    setOpen(true);
    if (regenerate) {
      setResult(null);
      setDrafts([]);
    }
    try {
      if (!regenerate) {
        const cachedRes = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/boolean`);
        const cached = (await cachedRes.json().catch(() => ({}))) as BooleanResponse;
        if (cachedRes.ok && cached.strings?.length) {
          applyPayload({ ...cached, cached: true });
          return;
        }
      }

      const res = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/boolean`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ regenerate }),
      });
      const data = (await res.json().catch(() => ({}))) as BooleanResponse;
      if (!res.ok) {
        throw new Error(data.error || "Boolean Generator failed");
      }
      applyPayload(data);
      if (regenerate) toast.success("Generated fresh Boolean strings");
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to generate Boolean strings";
      toast.error(message);
      setResult({ generatedAt: "", strings: [], error: message });
    } finally {
      setLoading(false);
    }
  };

  const copyQuery = async (query: string, index: number) => {
    try {
      await navigator.clipboard.writeText(query);
      setCopiedIndex(index);
      toast.success("Copied Boolean string");
      window.setTimeout(() => setCopiedIndex((cur) => (cur === index ? null : cur)), 1400);
    } catch {
      toast.error("Could not copy");
    }
  };

  const updateDraft = (index: number, patch: Partial<BooleanString>) => {
    setDrafts((prev) =>
      prev.map((row, i) => (i === index ? { ...row, ...patch } : row))
    );
    setDirty(true);
  };

  const saveEdits = async () => {
    if (!jobId || !drafts.length) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/boolean`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ strings: drafts }),
      });
      const data = (await res.json().catch(() => ({}))) as BooleanResponse;
      if (!res.ok) throw new Error(data.error || "Save failed");
      applyPayload({ ...data, saved: true });
      toast.success("Saved Boolean strings on this job");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not save edits");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className={
          className ||
          "border-gray-200 bg-white text-gray-800 hover:bg-gray-50"
        }
        onClick={() => void loadOrGenerate(false)}
        disabled={loading || !jobId}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : (
          <Binary className="h-4 w-4 mr-2" />
        )}
        Boolean Generator
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Boolean Generator</DialogTitle>
            <DialogDescription>
              Ready-to-paste search strings for{" "}
              <span className="font-medium text-slate-700">
                {jobTitle || "this job"}
              </span>
              . Copy into LinkedIn Recruiter, Indeed, Apollo, or Google.
            </DialogDescription>
          </DialogHeader>

          {loading ? (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-sm text-slate-500">
              <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
              Building Boolean variants from the title, tags, and description…
            </div>
          ) : result?.error && !drafts.length ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {result.error}
            </div>
          ) : (
            <div className="space-y-3">
              {drafts.map((row, index) => (
                <article
                  key={`${row.platform}-${index}`}
                  className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
                >
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${platformTone(row.platform)}`}
                    >
                      {row.platform}
                    </span>
                    <input
                      value={row.label}
                      onChange={(e) => updateDraft(index, { label: e.target.value })}
                      className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1 text-sm font-semibold text-slate-900 hover:border-slate-200 focus:border-slate-300 focus:outline-none"
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8"
                      onClick={() => void copyQuery(row.query, index)}
                    >
                      {copiedIndex === index ? (
                        <Check className="h-3.5 w-3.5 mr-1.5 text-emerald-600" />
                      ) : (
                        <Copy className="h-3.5 w-3.5 mr-1.5" />
                      )}
                      Copy
                    </Button>
                  </div>
                  <textarea
                    value={row.query}
                    onChange={(e) => updateDraft(index, { query: e.target.value })}
                    rows={3}
                    className="w-full resize-y rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-[12px] leading-5 text-slate-800 focus:border-slate-400 focus:outline-none"
                  />
                  <input
                    value={row.notes || ""}
                    onChange={(e) => updateDraft(index, { notes: e.target.value })}
                    placeholder="When to use this variant"
                    className="mt-2 w-full rounded-md border border-transparent bg-transparent px-1 text-xs text-slate-500 hover:border-slate-200 focus:border-slate-300 focus:outline-none"
                  />
                </article>
              ))}

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <p className="text-[11px] text-slate-400">
                  {result?.cached
                    ? "Cached on this job — reopen is instant."
                    : result?.generatedAt
                      ? "Saved on this job for next time."
                      : ""}
                  {dirty ? " Unsaved edits." : ""}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void saveEdits()}
                    disabled={saving || !dirty || !drafts.length}
                  >
                    {saving ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    ) : (
                      <Save className="h-3.5 w-3.5 mr-1.5" />
                    )}
                    Save edits
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void loadOrGenerate(true)}
                    disabled={loading}
                  >
                    <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                    Regenerate
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

export default BooleanGeneratorButton;
