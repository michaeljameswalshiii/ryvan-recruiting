"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Briefcase,
  Calendar,
  CheckCircle2,
  DollarSign,
  Linkedin,
  Mail,
  MapPin,
  Phone,
  PhoneCall,
  Sparkles,
} from "lucide-react";
import { ResumeViewer } from "@/components/candidate/ResumeViewer";
import { ObjectAssignments } from "@/components/shared/ObjectAssignments";
import { Button } from "@/components/ui/button";
import {
  ACTIVITY_BADGE_BASE_CLASS,
  activityBadgeStyle,
} from "@/lib/ui/activity-badge-colors";
import { normalizeNoteTypeLabel } from "@/lib/candidates/note-type-stage";

function date(value?: string) {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? "—"
    : parsed.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
}

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?"
  );
}

function stageLabel(value?: string) {
  return String(value || "Sourced")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (x) => x.toUpperCase());
}

function eventKind(note: any) {
  const value = String(note?.eventType || note?.noteType || "").toLowerCase();
  if (value.includes("interview")) return "interview";
  if (value.includes("email")) return "email";
  if (value.includes("call") || value.includes("phone")) return "call";
  if (value.includes("stage") || value.includes("status")) return "stage";
  return "note";
}

function noteLabel(note: any) {
  const meta = note?.metadata || {};
  const body = String(meta.noteText || note?.description || note?.title || "");
  if (
    meta.systemKind === "ai_fit" ||
    /^ai fit for/i.test(body) ||
    typeof meta.fitScore === "number"
  )
    return "AI Review";
  if (
    meta.systemKind === "job_linked" ||
    /^linked to job:/i.test(body) ||
    /^attached to job:/i.test(body)
  )
    return "Attached";
  if (meta.noteType) return normalizeNoteTypeLabel(String(meta.noteType));
  if (meta.noteTypeLabel)
    return normalizeNoteTypeLabel(String(meta.noteTypeLabel));
  const event = String(note?.eventType || "");
  if (event === "EMAIL_SENT") return "EM Sent";
  if (event === "INTERVIEW_SCHEDULED" || event === "INTERVIEW_COMPLETED")
    return "Interview";
  return event && event !== "NOTE"
    ? normalizeNoteTypeLabel(event.replace(/_/g, " "))
    : "Other";
}

const PIPELINE = [
  "sourced",
  "applied",
  "interested",
  "submitted",
  "interviewing",
  "offer_out",
  "accepted",
];

function normalizedStage(value?: string) {
  return String(value || "sourced").toLowerCase().replace(/\s+/g, "_");
}

function isRejectedApplication(job: any) {
  return normalizedStage(job?.stage) === "rejected";
}

function applicationRank(job: any) {
  if (isRejectedApplication(job)) return -1;
  return Math.max(0, PIPELINE.indexOf(normalizedStage(job?.stage)));
}

export function CandidateDetailV2({
  candidate,
  initialJobId = "",
}: {
  candidate: any;
  initialJobId?: string;
}) {
  const jobs = Array.isArray(candidate?.linkedJobs) ? candidate.linkedJobs : [];
  const orderedJobs = [...jobs].sort((a: any, b: any) => {
    const rankDifference = applicationRank(b) - applicationRank(a);
    if (rankDifference) return rankDifference;
    const aUpdated = new Date(a?.stageUpdatedAt || a?.createdAt || 0).getTime();
    const bUpdated = new Date(b?.stageUpdatedAt || b?.createdAt || 0).getTime();
    return bUpdated - aUpdated;
  });
  const requestedJob = orderedJobs.find(
    (job: any) => String(job?.jobId || job?.id) === String(initialJobId),
  );
  const defaultJob =
    (requestedJob && !isRejectedApplication(requestedJob)
      ? requestedJob
      : orderedJobs.find((job: any) => !isRejectedApplication(job))) ||
    orderedJobs[0];
  const [selectedJobId, setSelectedJobId] = useState(
    String(defaultJob?.jobId || defaultJob?.id || ""),
  );
  const [showAllApplications, setShowAllApplications] = useState(false);
  const [notes, setNotes] = useState<any[]>([]);
  const [notesLoading, setNotesLoading] = useState(true);
  const [resumeUrl, setResumeUrl] = useState(candidate?.resumeUrl || "");
  const [resumeKey, setResumeKey] = useState(candidate?.resumeKey || "");
  const [resumeName, setResumeName] = useState(candidate?.resumeFileName || "");
  const [avatarUrl, setAvatarUrl] = useState(candidate?.avatarUrl || "");
  const [avatarBusy, setAvatarBusy] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [noteText, setNoteText] = useState("");
  const [noteType, setNoteType] = useState("Conversation");
  const [noteBusy, setNoteBusy] = useState(false);
  const [fitBusy, setFitBusy] = useState(false);
  const [fitOverlay, setFitOverlay] = useState<any>(null);
  const name = candidate?.name || "Unknown candidate";
  const salaryRequirement =
    candidate?.salaryRequirements || candidate?.salary_requirements || "";
  const linkedinUrl = candidate?.linkedin || candidate?.linkedin_url || "";

  useEffect(() => {
    let cancelled = false;
    setNotesLoading(true);
    fetch(`/api/candidate/${candidate.id}/events?limit=100`)
      .then((response) => (response.ok ? response.json() : { notes: [] }))
      .then((body) => {
        if (!cancelled)
          setNotes(
            Array.isArray(body?.events)
              ? body.events
              : Array.isArray(body)
                ? body
                : [],
          );
      })
      .catch(() => {
        if (!cancelled) setNotes([]);
      })
      .finally(() => {
        if (!cancelled) setNotesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [candidate.id]);

  const visibleNotes = notes;
  const visibleApplications = showAllApplications
    ? orderedJobs
    : orderedJobs.filter((job: any) => !isRejectedApplication(job));

  const currentJob =
    orderedJobs.find(
      (job: any) =>
        String(job.jobId || job.id) === String(selectedJobId),
    ) || defaultJob;
  const currentJobTitle = currentJob?.jobTitle || currentJob?.title || "";
  const currentCompany =
    currentJob?.companyName ||
    currentJob?.company_name ||
    currentJob?.company ||
    "";
  const fit = fitOverlay || currentJob || {};
  const fitScore = fit.fitScore ?? fit.fit_score;
  const runFit = async () => {
    const jobId = currentJob?.jobId || currentJob?.id;
    if (!jobId) return;
    setFitBusy(true);
    try {
      const response = await fetch(`/api/jobs/${jobId}/fit-score`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateId: candidate.id, persist: true }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error || "Fit scoring failed");
      const scored =
        body?.fit || body?.scores?.[0]?.fit || body?.scores?.[0] || {};
      setFitOverlay({
        fitScore: scored.score,
        fitGrade: scored.grade,
        fitDomainScore: scored.domainFit?.score ?? scored.domainScore,
        fitToolScore: scored.toolReadiness?.score ?? scored.toolScore,
        fitStrengths: scored.strengths || [],
        fitGaps: scored.gaps || [],
        fitSummary: scored.summary || "",
      });
    } finally {
      setFitBusy(false);
    }
  };
  useEffect(() => {
    setFitOverlay(null);
  }, [selectedJobId]);
  const uploadAvatar = async (file?: File) => {
    if (!file || !file.type.startsWith("image/")) return;
    setAvatarBusy(true);
    try {
      const source = await createImageBitmap(file);
      const size = 256;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Image preview unavailable");
      const scale = Math.max(size / source.width, size / source.height);
      const width = source.width * scale;
      const height = source.height * scale;
      context.drawImage(
        source,
        (size - width) / 2,
        (size - height) / 2,
        width,
        height,
      );
      const dataUrl = canvas.toDataURL("image/jpeg", 0.78);
      const response = await fetch(`/api/candidate/${candidate.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatar_url: dataUrl }),
      });
      if (!response.ok) throw new Error("Unable to save candidate picture");
      setAvatarUrl(dataUrl);
    } finally {
      setAvatarBusy(false);
    }
  };
  const addActivity = async () => {
    if (!noteText.trim()) return;
    setNoteBusy(true);
    try {
      const response = await fetch(`/api/candidate/${candidate.id}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          noteText: noteText.trim(),
          noteType,
          jobId: currentJob?.jobId || currentJob?.id,
          jobTitle: currentJobTitle,
          companyName: currentCompany,
        }),
      });
      if (!response.ok) throw new Error("Unable to add activity");
      const events = await fetch(
        `/api/candidate/${candidate.id}/events?limit=100`,
      ).then((r) => r.json());
      setNotes(Array.isArray(events?.events) ? events.events : []);
      setNoteText("");
    } finally {
      setNoteBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f7f8fa] px-2 py-3 text-slate-900 sm:px-3 lg:px-4">
      <div className="mx-auto w-full max-w-none space-y-3">
        <div className="flex items-center justify-between">
          <Link
            href="/dashboard/candidates"
            className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-blue-700"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Candidates
          </Link>
          <Link
            href={`/dashboard/candidates/${candidate.id}`}
            className="text-xs font-semibold text-blue-700 hover:underline"
          >
            Open V1 detail
          </Link>
          <Link
            href={`/dashboard/candidates/${candidate.id}/edit`}
            className="ml-3 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:border-blue-300 hover:text-blue-700"
          >
            Edit Candidate
          </Link>
        </div>

        <div className="grid items-start gap-3 xl:grid-cols-[minmax(0,2.2fr)_minmax(360px,1fr)]">
          <div className="space-y-3">
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <button
                  type="button"
                  onClick={() => avatarInputRef.current?.click()}
                  disabled={avatarBusy}
                  className="group relative h-16 w-16 shrink-0 overflow-hidden rounded-full bg-slate-900 text-xl font-semibold text-white"
                  title="Upload candidate picture"
                >
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    initials(name)
                  )}
                  <span className="absolute inset-0 hidden items-center justify-center bg-black/55 text-[10px] font-semibold group-hover:flex">
                    {avatarBusy ? "Saving" : "Change"}
                  </span>
                </button>
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(event) =>
                    void uploadAvatar(event.target.files?.[0])
                  }
                />
                <div className="min-w-0">
                  <h1 className="truncate text-2xl font-semibold tracking-tight">
                    {name}
                  </h1>
                  <p className="truncate text-sm text-slate-600">
                    {candidate?.title || currentJobTitle || "Candidate"}
                    {candidate?.company || currentCompany
                      ? ` · ${candidate?.company || currentCompany}`
                      : ""}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                    {candidate?.email && (
                      <a
                        className="inline-flex items-center gap-1 hover:text-blue-700"
                        href={`mailto:${candidate.email}`}
                      >
                        <Mail className="h-3.5 w-3.5" />
                        {candidate.email}
                      </a>
                    )}
                    {candidate?.phone && (
                      <a
                        className="inline-flex items-center gap-1 hover:text-blue-700"
                        href={`tel:${candidate.phone}`}
                      >
                        <Phone className="h-3.5 w-3.5" />
                        {candidate.phone}
                      </a>
                    )}
                    {(candidate?.location || currentJob?.location) && (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5" />
                        {candidate?.location || currentJob.location}
                      </span>
                    )}
                  </div>
                  {(salaryRequirement || linkedinUrl) && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {salaryRequirement && (
                        <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-700">
                          <DollarSign className="h-3.5 w-3.5" />
                          {salaryRequirement}
                        </span>
                      )}
                      {linkedinUrl && (
                        <a
                          className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                          href={linkedinUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <Linkedin className="h-3.5 w-3.5" />
                          LinkedIn profile
                        </a>
                      )}
                    </div>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {candidate?.email && (
                      <a
                        href={`mailto:${candidate.email}`}
                        className="rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-semibold text-blue-800 hover:bg-blue-100"
                      >
                        Email
                      </a>
                    )}
                    {candidate?.phone && (
                      <a
                        href={`tel:${candidate.phone}`}
                        className="rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
                      >
                        Call
                      </a>
                    )}
                    {candidate?.phone && (
                      <a
                        href={`sms:${candidate.phone}`}
                        className="rounded-md border border-cyan-200 bg-cyan-50 px-2.5 py-1.5 text-xs font-semibold text-cyan-800 hover:bg-cyan-100"
                      >
                        Text
                      </a>
                    )}
                  </div>
                </div>
                <ObjectAssignments
                  objectType="candidate"
                  objectId={String(candidate.id)}
                  compact
                />
              </div>
            </div>
            {false && (
              <div className="hidden space-y-4">
                <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                  <div className="border-b border-slate-200 px-4 py-3">
                    <h2 className="text-xs font-bold uppercase tracking-wide text-slate-700">
                      Resume
                    </h2>
                  </div>
                  <div className="h-[min(68vh,720px)] min-h-[420px]">
                    <ResumeViewer
                      url={resumeUrl}
                      fileName={resumeName}
                      fileKey={resumeKey}
                      candidateId={candidate.id}
                      className="h-full"
                      onUrlUpdated={setResumeUrl}
                      onResumeChanged={(info) => {
                        if (!info) return;
                        setResumeUrl(info.resumeUrl || "");
                        setResumeName(info.fileName || "");
                        setResumeKey(info.fileKey || info.resumeUrl || "");
                      }}
                    />
                  </div>
                </section>
                <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <h2 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-700">
                    <Sparkles className="h-4 w-4 text-violet-600" /> AI
                    Evaluation
                  </h2>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div>
                      <div className="text-xs text-slate-500">Overall fit</div>
                      <div
                        className="mt-2 flex h-16 w-16 items-center justify-center rounded-full"
                        style={{
                          background: `conic-gradient(#16a34a ${Math.max(0, Math.min(100, Number(fitScore) || 0)) * 3.6}deg, #d1d5db 0deg)`,
                        }}
                      >
                        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-sm font-semibold">
                          {fitScore != null
                            ? Math.round(Number(fitScore))
                            : "—"}
                        </div>
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-slate-600">
                        Key strengths
                      </div>
                      <ul className="mt-1 space-y-1 text-xs text-slate-700">
                        {(fit.fitStrengths || [])
                          .slice(0, 3)
                          .map((item: string) => (
                            <li key={item}>✓ {item}</li>
                          ))}
                      </ul>
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-slate-600">
                        Potential concerns
                      </div>
                      <ul className="mt-1 space-y-1 text-xs text-slate-700">
                        {(fit.fitGaps || []).slice(0, 3).map((item: string) => (
                          <li key={item}>• {item}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-3 w-full text-xs"
                    disabled={fitBusy || !currentJob}
                    onClick={() => void runFit()}
                  >
                    {fitBusy
                      ? "Scoring application..."
                      : fitScore != null
                        ? "Refresh AI Fit"
                        : "Run AI Fit"}
                  </Button>
                </section>
              </div>
            )}
          </section>

          <div className="grid items-start gap-3 xl:grid-cols-[minmax(230px,0.85fr)_minmax(390px,1.35fr)]">
            <div className="space-y-4 xl:sticky xl:top-20 xl:self-start">
              <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-xs font-bold uppercase tracking-wide text-slate-700">
                    Applications ({jobs.length})
                  </h2>
                  <Briefcase className="h-4 w-4 text-slate-400" />
                </div>
                <div className="space-y-3">
                  {visibleApplications.map((job: any, index: number) => {
                    const jobId = String(job.jobId || job.id || "");
                    const id = jobId || `application-${index}`;
                    const active = id === String(selectedJobId);
                    const rejected = isRejectedApplication(job);
                    const track = rejected
                      ? [
                          "sourced",
                          "applied",
                          "interested",
                          "submitted",
                          "interviewing",
                          "rejected",
                        ]
                      : PIPELINE;
                    const activeStageIndex = rejected
                      ? track.length - 1
                      : Math.max(0, track.indexOf(normalizedStage(job.stage)));
                    return (
                      <div
                        key={id}
                        className={`relative w-full rounded-lg border p-3 text-left transition ${rejected ? "border-red-200 bg-red-50/30" : active ? "border-blue-500 bg-blue-50/40 ring-1 ring-blue-100" : "border-slate-200 hover:border-blue-300"}`}
                      >
                        <button
                          type="button"
                          onClick={() => setSelectedJobId(id)}
                          aria-label={`Select ${job.jobTitle || job.title || "application"}`}
                          aria-pressed={active}
                          className="absolute inset-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                        />
                        <div className="pointer-events-none relative flex items-start justify-between gap-2">
                          <div>
                            {jobId ? (
                              <Link
                                href={`/dashboard/jobs/${encodeURIComponent(jobId)}`}
                                className="pointer-events-auto relative z-10 text-sm font-semibold text-slate-900 hover:text-blue-700 hover:underline"
                              >
                                {job.jobTitle || job.title || "Untitled job"}
                              </Link>
                            ) : (
                              <div className="text-sm font-semibold">
                                {job.jobTitle || job.title || "Untitled job"}
                              </div>
                            )}
                            <div className="mt-1 text-xs text-slate-500">
                              {job.companyName ||
                                job.company_name ||
                                job.company ||
                                "Company not specified"}
                            </div>
                          </div>
                          <span
                            className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${rejected ? "bg-red-100 text-red-700" : "bg-blue-50 text-blue-700"}`}
                          >
                            {stageLabel(job.stage)}
                          </span>
                        </div>
                        <div className="pointer-events-none relative mt-4 flex w-full items-start">
                          {track.map((item, stageIndex) => {
                            const reached = stageIndex <= activeStageIndex;
                            const rejectedStep = item === "rejected";
                            return (
                              <div
                                key={item}
                                className="relative flex min-w-0 flex-1 flex-col items-center"
                              >
                                {stageIndex > 0 && (
                                  <span
                                    className={`absolute right-1/2 top-1.5 h-0.5 w-full ${reached ? rejectedStep ? "bg-red-400" : "bg-emerald-500" : "bg-slate-200"}`}
                                  />
                                )}
                                <span
                                  className={`relative z-10 flex h-3 w-3 items-center justify-center rounded-full border text-[7px] ${reached ? rejectedStep ? "border-red-500 bg-red-500 text-white" : "border-emerald-600 bg-emerald-600 text-white" : "border-slate-300 bg-white text-transparent"}`}
                                >
                                  {reached ? "✓" : ""}
                                </span>
                                <span className="mt-1 w-full truncate text-center text-[8px] text-slate-500">
                                  {stageLabel(item)}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                        <div className="pointer-events-none relative mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-500">
                          <span>
                            Applied {date(job.appliedAt || job.applied_at || job.createdAt || candidate?.createdAt)}
                          </span>
                          <span>
                            {rejected ? "Rejected" : "Last Updated"}{" "}
                            {date(job.stageUpdatedAt || job.modifiedAt || job.fitScoredAt)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                  {!visibleApplications.length && (
                    <p className="py-5 text-center text-sm text-slate-500">
                      No active applications.
                    </p>
                  )}
                  {jobs.some((job: any) => isRejectedApplication(job)) && (
                    <button
                      type="button"
                      onClick={() => setShowAllApplications((value) => !value)}
                      className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-50"
                    >
                      {showAllApplications
                        ? "Hide Rejected Applications"
                        : "View All Applications"}
                    </button>
                  )}
                </div>
              </section>
            </div>

            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3">
                <h2 className="text-xs font-bold uppercase tracking-wide text-slate-700">
                  Candidate Activity Timeline
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  All activity for this candidate is shown.
                </p>
              </div>
              <div className="mb-3 rounded-lg border border-blue-100 bg-blue-50/40 p-2.5">
                <div className="flex flex-col gap-2 sm:flex-row">
                  <select
                    value={noteType}
                    onChange={(event) => setNoteType(event.target.value)}
                    className="h-9 rounded-md border border-slate-200 bg-white px-2 text-xs sm:w-36"
                  >
                    <option>Conversation</option>
                    <option>Interview</option>
                    <option>Call</option>
                    <option>Email sent</option>
                    <option>Text sent</option>
                    <option>Note</option>
                    <option>Rejected</option>
                  </select>
                  <input
                    value={noteText}
                    onChange={(event) => setNoteText(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        void addActivity();
                      }
                    }}
                    placeholder=""
                    autoComplete="off"
                    className="h-9 min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-3 text-sm"
                  />
                  <Button
                    size="sm"
                    disabled={noteBusy || !noteText.trim()}
                    onClick={() => void addActivity()}
                    className="h-9 bg-blue-600 text-xs hover:bg-blue-700"
                  >
                    {noteBusy ? "Saving..." : "Log"}
                  </Button>
                </div>
              </div>
              <div className="max-h-[680px] space-y-2 overflow-y-auto pr-1">
                {notesLoading ? (
                  <p className="py-10 text-center text-sm text-slate-500">
                    Loading activity…
                  </p>
                ) : visibleNotes.length ? (
                  visibleNotes.map((note: any, index: number) => {
                    const kind = eventKind(note);
                    const activityJobTitle =
                      note.metadata?.jobTitle || note.jobTitle || "";
                    const matchingJob = orderedJobs.find((job: any) => {
                      const title = job.jobTitle || job.title || "";
                      return (
                        activityJobTitle &&
                        title.toLowerCase() === activityJobTitle.toLowerCase()
                      );
                    });
                    const activityJobId = String(
                      note.metadata?.jobId ||
                        note.metadata?.job_id ||
                        note.jobId ||
                        note.job_id ||
                        matchingJob?.jobId ||
                        matchingJob?.id ||
                        "",
                    );
                    const EventIcon =
                      kind === "interview"
                        ? Calendar
                        : kind === "email"
                          ? Mail
                          : kind === "call"
                            ? PhoneCall
                            : kind === "stage"
                              ? CheckCircle2
                              : Briefcase;
                    return (
                      <div
                        key={note.id || index}
                        className="relative rounded-lg border border-slate-200 p-3 pl-11"
                      >
                        <div className="absolute left-3 top-3 flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-slate-600">
                          <EventIcon className="h-3.5 w-3.5" />
                        </div>
                        <div className="flex items-start justify-between gap-2">
                          <span
                            className={ACTIVITY_BADGE_BASE_CLASS}
                            style={activityBadgeStyle(noteLabel(note))}
                          >
                            {noteLabel(note)}
                          </span>
                          <span className="text-[11px] text-slate-500">
                            {date(note.createdAt || note.timestamp)}
                          </span>
                        </div>
                        <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">
                          {note.description ||
                            note.note ||
                            note.metadata?.noteText ||
                            "Activity recorded."}
                        </p>
                        {(note.metadata?.jobTitle ||
                          note.jobTitle ||
                          note.metadata?.companyName ||
                          note.createdBy) && (
                          <div className="mt-2 text-[11px] text-slate-500">
                            {activityJobTitle && activityJobId ? (
                              <Link
                                href={`/dashboard/jobs/${encodeURIComponent(activityJobId)}`}
                                className="font-medium text-blue-700 hover:underline"
                              >
                                {activityJobTitle}
                              </Link>
                            ) : (
                              activityJobTitle ||
                              note.metadata?.companyName ||
                              ""
                            )}
                            {note.createdBy
                              ? ` · Added by ${note.createdBy}`
                              : ""}
                          </div>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <p className="py-10 text-center text-sm text-slate-500">
                    No activity yet.
                  </p>
                )}
              </div>
            </section>

          </div>
          </div>

            <div className="space-y-3">
              <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-200 px-4 py-3">
                  <h2 className="text-xs font-bold uppercase tracking-wide text-slate-700">
                    Resume
                  </h2>
                </div>
                <div className="h-[min(68vh,720px)] min-h-[420px]">
                  <ResumeViewer
                    url={resumeUrl}
                    fileName={resumeName}
                    fileKey={resumeKey}
                    candidateId={candidate.id}
                    className="h-full"
                    onUrlUpdated={setResumeUrl}
                    onResumeChanged={(info) => {
                      if (!info) return;
                      setResumeUrl(info.resumeUrl || "");
                      setResumeName(info.fileName || "");
                      setResumeKey(info.fileKey || info.resumeUrl || "");
                    }}
                  />
                </div>
              </section>
              <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <h2 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-700">
                  <Sparkles className="h-4 w-4 text-violet-600" /> AI Evaluation
                </h2>
                <div className="mb-3 grid gap-4 sm:grid-cols-[0.75fr_1.2fr_1.2fr]">
                  <div>
                    <div className="text-xs text-slate-500">Overall fit</div>
                    <div
                      className="relative mt-2 flex h-20 w-20 items-center justify-center rounded-full"
                      style={{
                        background: `conic-gradient(#16a34a ${Math.max(0, Math.min(100, Number(fitScore) || 0)) * 3.6}deg, #d1d5db 0deg)`,
                      }}
                    >
                      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white text-lg font-semibold text-slate-900">
                        {fitScore != null ? Math.round(Number(fitScore)) : "—"}
                      </div>
                    </div>
                    <div className="hidden mt-1 text-3xl font-semibold text-emerald-700">
                      {fitScore != null ? `${fitScore}/100` : "—"}
                    </div>
                    <div className="mt-1 text-xs font-semibold text-emerald-700">
                      {fit.fitGrade
                        ? `Grade ${fit.fitGrade}`
                        : fitScore != null
                          ? "Strong fit"
                          : "Not scored"}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-slate-600">
                      Key strengths
                    </div>
                    <ul className="mt-1 space-y-1 text-xs text-slate-700">
                      {(fit.fitStrengths || [])
                        .slice(0, 4)
                        .map((item: string) => (
                          <li key={item}>✓ {item}</li>
                        ))}
                    </ul>
                    <div className="mt-1 text-sm font-semibold text-slate-700">
                      {fit.fitDomainScore != null
                        ? `${fit.fitDomainScore}/100 domain`
                        : "—"}
                      {fit.fitToolScore != null
                        ? ` · ${fit.fitToolScore}/100 tools`
                        : ""}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-slate-600">
                      Potential concerns
                    </div>
                    <ul className="mt-1 space-y-1.5 text-xs text-slate-700">
                      {(fit.fitGaps || []).slice(0, 3).map((item: string) => (
                        <li key={item} className="flex gap-1.5" title={item}>
                          <span className="shrink-0 text-amber-500">•</span>
                          <span>{item}</span>
                        </li>
                      ))}
                      {!(fit.fitGaps || []).length && (
                        <li className="text-slate-500">No concerns identified.</li>
                      )}
                    </ul>
                  </div>
                </div>
                <div className="hidden grid gap-3 border-t border-slate-100 pt-3 sm:grid-cols-2">
                  <div>
                    <div className="text-xs font-semibold text-slate-600">
                      Key strengths
                    </div>
                    <ul className="mt-1 space-y-1 text-sm text-slate-700">
                      {(fit.fitStrengths || [])
                        .slice(0, 4)
                        .map((item: string) => (
                          <li key={item}>✓ {item}</li>
                        ))}
                    </ul>
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-slate-600">
                      Potential concerns
                    </div>
                    <ul className="mt-1 space-y-1 text-sm text-slate-700">
                      {(fit.fitGaps || []).slice(0, 4).map((item: string) => (
                        <li key={item}>• {item}</li>
                      ))}
                    </ul>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-4 w-full text-xs"
                  disabled={fitBusy || !currentJob}
                  onClick={() => void runFit()}
                >
                  {fitBusy
                    ? "Scoring application..."
                    : fitScore != null
                      ? "Refresh AI Fit"
                      : "Run AI Fit"}
                </Button>
              </section>
            </div>
        </div>
      </div>
    </div>
  );
}
