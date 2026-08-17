"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  Calendar,
  ChevronDown,
  DollarSign,
  ExternalLink,
  FileText,
  Globe,
  Loader2,
  MapPin,
  Pencil,
  Sparkles,
  Trash2,
  UserPlus,
  Briefcase,
  Users,
  Paperclip,
  Copy,
  Percent,
} from "lucide-react";
import {
  useJob,
  useLinkCandidateToJob,
  useUnlinkCandidateFromJob,
  useUpdateCandidateStageInJob,
  useUpdateJob,
} from "@/lib/hooks/query-job";
import { useLeads } from "@/lib/hooks/query-lead";
import { useClient } from "@/lib/hooks/query-client";
import { useAssignmentOwners } from "@/lib/hooks/use-assignment-owners";
import {
  commissionFromFee,
  formatCommission,
  formatSalaryToolbar,
  parseFeePercent,
} from "@/lib/fees/placement-fee";
import JobEditModal from "@/components/job/JobEditModal";
import { JobActivityNotes } from "@/components/job/JobActivityNotes";
import { FitScoreBadge, type FitGrade } from "@/components/job/FitScoreBadge";
import { FillReqPlaybookButton } from "@/components/job/FillReqPlaybookButton";
import { BooleanGeneratorButton } from "@/components/job/BooleanGeneratorButton";
import { JobHiringManagerCard } from "@/components/job/JobHiringManagerCard";
import { JobDescriptionPreview } from "@/components/job/JobDescriptionPreview";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { APPLICATION_STAGES, getStageLabel } from "@/lib/schemas/lead";
import {
  JOB_STATUSES,
  normalizeJobStatus,
  jobStatusBadgeClasses,
  isJobOpenForCareers,
  type JobStatus,
} from "@/lib/jobs/status";
import {
  PIPELINE_BUCKETS,
  candidateMatchesBucket,
  pipelineHref,
} from "@/lib/jobs/pipeline-buckets";
import { toast } from "sonner";
import { CreateInvoiceModal } from "@/components/invoices/CreateInvoiceModal";
import { hasPermission } from "@/lib/roles";
import { EntityFilesPanel } from "@/components/shared/EntityFilesPanel";
import { CopyTextButton } from "@/components/shared/CopyTextButton";
import { AccountRepPill } from "@/components/shared/AccountRepPill";
import { matchControlledTags } from "@/lib/tags";

type FitScoreClient = {
  score: number;
  grade: FitGrade | string;
  domainFit?: { score: number; grade?: FitGrade | string };
  toolReadiness?: {
    score: number;
    grade?: FitGrade | string;
    applicable?: boolean;
  };
  reasons?: string[];
  strengths?: string[];
  gaps?: string[];
  summary?: string;
};

const STAGES = APPLICATION_STAGES.map((s) => s.value);

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function avatarColor(name: string) {
  const palette = [
    "bg-blue-600",
    "bg-indigo-600",
    "bg-violet-600",
    "bg-emerald-600",
    "bg-teal-600",
    "bg-orange-600",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash + name.charCodeAt(i) * 17) % palette.length;
  return palette[hash];
}

function formatStatusLabel(status?: string) {
  return normalizeJobStatus(status);
}

function statusBadgeClasses(status?: string) {
  return jobStatusBadgeClasses(status);
}

function shortJobId(id?: string) {
  if (!id) return "—";
  return id.length > 8 ? `JOB-${id.slice(0, 8).toUpperCase()}` : `JOB-${id.toUpperCase()}`;
}

export default function JobDetailPage() {
  const params = useParams<{ id: string }>();
  const jobId = params?.id || "";

  const { data: job, isLoading, isError, error } = useJob(jobId);
  const { data: jobCompany } = useClient(String((job as any)?.companyId || ""));
  const { data: ownerMap = {} } = useAssignmentOwners("job");
  const { data: allCandidates = [], isLoading: loadingCandidates } = useLeads();
  const updateJob = useUpdateJob();
  const linkCandidate = useLinkCandidateToJob();
  const unlinkCandidate = useUnlinkCandidateFromJob();
  const updateStage = useUpdateCandidateStageInJob();

  const [candidateId, setCandidateId] = useState("");
  const [candidateName, setCandidateName] = useState("");
  const [candidateEmail, setCandidateEmail] = useState("");
  const [newCandidateStage, setNewCandidateStage] = useState("sourced");
  const [candidateNotes, setCandidateNotes] = useState("");
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/auth/session", { credentials: "include" });
        if (!res.ok) return;
        const data = await res.json();
        setUserRole(data?.user?.role || data?.role || null);
      } catch {
        /* ignore */
      }
    })();
  }, []);

  const canInvoice = hasPermission(userRole, "team_admin");
  const [detailTab, setDetailTab] = useState<"overview" | "files">("overview");
  const [candidateSearch, setCandidateSearch] = useState("");
  const [showLinkForm, setShowLinkForm] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editFocusDescription, setEditFocusDescription] = useState(false);
  const linkFormRef = useRef<HTMLDivElement>(null);
  const [fitByCandidate, setFitByCandidate] = useState<
    Record<string, FitScoreClient>
  >({});
  const [fitLoading, setFitLoading] = useState(false);
  /** candidateId currently re-scoring */
  const [fitRescoringId, setFitRescoringId] = useState<string | null>(null);
  /** candidateId with expanded fit summary */
  const [expandedFitId, setExpandedFitId] = useState<string | null>(null);

  // Support both field names used across the codebase
  const linkedCandidates = useMemo(() => {
    if (!job) return [];
    if (Array.isArray(job.linkedCandidates)) return job.linkedCandidates;
    if (Array.isArray(job.candidates)) return job.candidates;
    return [];
  }, [job]);

  // Batch-fetch fit scores for linked candidates (non-blocking)
  useEffect(() => {
    if (!jobId || linkedCandidates.length === 0) {
      setFitByCandidate({});
      return;
    }

    // Seed from any fit fields already on the linked candidate records
    const seeded: Record<string, FitScoreClient> = {};
    for (const lc of linkedCandidates as any[]) {
      if (lc?.candidateId && typeof lc.fitScore === "number") {
        seeded[lc.candidateId] = {
          score: lc.fitScore,
          grade: lc.fitGrade || "C",
          domainFit:
            typeof lc.fitDomainScore === "number"
              ? {
                  score: lc.fitDomainScore,
                  grade: lc.fitDomainGrade || "C",
                }
              : undefined,
          toolReadiness:
            typeof lc.fitToolScore === "number" ||
            lc.fitToolApplicable === false
              ? {
                  score:
                    typeof lc.fitToolScore === "number" ? lc.fitToolScore : 100,
                  grade: lc.fitToolGrade || "C",
                  applicable: lc.fitToolApplicable !== false,
                }
              : undefined,
          reasons: Array.isArray(lc.fitReasons) ? lc.fitReasons : [],
          strengths: Array.isArray(lc.fitStrengths) ? lc.fitStrengths : [],
          gaps: Array.isArray(lc.fitGaps) ? lc.fitGaps : [],
          summary:
            typeof lc.fitSummary === "string" ? lc.fitSummary : undefined,
        };
      }
    }
    if (Object.keys(seeded).length) {
      setFitByCandidate((prev) => ({ ...seeded, ...prev }));
    }

    let cancelled = false;
    const ids = linkedCandidates
      .map((c: any) => c?.candidateId)
      .filter(Boolean) as string[];

    // Skip fetch if we already have scores for everyone from seed
    const missing = ids.filter((id) => !seeded[id]);
    if (missing.length === 0 && ids.length > 0) return;

    setFitLoading(true);
    (async () => {
      try {
        const res = await fetch(`/api/jobs/${jobId}/fit-score`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            candidateIds: missing.length ? missing : ids,
            persist: true,
          }),
        });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        const next: Record<string, FitScoreClient> = { ...seeded };
        for (const row of data.scores || []) {
          if (row?.candidateId && row.fit) {
            next[row.candidateId] = {
              score: row.fit.score,
              grade: row.fit.grade,
              domainFit: row.fit.domainFit,
              toolReadiness: row.fit.toolReadiness,
              reasons: row.fit.reasons,
              strengths: row.fit.strengths,
              gaps: row.fit.gaps,
              summary: row.fit.summary,
            };
          }
        }
        if (!cancelled) setFitByCandidate(next);
      } catch {
        /* non-blocking */
      } finally {
        if (!cancelled) setFitLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [jobId, linkedCandidates]);

  const runFitForCandidate = async (cid: string) => {
    if (!jobId || !cid) return;
    setFitRescoringId(cid);
    try {
      const res = await fetch(`/api/jobs/${jobId}/fit-score`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateId: cid, persist: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || "Failed to score fit");
      }
      const row =
        Array.isArray(data.scores) && data.scores.length
          ? data.scores[0]
          : null;
      const fit = row?.fit || data.fit;
      if (!fit) throw new Error("No fit result returned");
      setFitByCandidate((prev) => ({
        ...prev,
        [cid]: {
          score: fit.score,
          grade: fit.grade,
          domainFit: fit.domainFit,
          toolReadiness: fit.toolReadiness,
          reasons: fit.reasons,
          strengths: fit.strengths,
          gaps: fit.gaps,
          summary: fit.summary,
        },
      }));
      setExpandedFitId(cid);
      const bits = [
        fit.domainFit
          ? `Domain ${fit.domainFit.score}`
          : null,
        fit.toolReadiness?.applicable !== false && fit.toolReadiness
          ? `Tools ${fit.toolReadiness.score}`
          : null,
        `Overall ${fit.score} (${fit.grade})`,
      ].filter(Boolean);
      toast.success(`AI fit: ${bits.join(" · ")}`);
    } catch (err: any) {
      toast.error(err?.message || "AI fit failed");
    } finally {
      setFitRescoringId(null);
    }
  };

  const pipelineCounts = useMemo(() => {
    const total = linkedCandidates.length;
    return PIPELINE_BUCKETS.map((bucket) => {
      if (bucket.match === null) {
        return { ...bucket, count: total };
      }
      const count = linkedCandidates.filter((lc: any) =>
        candidateMatchesBucket(lc.stage, bucket)
      ).length;
      return { ...bucket, count };
    });
  }, [linkedCandidates]);

  const activeInPipeline = useMemo(() => {
    return linkedCandidates.filter((lc: any) => {
      const stage = String(lc.stage || "").toLowerCase();
      return !["rejected", "not_interested", "withdrawn", "offer_declined"].includes(stage);
    }).length;
  }, [linkedCandidates]);

  const progressPct = useMemo(() => {
    if (linkedCandidates.length === 0) return 0;
    // Weight later stages higher for a simple visual progress signal
    const weights: Record<string, number> = {
      sourced: 10,
      left_message: 15,
      text: 15,
      email: 15,
      other: 15,
      contacted: 20,
      pre_screened: 30,
      submitted: 40,
      interviewing: 55,
      offer_out: 75,
      offer_accepted: 90,
      placed: 100,
      offer_declined: 0,
      rejected: 0,
      not_interested: 0,
      applied: 15,
      screening: 30,
      offered: 75,
    };
    const sum = linkedCandidates.reduce((acc: number, lc: any) => {
      const key = String(lc.stage || "sourced").toLowerCase();
      return acc + (weights[key] ?? 20);
    }, 0);
    return Math.min(100, Math.round(sum / linkedCandidates.length));
  }, [linkedCandidates]);

  const onChangeJobStatus = async (status: string) => {
    if (!jobId) return;
    const canonical = normalizeJobStatus(status);
    try {
      await updateJob.mutateAsync({
        jobId,
        jobData: { status: canonical },
      });
      toast.success(`Status set to ${canonical}`);
    } catch (e: any) {
      toast.error(e?.message || "Failed to update status");
    }
  };

  /** Explicit true = on; false = off; undefined (legacy) = treated as on while Open */
  const isShownOnWebsite = (job as any)?.showOnWebsite !== false;
  const currentJobStatus = normalizeJobStatus((job as any)?.status);
  const isOpenStatus = isJobOpenForCareers((job as any)?.status);

  const onToggleShowOnWebsite = async (next: boolean) => {
    if (!jobId) return;
    try {
      await updateJob.mutateAsync({
        jobId,
        jobData: { showOnWebsite: next },
      });
      toast.success(
        next
          ? "Job will appear on the public careers site (when Open)"
          : "Job hidden from the public careers site"
      );
    } catch (e: any) {
      toast.error(e?.message || "Failed to update website visibility");
    }
  };

  const linkedIds = useMemo(() => {
    return new Set(
      linkedCandidates.map((c: any) => c.candidateId).filter(Boolean)
    );
  }, [linkedCandidates]);

  const availableCandidates = useMemo(() => {
    const q = candidateSearch.trim().toLowerCase();
    return (Array.isArray(allCandidates) ? allCandidates : [])
      .filter((c: any) => c?.id && !linkedIds.has(c.id))
      .filter((c: any) => {
        if (!q) return true;
        const hay = [c.name, c.email, c.title, c.phone, c.id]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 50);
  }, [allCandidates, linkedIds, candidateSearch]);

  const selectedCandidate = useMemo(() => {
    if (!candidateId) return null;
    return (
      (Array.isArray(allCandidates) ? allCandidates : []).find(
        (c: any) => String(c.id) === String(candidateId)
      ) || null
    );
  }, [allCandidates, candidateId]);

  const selectedTagMatch = useMemo(() => {
    const required = Array.isArray((job as any)?.tags) ? (job as any).tags : [];
    const candTags = Array.isArray(selectedCandidate?.tags)
      ? selectedCandidate.tags
      : [];
    if (!required.length || !selectedCandidate) return null;
    return matchControlledTags({ required, candidate: candTags });
  }, [job, selectedCandidate]);

  const selectCandidate = (c: any) => {
    setCandidateId(c.id);
    setCandidateName(c.name || "Unknown");
    setCandidateEmail(c.email || "");
    setCandidateSearch(c.name || "");
  };

  const onLinkCandidate = async () => {
    if (!jobId) return;
    if (!candidateId || !candidateName) {
      toast.error("Select a candidate from the list first");
      return;
    }
    try {
      await linkCandidate.mutateAsync({
        jobId,
        candidateData: {
          candidateId,
          candidateName,
          candidateEmail: candidateEmail || undefined,
          stage: newCandidateStage,
          notes: candidateNotes || undefined,
        },
      });

      setCandidateId("");
      setCandidateName("");
      setCandidateEmail("");
      setCandidateNotes("");
      setCandidateSearch("");
      setNewCandidateStage("sourced");
      setShowLinkForm(false);
    } catch {
      /* toast from mutation */
    }
  };

  const openAddCandidate = () => {
    setShowLinkForm(true);
    setTimeout(() => {
      linkFormRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 50);
  };

  const isMutating =
    updateJob.isPending ||
    linkCandidate.isPending ||
    unlinkCandidate.isPending ||
    updateStage.isPending;

  if (!jobId) {
    return (
      <div className="p-2">
        <p className="text-red-600">Missing job ID.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="flex items-center gap-2 text-gray-700">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading job details...
        </div>
      </div>
    );
  }

  if (isError || !job) {
    return (
      <div className="space-y-4">
        <Link
          href="/dashboard/jobs"
          className="inline-flex items-center text-sm text-blue-600 hover:underline"
        >
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to Jobs
        </Link>
        <div data-ink-on-light className="bg-white border rounded-xl p-6 shadow-sm">
          <p className="text-red-600 font-medium">Failed to load job details.</p>
          {error instanceof Error && (
            <p className="text-sm text-gray-600 mt-1">{error.message}</p>
          )}
        </div>
      </div>
    );
  }

  const postedLabel = job.createdAt
    ? new Date(job.createdAt).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : job.created_at
      ? new Date(job.created_at).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
          year: "numeric",
        })
      : null;

  const feePercent =
    parseFeePercent((job as any).fee_percent ?? (job as any).feePercent) ??
    parseFeePercent(
      (jobCompany as any)?.fee_percent ?? (jobCompany as any)?.feePercent
    );
  const feeLabel = feePercent != null ? `${feePercent}%` : "—";
  const salaryLabel =
    formatSalaryToolbar(job.salaryRange || (job as any).salary_range) || "—";
  const commissionAmount = commissionFromFee(
    job.salaryRange || (job as any).salary_range,
    feePercent
  );
  const commissionLabel = formatCommission(commissionAmount) || "—";
  const ownerName = (
    ownerMap[String(job.id)]?.name ||
    (job as any).ownerName ||
    (job as any).createdByName ||
    ""
  ).trim();
  const isPosted = isShownOnWebsite && isOpenStatus;
  const companyId = String(
    job.companyId || (job as any).company_id || (jobCompany as any)?.id || ""
  ).trim();
  const companyHref = companyId
    ? `/dashboard/companies/${encodeURIComponent(companyId)}`
    : "";
  const companyName = String(job.companyName || (job as any).company_name || "").trim();
  const jobTags = Array.isArray((job as any).tags)
    ? (job as any).tags.map(String).filter(Boolean)
    : [];

  return (
    <div className="space-y-5 max-w-7xl -mt-1">
      {/* Page header — title left, actions in two rows */}
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <Link
            href="/dashboard/jobs"
            className="inline-flex items-center text-sm text-blue-600 hover:underline mb-1"
          >
            <ArrowLeft className="h-4 w-4 mr-1" /> Jobs
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
              {job.title}
            </h1>
            <CopyTextButton value={job.title} label="job title" />
            <span
              className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusBadgeClasses(job.status)}`}
            >
              {formatStatusLabel(job.status)}
            </span>
            {isPosted ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-800">
                <Globe className="h-3 w-3" />
                On website
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                <Globe className="h-3 w-3" />
                Not on website
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-slate-500">
            <span className="font-mono text-xs text-slate-400">
              {shortJobId(job.id)}
            </span>
            {companyName ? (
              <>
                <span className="mx-1.5">•</span>
                {companyHref ? (
                  <Link
                    href={companyHref}
                    className="text-blue-600 hover:underline"
                    title={`Open ${companyName}`}
                  >
                    {companyName}
                  </Link>
                ) : (
                  companyName
                )}
                <CopyTextButton value={companyName} label="company name" />
              </>
            ) : null}
            {postedLabel ? (
              <>
                <span className="mx-1.5">•</span>
                Posted {postedLabel}
              </>
            ) : null}
          </p>
          {jobTags.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {jobTags.map((tag: string) => (
                <span
                  key={tag}
                  className="inline-flex items-center rounded-md border border-violet-200 bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-800"
                >
                  {tag}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        <div className="flex flex-col gap-2 xl:items-end shrink-0">
          <div className="flex flex-wrap items-center gap-2 xl:justify-end">
            <Button size="sm" onClick={openAddCandidate} className="bg-blue-600 hover:bg-blue-700">
              <UserPlus className="h-4 w-4 mr-2" />
              Add Candidate
            </Button>
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
              <Pencil className="h-4 w-4 mr-2" />
              Edit
            </Button>
            <div className="relative">
              <select
                value={currentJobStatus}
                onChange={(e) => onChangeJobStatus(e.target.value)}
                disabled={updateJob.isPending}
                className="appearance-none border border-gray-200 rounded-lg pl-3 pr-8 py-2 text-sm bg-white shadow-sm font-medium text-gray-800"
                aria-label="Job pipeline status"
              >
                {JOB_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
            </div>
            <FillReqPlaybookButton
              jobId={job.id}
              jobTitle={job.title}
              className="border-gray-200 bg-white text-gray-800 hover:bg-gray-50"
            />
            <BooleanGeneratorButton
              jobId={job.id}
              jobTitle={job.title}
              className="border-gray-200 bg-white text-gray-800 hover:bg-gray-50"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2 xl:justify-end">
            <JobCopyButton jobId={String(job.id || jobId)} jobTitle={job.title || "Job"} />
            {isPosted && job.id ? (
              <a
                href={`/careers/${process.env.NEXT_PUBLIC_CAREERS_DEFAULT_SLUG || "ryvan"}/${job.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm hover:bg-gray-50"
              >
                <ExternalLink className="h-4 w-4" />
                View public page
              </a>
            ) : null}
            <label
              className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm shadow-sm cursor-pointer select-none ${
                isShownOnWebsite
                  ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                  : "border-gray-200 bg-white text-gray-700"
              } ${updateJob.isPending ? "opacity-60 pointer-events-none" : ""}`}
              title="Open jobs with this on appear on /careers and Squarespace embeds"
            >
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-gray-300"
                checked={isShownOnWebsite}
                disabled={updateJob.isPending}
                onChange={(e) => void onToggleShowOnWebsite(e.target.checked)}
              />
              <span className="font-medium">Show on website</span>
            </label>
            {canInvoice && (
              <Button
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={() => setInvoiceOpen(true)}
              >
                <FileText className="h-4 w-4 mr-2" />
                Create Invoice
              </Button>
            )}
            <JobDeleteButton jobId={job.id} jobTitle={job.title} />
          </div>
        </div>
      </div>

      {/* Meta strip — company through owner, with fee + commission */}
      <section
        data-ink-on-light
        className="bg-white border border-gray-200 rounded-2xl shadow-sm px-5 py-4"
      >
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-9 gap-4">
          <MetaField
            label="Company"
            value={companyName || "—"}
            href={companyHref || undefined}
            icon={<Building2 className="h-4 w-4" />}
          />
          <MetaField
            label="Location"
            value={job.location || "—"}
            icon={<MapPin className="h-3.5 w-3.5" />}
          />
          <MetaField
            label="Salary"
            value={salaryLabel}
            icon={<DollarSign className="h-3.5 w-3.5" />}
          />
          <MetaField
            label="Fee %"
            value={feeLabel}
            icon={<Percent className="h-3.5 w-3.5" />}
          />
          <MetaField
            label="Commission"
            value={commissionLabel}
            icon={<DollarSign className="h-3.5 w-3.5" />}
          />
          <MetaField
            label="Pipeline"
            value={formatStatusLabel(job.status)}
          />
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">
              Status
            </div>
            <div className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900">
              <span
                className={`h-2 w-2 rounded-full ${
                  isPosted ? "bg-emerald-500" : "bg-slate-300"
                }`}
              />
              {isPosted ? "Posted" : "Not posted"}
            </div>
          </div>
          <MetaField
            label="Posted"
            value={postedLabel || "—"}
            icon={<Calendar className="h-3.5 w-3.5" />}
          />
          <div className="min-w-0 xl:col-span-2">
            {job.id ? (
              <AccountRepPill
                objectType="job"
                objectId={String(job.id)}
                label="Owner"
              />
            ) : ownerName ? (
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">
                  Owner
                </div>
                <div className="inline-flex items-center gap-2 min-w-0">
                  <span
                    className={`h-7 w-7 shrink-0 rounded-full ${avatarColor(ownerName)} text-white text-[10px] font-semibold flex items-center justify-center`}
                  >
                    {getInitials(ownerName)}
                  </span>
                  <span className="truncate text-sm font-medium text-slate-900">
                    {ownerName}
                  </span>
                </div>
              </div>
            ) : (
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">
                  Owner
                </div>
                <span className="text-sm text-gray-400">—</span>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Job detail tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-1 overflow-x-auto">
          {(
            [
              { id: "overview" as const, label: "Overview", icon: Briefcase },
              { id: "files" as const, label: "Files", icon: Paperclip },
            ] as const
          ).map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setDetailTab(t.id)}
                className={`inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                  detailTab === t.id
                    ? "border-blue-600 text-blue-700"
                    : "border-transparent text-gray-500 hover:text-gray-800"
                }`}
              >
                <Icon className="h-4 w-4" />
                {t.label}
              </button>
            );
          })}
        </nav>
      </div>

      {detailTab === "files" && job.id ? (
        <EntityFilesPanel entityType="job" entityId={job.id} />
      ) : null}

      {detailTab === "overview" ? (
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        {/* ─── Main column ─── */}
        <div className="xl:col-span-8 space-y-5">
          {/* Candidate pipeline — WIP tracker → dedicated pipeline page */}
          <section data-ink-on-light className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
              <div>
                <h2 className="text-sm font-semibold tracking-wide text-gray-800 uppercase">
                  Candidate Pipeline — WIP Tracker
                </h2>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  Click a stage to open the full pipeline list for this job
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-500">
                  {linkedCandidates.length} candidate
                  {linkedCandidates.length === 1 ? "" : "s"} attached
                </span>
                <Link
                  href={pipelineHref(jobId, "attached")}
                  className="text-xs font-medium text-blue-600 hover:underline"
                >
                  Open pipeline →
                </Link>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
              {pipelineCounts.map((bucket) => (
                <Link
                  key={bucket.key}
                  href={pipelineHref(jobId, bucket.key)}
                  title={
                    bucket.key === "attached"
                      ? "View all candidates on this job"
                      : `View ${bucket.label} candidates`
                  }
                  className={`rounded-xl ${bucket.bg} ring-1 ${bucket.ring} px-3 py-3 text-center transition-all hover:shadow-md hover:scale-[1.02] hover:ring-2 hover:ring-blue-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500`}
                >
                  <div
                    className={`text-2xl font-semibold tabular-nums ${bucket.text}`}
                  >
                    {bucket.count}
                  </div>
                  <div className="text-[11px] font-medium uppercase tracking-wide text-gray-500 mt-0.5">
                    {bucket.label}
                  </div>
                </Link>
              ))}
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>Pipeline progress</span>
                <span className="tabular-nums">{activeInPipeline} active</span>
              </div>
              <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-blue-500 to-violet-500 transition-all duration-500"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
          </section>

          {/* Activity & notes — main column (job + candidates + company) */}
          <JobActivityNotes
            jobId={job.id || jobId}
            jobTitle={job.title || job.jobTitle}
            linkedCandidates={linkedCandidates}
            companyId={job.companyId}
            companyName={job.companyName}
          />
        </div>

        {/* ─── Right sidebar: hiring manager + JD preview + candidates ─── */}
        <div className="xl:col-span-4 space-y-5">
          <JobHiringManagerCard
            jobId={job.id || jobId}
            companyId={job.companyId}
            companyName={job.companyName}
            job={job}
            compact
          />
          <JobDescriptionPreview
            description={job.description || ""}
            jobTitle={job.title || job.jobTitle}
            onEdit={() => {
              setEditFocusDescription(true);
              setEditOpen(true);
            }}
          />
          <section
            data-ink-on-light
            className="bg-white border border-gray-200 rounded-2xl shadow-sm p-4"
          >
            <div className="flex items-center justify-between gap-2 mb-3">
              <h2 className="text-sm font-semibold tracking-wide text-gray-800 uppercase flex items-center gap-2">
                <Users className="h-4 w-4 text-gray-500" />
                Candidates
                <span className="text-gray-400 font-normal normal-case tracking-normal text-xs">
                  ({linkedCandidates.length})
                </span>
              </h2>
              <div className="flex items-center gap-1.5">
                {linkedCandidates.length > 0 && (
                  <Button asChild variant="ghost" size="sm" className="h-8 text-xs">
                    <Link href={pipelineHref(jobId, "attached")}>
                      Full list
                    </Link>
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={openAddCandidate} className="h-8">
                  <UserPlus className="h-3.5 w-3.5 mr-1" />
                  Add
                </Button>
              </div>
            </div>

            {linkedCandidates.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/80 px-3 py-6 text-center">
                <p className="text-xs text-gray-500">No candidates linked yet.</p>
                <Button className="mt-2" size="sm" onClick={openAddCandidate}>
                  <UserPlus className="h-3.5 w-3.5 mr-1" />
                  Link
                </Button>
              </div>
            ) : (
              <ul className="divide-y divide-gray-100 max-h-[28rem] overflow-y-auto">
                {linkedCandidates.map((lc: any) => {
                  const name = lc.candidateName || "Unknown";
                  const stage = lc.stage || "sourced";
                  const fit =
                    fitByCandidate[lc.candidateId] ||
                    (typeof lc.fitScore === "number"
                      ? {
                          score: lc.fitScore,
                          grade: lc.fitGrade,
                          reasons: lc.fitReasons,
                          strengths: lc.fitStrengths,
                          gaps: lc.fitGaps,
                          summary: lc.fitSummary,
                        }
                      : null);
                  const isRescoring = fitRescoringId === lc.candidateId;
                  const isExpanded = expandedFitId === lc.candidateId;
                  const hasFit = fit != null && typeof fit.score === "number";
                  const linkedCand = (
                    Array.isArray(allCandidates) ? allCandidates : []
                  ).find(
                    (c: any) => String(c.id) === String(lc.candidateId)
                  );
                  const tagMatch =
                    jobTags.length && Array.isArray(linkedCand?.tags)
                      ? matchControlledTags({
                          required: jobTags,
                          candidate: linkedCand.tags,
                        })
                      : null;
                  return (
                    <li
                      key={lc.candidateId}
                      className="py-2.5 first:pt-0 last:pb-0"
                    >
                      <div className="flex items-center gap-2.5">
                        <div
                          className={`h-8 w-8 shrink-0 rounded-full ${avatarColor(name)} text-white flex items-center justify-center text-[11px] font-semibold`}
                        >
                          {getInitials(name)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                            <Link
                              href={`/dashboard/candidates/${lc.candidateId}?jobId=${encodeURIComponent(jobId)}`}
                              className="text-sm font-medium text-blue-600 hover:underline truncate"
                            >
                              {name}
                            </Link>
                            <FitScoreBadge
                              score={fit?.score}
                              grade={fit?.grade}
                              domainFit={fit?.domainFit}
                              toolReadiness={fit?.toolReadiness}
                              reasons={fit?.reasons}
                              strengths={fit?.strengths}
                              gaps={fit?.gaps}
                              loading={(fitLoading || isRescoring) && !fit}
                              className="shrink-0"
                            />
                            {tagMatch ? (
                              <span
                                className="text-[10px] font-medium text-slate-500"
                                title={`${tagMatch.matched.length} of ${jobTags.length} required tags`}
                              >
                                {tagMatch.matched.length}/{jobTags.length} tags
                              </span>
                            ) : null}
                          </div>
                          <div className="mt-0.5 flex items-center gap-1.5">
                            <select
                              className="border-0 bg-transparent p-0 text-[11px] font-medium text-gray-600 cursor-pointer max-w-full focus:ring-0"
                              value={stage}
                              onChange={(e) =>
                                updateStage.mutate({
                                  jobId,
                                  candidateId: lc.candidateId,
                                  stage: e.target.value,
                                })
                              }
                              disabled={updateStage.isPending}
                              aria-label={`Stage for ${name}`}
                              title="Change stage"
                            >
                              {!STAGES.includes(stage) && (
                                <option value={stage}>
                                  {getStageLabel(stage)}
                                </option>
                              )}
                              {STAGES.map((s) => (
                                <option key={s} value={s}>
                                  {getStageLabel(s)}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <div className="flex items-center gap-0.5 shrink-0">
                          <button
                            type="button"
                            title={hasFit ? "Re-score AI fit" : "Run AI fit"}
                            onClick={() => runFitForCandidate(lc.candidateId)}
                            disabled={isRescoring || !!fitRescoringId}
                            className="text-gray-300 hover:text-violet-600 p-1"
                          >
                            {isRescoring ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Sparkles className="h-3.5 w-3.5" />
                            )}
                          </button>
                          {hasFit && (
                            <button
                              type="button"
                              title={
                                isExpanded ? "Hide fit summary" : "Show fit summary"
                              }
                              onClick={() =>
                                setExpandedFitId(
                                  isExpanded ? null : lc.candidateId
                                )
                              }
                              className="text-gray-300 hover:text-gray-600 p-1"
                            >
                              <ChevronDown
                                className={`h-3.5 w-3.5 transition-transform ${
                                  isExpanded ? "rotate-180" : ""
                                }`}
                              />
                            </button>
                          )}
                          <button
                            type="button"
                            title="Unlink"
                            onClick={() =>
                              unlinkCandidate.mutate({
                                jobId,
                                candidateId: lc.candidateId,
                              })
                            }
                            disabled={unlinkCandidate.isPending}
                            className="text-gray-300 hover:text-red-500 p-1"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                      {isExpanded && hasFit && fit && (
                        <div className="mt-2 ml-10 rounded-lg border border-slate-100 bg-slate-50/90 px-2.5 py-2 text-[12px] text-gray-800">
                          {fit.summary ? (
                            <div className="whitespace-pre-wrap font-sans leading-relaxed">
                              {fit.summary}
                            </div>
                          ) : (
                            <div className="space-y-1.5 leading-relaxed">
                              <div className="font-semibold text-gray-900">
                                Fit {Math.round(fit.score)}/100
                                {fit.grade ? ` · Grade ${fit.grade}` : ""}
                              </div>
                              {!!fit.strengths?.length && (
                                <ul className="list-disc pl-3.5 space-y-0.5">
                                  {fit.strengths.slice(0, 4).map((s, i) => (
                                    <li key={i}>{s}</li>
                                  ))}
                                </ul>
                              )}
                              {!!fit.gaps?.length && (
                                <ul className="list-disc pl-3.5 space-y-0.5 text-gray-600">
                                  {fit.gaps.slice(0, 3).map((g, i) => (
                                    <li key={i}>{g}</li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}

            {/* Link candidate form */}
            {(showLinkForm || linkedCandidates.length === 0) && (
              <div
                ref={linkFormRef}
                className="mt-4 border-t border-gray-100 pt-4"
              >
                <h3 className="font-medium text-xs mb-2 flex items-center gap-1.5 text-gray-700 uppercase tracking-wide">
                  <UserPlus className="h-3.5 w-3.5" /> Link candidate
                </h3>

                {candidateId && (
                  <div className="mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs">
                    <span className="font-medium text-blue-900">{candidateName}</span>
                    {selectedTagMatch ? (
                      <span className="text-[11px] text-blue-800">
                        Tag match {selectedTagMatch.matched.length}/
                        {selectedTagMatch.matched.length +
                          selectedTagMatch.gaps.length}{" "}
                        ({selectedTagMatch.score}%)
                      </span>
                    ) : null}
                    <button
                      type="button"
                      className="ml-auto text-blue-700 hover:underline"
                      onClick={() => {
                        setCandidateId("");
                        setCandidateName("");
                        setCandidateEmail("");
                        setCandidateSearch("");
                      }}
                    >
                      Clear
                    </button>
                  </div>
                )}

                <Input
                  value={candidateSearch}
                  onChange={(e) => {
                    setCandidateSearch(e.target.value);
                    if (candidateId) {
                      setCandidateId("");
                      setCandidateName("");
                      setCandidateEmail("");
                    }
                  }}
                  placeholder="Search candidates…"
                  className="h-9 text-sm mb-2"
                />

                <div className="rounded-lg border border-gray-200 max-h-40 overflow-y-auto bg-white mb-2">
                  {loadingCandidates ? (
                    <div className="flex items-center gap-2 px-3 py-4 text-xs text-gray-500 justify-center">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
                    </div>
                  ) : availableCandidates.length === 0 ? (
                    <div className="px-3 py-4 text-center text-xs text-gray-500">
                      No matching candidates
                    </div>
                  ) : (
                    <ul className="divide-y divide-gray-50">
                      {availableCandidates.map((c: any) => (
                        <li key={c.id}>
                          <button
                            type="button"
                            onClick={() => selectCandidate(c)}
                            className={`w-full text-left px-2.5 py-2 text-xs hover:bg-slate-50 ${
                              c.id === candidateId ? "bg-blue-50" : ""
                            }`}
                          >
                            <span className="font-medium text-gray-900">
                              {c.name || "Unknown"}
                            </span>
                            {c.email ? (
                              <span className="text-gray-400 block truncate">
                                {c.email}
                              </span>
                            ) : null}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <select
                  className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs bg-white w-full mb-2"
                  value={newCandidateStage}
                  onChange={(e) => setNewCandidateStage(e.target.value)}
                >
                  {STAGES.map((stage) => (
                    <option key={stage} value={stage}>
                      {getStageLabel(stage)}
                    </option>
                  ))}
                </select>

                <div className="flex gap-2">
                  {linkedCandidates.length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 h-8 text-xs"
                      onClick={() => setShowLinkForm(false)}
                      type="button"
                    >
                      Cancel
                    </Button>
                  )}
                  <Button
                    size="sm"
                    className="flex-1 h-8 text-xs bg-blue-600 hover:bg-blue-700"
                    onClick={onLinkCandidate}
                    disabled={isMutating || !candidateId || !candidateName}
                  >
                    {linkCandidate.isPending ? "Linking…" : "Link"}
                  </Button>
                </div>
              </div>
            )}
          </section>

          <section data-ink-on-light className="bg-white border border-gray-200 rounded-2xl shadow-sm p-4">
            <h2 className="text-xs font-semibold tracking-wide text-gray-500 uppercase mb-3">
              Quick Links
            </h2>
            <div className="space-y-2 text-sm">
              {job.companyId ? (
                <Link
                  href={`/dashboard/companies/${job.companyId}`}
                  className="flex items-center gap-2 text-blue-600 hover:underline"
                >
                  <Building2 className="h-4 w-4" />
                  View {job.companyName || "company"}
                </Link>
              ) : null}
              <Link
                href="/dashboard/jobs"
                className="flex items-center gap-2 text-blue-600 hover:underline"
              >
                <Briefcase className="h-4 w-4" />
                All jobs
              </Link>
              <Link
                href="/dashboard/candidates"
                className="flex items-center gap-2 text-blue-600 hover:underline"
              >
                <Users className="h-4 w-4" />
                Candidates
              </Link>
            </div>
          </section>
        </div>
      </div>
      ) : null}

      <JobEditModal
        isOpen={editOpen}
        onClose={() => {
          setEditOpen(false);
          setEditFocusDescription(false);
        }}
        job={job}
        focusDescription={editFocusDescription}
      />

      {canInvoice && (
        <CreateInvoiceModal
          open={invoiceOpen}
          onClose={() => setInvoiceOpen(false)}
          jobId={job.id}
          jobTitle={job.title}
          companyId={job.companyId || job.company_id}
          companyName={job.companyName || job.company_name}
          salaryRange={job.salaryRange || job.salary_range}
          candidates={linkedCandidates.map((lc: any) => ({
            id: lc.candidateId,
            name: lc.candidateName || lc.name || "Candidate",
          }))}
        />
      )}
    </div>
  );
}

function MetaField({
  label,
  value,
  icon,
  accent,
  href,
}: {
  label: string;
  value: string;
  icon?: ReactNode;
  accent?: string;
  href?: string;
}) {
  const text = (
    <span className={`truncate ${href ? "text-blue-600 hover:underline" : ""}`}>
      {value}
    </span>
  );
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">
        {label}
      </div>
      <div
        className={`text-sm font-medium text-gray-900 flex items-start gap-1.5 truncate ${accent || ""}`}
        title={value}
      >
        {icon ? <span className="text-gray-400 mt-0.5 shrink-0">{icon}</span> : null}
        {href ? (
          <Link href={href} className="min-w-0 truncate">
            {text}
          </Link>
        ) : (
          text
        )}
      </div>
    </div>
  );
}

function JobCopyButton({ jobId, jobTitle }: { jobId: string; jobTitle: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const handleCopy = async () => {
    if (!jobId || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/copy`, {
        method: "POST",
        credentials: "include",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.error || "Failed to copy job");
      }
      const newId = body?.job?.id;
      if (!newId) throw new Error("Copy created but no job id returned");
      toast.success(`Copied job — edit location, pay, or other details as needed`);
      router.push(`/dashboard/jobs/${encodeURIComponent(String(newId))}`);
    } catch (err: any) {
      console.error("[copy job]", err);
      toast.error(err?.message || "Failed to copy job");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => void handleCopy()}
      disabled={busy || !jobId}
      title={`Duplicate "${jobTitle}" as a new req (empty pipeline)`}
    >
      {busy ? (
        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
      ) : (
        <Copy className="h-4 w-4 mr-2" />
      )}
      {busy ? "Copying…" : "Copy Job"}
    </Button>
  );
}

function JobDeleteButton({ jobId, jobTitle }: { jobId: string; jobTitle: string }) {
  const router = useRouter();
  const [showConfirm, setShowConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/jobs/${jobId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        router.push("/dashboard/jobs");
      } else {
        alert("Failed to delete job");
      }
    } catch (err) {
      console.error("Error deleting job:", err);
      alert("Failed to delete job");
    } finally {
      setIsDeleting(false);
      setShowConfirm(false);
    }
  };

  if (showConfirm) {
    return (
      <div className="flex gap-2">
        <Button variant="destructive" size="sm" onClick={handleDelete} disabled={isDeleting}>
          {isDeleting ? "Deleting..." : "Confirm"}
        </Button>
        <Button variant="outline" size="sm" onClick={() => setShowConfirm(false)}>
          Cancel
        </Button>
      </div>
    );
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => setShowConfirm(true)}
      className="text-red-600 hover:text-red-700"
      title={`Delete ${jobTitle}`}
    >
      <Trash2 className="h-4 w-4 mr-2" />
      Delete
    </Button>
  );
}
