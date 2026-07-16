"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  Calendar,
  DollarSign,
  ExternalLink,
  Globe,
  Loader2,
  MapPin,
  Pencil,
  Trash2,
  UserPlus,
  Briefcase,
  Users,
} from "lucide-react";
import {
  useJob,
  useLinkCandidateToJob,
  useUnlinkCandidateFromJob,
  useUpdateCandidateStageInJob,
  useUpdateJob,
} from "@/lib/hooks/query-job";
import { useLeads } from "@/lib/hooks/query-lead";
import EventTimeline from "@/components/EventTimeline";
import JobEditModal from "@/components/job/JobEditModal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { APPLICATION_STAGES } from "@/lib/schemas/lead";
import { toast } from "sonner";

const JOB_STATUSES = ["OPEN", "PAUSED", "CLOSED"] as const;
const STAGES = APPLICATION_STAGES.map((s) => s.value);

type JobStatus = (typeof JOB_STATUSES)[number];

/** Pipeline buckets shown in the WIP tracker (mockup-style). */
const PIPELINE_BUCKETS = [
  {
    key: "attached",
    label: "Attached",
    match: null as string[] | null, // total count
    bg: "bg-slate-50",
    text: "text-slate-800",
    ring: "ring-slate-200",
  },
  {
    key: "submitted",
    label: "Submitted",
    match: ["submitted", "pre_screened", "Screening", "Applied"],
    bg: "bg-sky-50",
    text: "text-sky-800",
    ring: "ring-sky-100",
  },
  {
    key: "interviewing",
    label: "Interviewing",
    match: ["interviewing", "Interviewing", "interview"],
    bg: "bg-violet-50",
    text: "text-violet-800",
    ring: "ring-violet-100",
  },
  {
    key: "offer_out",
    label: "Offer Out",
    match: ["offer_out", "offer_accepted", "Offered", "offer"],
    bg: "bg-amber-50",
    text: "text-amber-800",
    ring: "ring-amber-100",
  },
  {
    key: "rejected",
    label: "Rejected",
    match: ["rejected", "Rejected", "offer_declined", "not_interested", "Withdrawn"],
    bg: "bg-rose-50",
    text: "text-rose-800",
    ring: "ring-rose-100",
  },
] as const;

function getStageLabel(stageValue: string) {
  const stage = APPLICATION_STAGES.find((s) => s.value === stageValue);
  return stage?.label || stageValue;
}

function getStageBadgeClasses(stageValue: string) {
  const color = APPLICATION_STAGES.find((s) => s.value === stageValue)?.color || "gray";
  const map: Record<string, string> = {
    gray: "bg-gray-100 text-gray-700 border-gray-200",
    blue: "bg-blue-50 text-blue-700 border-blue-200",
    violet: "bg-violet-50 text-violet-700 border-violet-200",
    amber: "bg-amber-50 text-amber-800 border-amber-200",
    green: "bg-green-50 text-green-700 border-green-200",
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
    red: "bg-rose-50 text-rose-700 border-rose-200",
  };
  return map[color] || map.gray;
}

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
  if (!status) return "Open";
  return String(status)
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function statusBadgeClasses(status?: string) {
  const s = String(status || "open").toLowerCase();
  if (s.includes("open")) return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (s.includes("pause") || s.includes("hold")) return "bg-amber-50 text-amber-800 border-amber-200";
  if (s.includes("close")) return "bg-gray-100 text-gray-700 border-gray-200";
  return "bg-blue-50 text-blue-700 border-blue-200";
}

function shortJobId(id?: string) {
  if (!id) return "—";
  return id.length > 8 ? `JOB-${id.slice(0, 8).toUpperCase()}` : `JOB-${id.toUpperCase()}`;
}

export default function JobDetailPage() {
  const params = useParams<{ id: string }>();
  const jobId = params?.id || "";

  const { data: job, isLoading, isError, error } = useJob(jobId);
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
  const [candidateSearch, setCandidateSearch] = useState("");
  const [showLinkForm, setShowLinkForm] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const linkFormRef = useRef<HTMLDivElement>(null);

  // Support both field names used across the codebase
  const linkedCandidates = useMemo(() => {
    if (!job) return [];
    if (Array.isArray(job.linkedCandidates)) return job.linkedCandidates;
    if (Array.isArray(job.candidates)) return job.candidates;
    return [];
  }, [job]);

  const pipelineCounts = useMemo(() => {
    const total = linkedCandidates.length;
    return PIPELINE_BUCKETS.map((bucket) => {
      if (bucket.match === null) {
        return { ...bucket, count: total };
      }
      const count = linkedCandidates.filter((lc: any) => {
        const stage = String(lc.stage || "").toLowerCase();
        return bucket.match!.some((m) => stage === m.toLowerCase());
      }).length;
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

  const onChangeJobStatus = async (status: JobStatus) => {
    if (!jobId) return;
    await updateJob.mutateAsync({
      jobId,
      jobData: { status },
    });
  };

  /** Explicit true = on; false = off; undefined (legacy) = treated as on while Open */
  const isShownOnWebsite = (job as any)?.showOnWebsite !== false;
  const isOpenStatus =
    String((job as any)?.status || "")
      .trim()
      .toLowerCase() === "open";

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
        <div className="bg-white border rounded-xl p-6 shadow-sm">
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

  return (
    <div className="space-y-5 max-w-7xl -mt-1">
      {/* Page header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
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
            <span
              className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusBadgeClasses(job.status)}`}
            >
              {formatStatusLabel(job.status)}
            </span>
            {isShownOnWebsite && isOpenStatus ? (
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
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={job.status || "OPEN"}
            onChange={(e) => onChangeJobStatus(e.target.value as JobStatus)}
            disabled={updateJob.isPending}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white shadow-sm"
            aria-label="Job status"
          >
            {JOB_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
            {/* Preserve whatever status is currently stored if not in the enum */}
            {job.status &&
              !JOB_STATUSES.includes(job.status as JobStatus) && (
                <option value={job.status}>{job.status}</option>
              )}
          </select>

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
            <Globe className="h-4 w-4 shrink-0" />
            <span className="font-medium">Show on website</span>
          </label>

          {isShownOnWebsite && isOpenStatus && job.id && (
            <a
              href={`/careers/${process.env.NEXT_PUBLIC_CAREERS_DEFAULT_SLUG || "ryvan"}/${job.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm hover:bg-gray-50"
            >
              <ExternalLink className="h-4 w-4" />
              View public page
            </a>
          )}

          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
            <Pencil className="h-4 w-4 mr-2" />
            Edit Job
          </Button>
          <Button size="sm" onClick={openAddCandidate} className="bg-blue-600 hover:bg-blue-700">
            <UserPlus className="h-4 w-4 mr-2" />
            Add Candidate
          </Button>
          <JobDeleteButton jobId={job.id} jobTitle={job.title} />
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        {/* ─── Main column ─── */}
        <div className="xl:col-span-2 space-y-5">
          {/* Hero / job summary card */}
          <section className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
            <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
              <div>
                <h2 className="text-xl font-semibold text-gray-900 tracking-tight">
                  {job.title}
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                  <span className="font-mono text-xs text-gray-400 mr-2">
                    {shortJobId(job.id)}
                  </span>
                  {job.companyName || "Unknown Company"}
                  {postedLabel ? ` · Posted ${postedLabel}` : null}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
              <MetaField
                label="Location"
                value={job.location || "—"}
                icon={<MapPin className="h-3.5 w-3.5" />}
              />
              <MetaField
                label="Compensation"
                value={job.salaryRange || "—"}
                icon={<DollarSign className="h-3.5 w-3.5" />}
              />
              <MetaField
                label="Job Type"
                value={job.employmentType || "Full-Time"}
                icon={<Briefcase className="h-3.5 w-3.5" />}
              />
              <MetaField
                label="Status"
                value={formatStatusLabel(job.status)}
                accent={
                  String(job.status || "").toLowerCase().includes("open")
                    ? "text-rose-600 font-semibold"
                    : undefined
                }
              />
              <MetaField
                label="Company"
                value={job.companyName || "—"}
                icon={<Building2 className="h-3.5 w-3.5" />}
              />
              <MetaField
                label="Posted"
                value={postedLabel || "—"}
                icon={<Calendar className="h-3.5 w-3.5" />}
              />
            </div>
          </section>

          {/* Candidate pipeline — WIP tracker */}
          <section className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
              <h2 className="text-sm font-semibold tracking-wide text-gray-800 uppercase">
                Candidate Pipeline — WIP Tracker
              </h2>
              <span className="text-xs text-gray-500">
                {linkedCandidates.length} candidate
                {linkedCandidates.length === 1 ? "" : "s"} attached
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
              {pipelineCounts.map((bucket) => (
                <div
                  key={bucket.key}
                  className={`rounded-xl ${bucket.bg} ring-1 ${bucket.ring} px-3 py-3 text-center`}
                >
                  <div className={`text-2xl font-semibold tabular-nums ${bucket.text}`}>
                    {bucket.count}
                  </div>
                  <div className="text-[11px] font-medium uppercase tracking-wide text-gray-500 mt-0.5">
                    {bucket.label}
                  </div>
                </div>
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

          {/* Candidates list */}
          <section className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
              <h2 className="text-sm font-semibold tracking-wide text-gray-800 uppercase flex items-center gap-2">
                <Users className="h-4 w-4 text-gray-500" />
                Candidates
                <span className="text-gray-400 font-normal normal-case tracking-normal">
                  ({linkedCandidates.length})
                </span>
              </h2>
              <Button variant="outline" size="sm" onClick={openAddCandidate}>
                <UserPlus className="h-4 w-4 mr-1.5" />
                Add
              </Button>
            </div>

            {linkedCandidates.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/80 px-4 py-10 text-center">
                <p className="text-sm text-gray-500">No candidates linked yet.</p>
                <Button className="mt-3" size="sm" onClick={openAddCandidate}>
                  <UserPlus className="h-4 w-4 mr-1.5" />
                  Link a candidate
                </Button>
              </div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {linkedCandidates.map((lc: any) => {
                  const name = lc.candidateName || "Unknown Candidate";
                  const stage = lc.stage || "sourced";
                  return (
                    <li
                      key={lc.candidateId}
                      className="flex flex-wrap items-center gap-3 py-3.5 first:pt-0 last:pb-0"
                    >
                      <div
                        className={`h-10 w-10 shrink-0 rounded-full ${avatarColor(name)} text-white flex items-center justify-center text-sm font-semibold`}
                      >
                        {getInitials(name)}
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm text-gray-900 truncate">{name}</p>
                        <p className="text-xs text-gray-500 truncate">
                          {lc.candidateEmail || "No email"}
                          {lc.dateApplied
                            ? ` · Applied ${new Date(lc.dateApplied).toLocaleDateString()}`
                            : null}
                        </p>
                        {lc.notes &&
                          String(lc.notes).trim() &&
                          String(lc.notes).trim() !==
                            "Applied via careers site" && (
                            <p className="mt-1 text-xs text-slate-700 line-clamp-2 whitespace-pre-wrap">
                              <span className="font-medium text-slate-500">
                                Message:{" "}
                              </span>
                              {String(lc.notes)}
                            </p>
                          )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${getStageBadgeClasses(stage)}`}
                        >
                          {getStageLabel(stage)}
                        </span>

                        <select
                          className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs bg-white"
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
                        >
                          {/* Ensure current stage is selectable even if legacy */}
                          {!STAGES.includes(stage) && (
                            <option value={stage}>{getStageLabel(stage)}</option>
                          )}
                          {STAGES.map((s) => (
                            <option key={s} value={s}>
                              {getStageLabel(s)}
                            </option>
                          ))}
                        </select>

                        <Button variant="outline" size="sm" asChild>
                          <Link href={`/dashboard/candidates/${lc.candidateId}`}>View</Link>
                        </Button>

                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            unlinkCandidate.mutate({
                              jobId,
                              candidateId: lc.candidateId,
                            })
                          }
                          disabled={unlinkCandidate.isPending}
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="h-4 w-4 mr-1" /> Unlink
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            {/* Link candidate form — search & pick from tenant candidates */}
            {(showLinkForm || linkedCandidates.length === 0) && (
              <div
                ref={linkFormRef}
                className="mt-6 border-t border-gray-100 pt-6"
              >
                <h3 className="font-medium text-sm mb-1 flex items-center gap-2 text-gray-800">
                  <UserPlus className="h-4 w-4" /> Link Candidate
                </h3>
                <p className="text-xs text-gray-500 mb-3">
                  Search your candidates and click one to select — no ID typing required.
                </p>

                {/* Selected chip */}
                {candidateId && (
                  <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm">
                    <span className="font-medium text-blue-900">{candidateName}</span>
                    {candidateEmail && (
                      <span className="text-blue-700/80 text-xs">{candidateEmail}</span>
                    )}
                    <button
                      type="button"
                      className="ml-auto text-xs text-blue-700 hover:underline"
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

                <div className="space-y-3">
                  <Input
                    value={candidateSearch}
                    onChange={(e) => {
                      setCandidateSearch(e.target.value);
                      // Typing a new search clears prior selection
                      if (candidateId) {
                        setCandidateId("");
                        setCandidateName("");
                        setCandidateEmail("");
                      }
                    }}
                    placeholder="Search by name, email, or title…"
                    className="h-11"
                  />

                  <div className="rounded-xl border border-gray-200 max-h-56 overflow-y-auto bg-white">
                    {loadingCandidates ? (
                      <div className="flex items-center gap-2 px-4 py-6 text-sm text-gray-500 justify-center">
                        <Loader2 className="h-4 w-4 animate-spin" /> Loading candidates…
                      </div>
                    ) : availableCandidates.length === 0 ? (
                      <div className="px-4 py-6 text-center text-sm text-gray-500">
                        {allCandidates.length === 0 ? (
                          <>
                            No candidates in this tenant yet.{" "}
                            <Link
                              href="/dashboard/candidates/new"
                              className="text-blue-600 hover:underline"
                            >
                              Add a candidate
                            </Link>
                          </>
                        ) : (
                          "No matching candidates (or all are already linked)."
                        )}
                      </div>
                    ) : (
                      <ul className="divide-y divide-gray-100">
                        {availableCandidates.map((c: any) => {
                          const selected = c.id === candidateId;
                          return (
                            <li key={c.id}>
                              <button
                                type="button"
                                onClick={() => selectCandidate(c)}
                                className={`w-full text-left px-3 py-2.5 flex items-center gap-3 hover:bg-slate-50 transition-colors ${
                                  selected ? "bg-blue-50" : ""
                                }`}
                              >
                                <div
                                  className={`h-8 w-8 shrink-0 rounded-full ${avatarColor(
                                    c.name || "?"
                                  )} text-white flex items-center justify-center text-xs font-semibold`}
                                >
                                  {getInitials(c.name || "?")}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-medium text-gray-900 truncate">
                                    {c.name || "Unknown"}
                                  </p>
                                  <p className="text-xs text-gray-500 truncate">
                                    {[c.title, c.email].filter(Boolean).join(" · ") ||
                                      "No title / email"}
                                  </p>
                                </div>
                                {selected && (
                                  <span className="text-xs font-semibold text-blue-700">
                                    Selected
                                  </span>
                                )}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-gray-500 mb-1 block">
                        Stage
                      </label>
                      <select
                        className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white w-full h-10"
                        value={newCandidateStage}
                        onChange={(e) => setNewCandidateStage(e.target.value)}
                      >
                        {STAGES.map((stage) => (
                          <option key={stage} value={stage}>
                            {getStageLabel(stage)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="md:col-span-2">
                      <label className="text-xs font-medium text-gray-500 mb-1 block">
                        Notes (optional)
                      </label>
                      <Textarea
                        value={candidateNotes}
                        onChange={(e) => setCandidateNotes(e.target.value)}
                        placeholder="Why linking / context for this role…"
                        rows={2}
                      />
                    </div>
                  </div>
                </div>

                <div className="mt-3 flex justify-end gap-2">
                  {linkedCandidates.length > 0 && (
                    <Button
                      variant="outline"
                      onClick={() => setShowLinkForm(false)}
                      type="button"
                    >
                      Cancel
                    </Button>
                  )}
                  <Button
                    onClick={onLinkCandidate}
                    disabled={isMutating || !candidateId || !candidateName}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    {linkCandidate.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Linking...
                      </>
                    ) : (
                      "Link Candidate"
                    )}
                  </Button>
                </div>
              </div>
            )}
          </section>

          {/* Job description */}
          <section className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
            <h2 className="text-sm font-semibold tracking-wide text-gray-800 uppercase mb-4">
              Job Description
            </h2>
            <div className="prose prose-sm max-w-none text-gray-700">
              <h3 className="text-sm font-semibold text-gray-900 mb-2">
                Position Summary
              </h3>
              <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                {job.description || "No description provided."}
              </p>
            </div>
          </section>
        </div>

        {/* ─── Right sidebar ─── */}
        <div className="space-y-5">
          {/* Job details / engagement-style summary from real fields only */}
          <section className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5">
            <h2 className="text-sm font-semibold tracking-wide text-gray-800 uppercase mb-4">
              Job Snapshot
            </h2>
            <dl className="space-y-3 text-sm">
              <SnapshotRow label="Employment type" value={job.employmentType || "Full-time"} />
              <SnapshotRow label="Status" value={formatStatusLabel(job.status)} />
              <SnapshotRow
                label="Website"
                value={
                  isShownOnWebsite && isOpenStatus
                    ? "Published on careers"
                    : isShownOnWebsite
                      ? "Flag on (set status Open to list)"
                      : "Hidden from careers"
                }
              />
              <SnapshotRow label="Compensation" value={job.salaryRange || "—"} highlight />
              <SnapshotRow label="Location" value={job.location || "—"} />
              <SnapshotRow label="Company" value={job.companyName || "—"} />
              <SnapshotRow
                label="Candidates attached"
                value={String(linkedCandidates.length)}
              />
            </dl>
          </section>

          {/* Activity & notes — existing EventTimeline (add note + history) */}
          <section className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="px-5 pt-5 pb-3 border-b border-gray-100">
              <h2 className="text-sm font-semibold tracking-wide text-gray-800 uppercase">
                Activity &amp; Notes
              </h2>
            </div>
            <div className="p-4 pt-3">
              <EventTimeline
                entityType="job"
                entityId={job.id || jobId}
                maxHeight="420px"
                embedded
              />
            </div>
          </section>

          {/* Quick links */}
          <section className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5">
            <h2 className="text-sm font-semibold tracking-wide text-gray-800 uppercase mb-3">
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
              ) : job.companyName ? (
                <p className="text-gray-500 flex items-center gap-2">
                  <Building2 className="h-4 w-4" />
                  {job.companyName}
                </p>
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

      <JobEditModal
        isOpen={editOpen}
        onClose={() => setEditOpen(false)}
        job={job}
      />
    </div>
  );
}

function MetaField({
  label,
  value,
  icon,
  accent,
}: {
  label: string;
  value: string;
  icon?: ReactNode;
  accent?: string;
}) {
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
        <span className="truncate">{value}</span>
      </div>
    </div>
  );
}

function SnapshotRow({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-gray-500">{label}</dt>
      <dd
        className={`text-right font-medium ${
          highlight ? "text-emerald-600" : "text-gray-900"
        }`}
      >
        {value}
      </dd>
    </div>
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
