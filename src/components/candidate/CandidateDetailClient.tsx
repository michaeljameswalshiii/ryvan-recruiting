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
  MessageSquare,
  Pencil,
  Plus,
  Sparkles,
  Tag,
  Trash2,
} from "lucide-react";
import { ResumeViewer } from "@/components/candidate/ResumeViewer";
import { LinkJobModal } from "@/components/candidate/LinkJobModal";
import { SendEmailModal } from "@/components/email/send-email-modal";
import { AccountRepPill } from "@/components/shared/AccountRepPill";
import { TagEditor } from "@/components/shared/TagEditor";
import { CopyTextButton } from "@/components/shared/CopyTextButton";
import { FormatActivityNoteButton } from "@/components/shared/FormatActivityNoteButton";
import { Button } from "@/components/ui/button";
import {
  ACTIVITY_BADGE_BASE_CLASS,
  activityBadgeStyle,
} from "@/lib/ui/activity-badge-colors";
import {
  ACTIVITY_NOTE_TYPES,
  normalizeNoteTypeLabel,
} from "@/lib/candidates/note-type-stage";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import {
  actionBarBtn,
  actionBarPrimary,
} from "@/components/shared/EntityActionBar";

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

function ActivityNoteText({ text }: { text: string }) {
  const paragraphRef = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);

  useEffect(() => {
    const paragraph = paragraphRef.current;
    if (!paragraph || expanded) return;

    const measure = () => {
      setOverflows(paragraph.scrollHeight > paragraph.clientHeight + 1);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(paragraph);
    return () => observer.disconnect();
  }, [expanded, text]);

  return (
    <div className="mt-2">
      <p
        ref={paragraphRef}
        className={`whitespace-pre-wrap break-words text-sm text-slate-700 ${expanded ? "" : "line-clamp-3 sm:line-clamp-4"}`}
      >
        {text}
      </p>
      {(overflows || expanded) && (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
          className="mt-1.5 text-xs font-semibold text-blue-700 hover:text-blue-900 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
        >
          {expanded ? "Less" : "More"}
        </button>
      )}
    </div>
  );
}

export function CandidateDetailClient({
  candidate,
  initialJobId = "",
  canDeleteActivity = false,
}: {
  candidate: any;
  initialJobId?: string;
  canDeleteActivity?: boolean;
}) {
  const router = useRouter();
  const [linkedJobs, setLinkedJobs] = useState<any[]>(
    Array.isArray(candidate?.linkedJobs) ? candidate.linkedJobs : [],
  );
  const [linkJobOpen, setLinkJobOpen] = useState(false);

  // Keep local list in sync if server props refresh
  useEffect(() => {
    setLinkedJobs(
      Array.isArray(candidate?.linkedJobs) ? candidate.linkedJobs : [],
    );
  }, [candidate?.linkedJobs, candidate?.id]);

  const jobs = linkedJobs;
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
  const [noteType, setNoteType] = useState("");
  const [noteBusy, setNoteBusy] = useState(false);
  const [deletingEventId, setDeletingEventId] = useState<string | null>(null);
  const [fitBusy, setFitBusy] = useState(false);
  const [fitOverlay, setFitOverlay] = useState<any>(null);
  const [tags, setTags] = useState<string[]>(
    Array.isArray(candidate?.tags) ? candidate.tags : [],
  );
  const [tagBusy, setTagBusy] = useState(false);
  const [tagError, setTagError] = useState("");
  const [stageBusy, setStageBusy] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailConfigured, setEmailConfigured] = useState<boolean | null>(null);
  const [emailFromLabel, setEmailFromLabel] = useState("");
  const name = candidate?.name || "Unknown candidate";

  // Detect connected Gmail/Outlook for full in-app send
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/email/connections", {
          credentials: "include",
          cache: "no-store",
        });
        if (!res.ok) {
          if (!cancelled) setEmailConfigured(false);
          return;
        }
        const data = await res.json();
        const active = Array.isArray(data.activeConnections)
          ? data.activeConnections
          : [];
        if (!cancelled) {
          setEmailConfigured(active.length > 0);
          if (active[0]) {
            const p = String(active[0].provider || "email");
            const addr = String(active[0].emailAddress || "");
            setEmailFromLabel(
              addr
                ? `Sending as ${addr} via ${p === "gmail" ? "Gmail" : p === "outlook" ? "Outlook" : p}`
                : ""
            );
          } else {
            setEmailFromLabel("");
          }
        }
      } catch {
        if (!cancelled) setEmailConfigured(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const candidateEmail = String(candidate?.email || "").trim();

  const handleEmailClick = () => {
    if (!candidateEmail) {
      toast.error("This candidate has no email address");
      return;
    }
    // Always open the compose modal so the click is never silent.
    // Gmail web is available as a real link inside the modal.
    setEmailOpen(true);
  };
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
  const currentJobId = String(currentJob?.jobId || currentJob?.id || "");

  const changeApplicationStage = async (stage: string) => {
    if (!currentJobId || !candidate?.id) {
      toast.error("Attach a job first");
      return;
    }
    setStageBusy(true);
    try {
      const res = await fetch(
        `/api/jobs/${encodeURIComponent(currentJobId)}/stage`,
        {
          method: "PUT",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            candidateId: candidate.id,
            stage,
          }),
        }
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Could not update stage");
      setLinkedJobs((prev) =>
        prev.map((job) =>
          String(job.jobId || job.id) === currentJobId
            ? { ...job, stage, stageUpdatedAt: new Date().toISOString() }
            : job
        )
      );
      if (stage === "submitted") {
        toast.success("Submitted to client");
      } else {
        toast.success(`Stage set to ${stageLabel(stage)}`);
      }
    } catch (err: any) {
      toast.error(err?.message || "Could not update stage");
    } finally {
      setStageBusy(false);
    }
  };
  const currentCompany =
    currentJob?.companyName ||
    currentJob?.company_name ||
    currentJob?.company ||
    "";
  const fit = fitOverlay || currentJob || {};
  const fitScore = fit.fitScore ?? fit.fit_score ?? null;
  const fitGradeLetter = String(fit.fitGrade || fit.fit_grade || "")
    .trim()
    .toUpperCase();
  const fitBand = String(fit.fitBand || fit.band || "").trim();
  const fitHm = String(fit.fitHmReachOut || fit.hmReachOut || "").trim();
  const fitHmReason = String(fit.fitHmReason || fit.hmReason || "").trim();
  const fitFactors: Array<{ id?: string; label?: string; points?: number; max?: number; detail?: string }> =
    Array.isArray(fit.fitFactors)
      ? fit.fitFactors
      : Array.isArray(fit.rubric)
        ? fit.rubric
        : [];
  const fitVerify: string[] = Array.isArray(fit.fitVerify)
    ? fit.fitVerify
    : Array.isArray(fit.verifyBeforeAdvancing)
      ? fit.verifyBeforeAdvancing
      : [];
  const fitStrengthsList: string[] = Array.isArray(fit.fitStrengths)
    ? fit.fitStrengths
    : Array.isArray(fit.strengths)
      ? fit.strengths
      : [];
  const fitGapsList: string[] = Array.isArray(fit.fitGaps)
    ? fit.fitGaps
    : Array.isArray(fit.gaps)
      ? fit.gaps
      : [];
  const fitBandColor =
    /strong/i.test(fitBand) || fitGradeLetter === "A"
      ? "text-emerald-700"
      : /good/i.test(fitBand) || fitGradeLetter === "B"
        ? "text-sky-700"
        : /review/i.test(fitBand) || fitGradeLetter === "C"
          ? "text-amber-700"
          : fitScore != null
            ? "text-rose-700"
            : "text-slate-600";
  const fitRingColor =
    /strong/i.test(fitBand) || Number(fitScore) >= 85
      ? "#16a34a"
      : /good/i.test(fitBand) || Number(fitScore) >= 70
        ? "#0284c7"
        : /review/i.test(fitBand) || Number(fitScore) >= 55
          ? "#d97706"
          : fitScore != null
            ? "#e11d48"
            : "#64748b";
  const runFit = async () => {
    const jobId = currentJob?.jobId || currentJob?.id;
    if (!jobId) {
      toast.error("Select an application first, then run AI Fit");
      return;
    }
    if (!candidate?.id) {
      toast.error("Missing candidate id");
      return;
    }
    setFitBusy(true);
    try {
      const response = await fetch(
        `/api/jobs/${encodeURIComponent(String(jobId))}/fit-score`,
        {
          method: "POST",
          credentials: "include",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            candidateId: String(candidate.id),
            persist: true,
          }),
        }
      );
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          body?.error || `Fit scoring failed (HTTP ${response.status})`
        );
      }
      // POST returns { scores: [{ fit }] }; GET-style also may return { fit }
      const row = Array.isArray(body?.scores) ? body.scores[0] : null;
      const scored =
        body?.fit ||
        row?.fit ||
        (row && typeof row.score === "number" ? row : null) ||
        {};
      if (scored.score == null && scored.grade == null) {
        throw new Error(
          body?.missing?.length
            ? "Candidate not found for this job fit request"
            : "Fit score response was empty — try again"
        );
      }
      setFitOverlay({
        fitScore: scored.score,
        fitGrade: scored.grade,
        fitBand: scored.band,
        fitHmReachOut: scored.hmReachOut,
        fitHmReason: scored.hmReason,
        fitVerify: scored.verifyBeforeAdvancing || scored.fitVerify,
        fitFactors: scored.rubric || scored.fitFactors,
        fitStrengths: Array.isArray(scored.strengths) ? scored.strengths : [],
        fitGaps: Array.isArray(scored.gaps) ? scored.gaps : [],
        fitSummary: scored.summary || "",
      });
      toast.success(
        `AI Fit updated: ${Math.round(Number(scored.score))}/100` +
          (scored.band ? ` · ${scored.band}` : "")
      );
    } catch (err: any) {
      console.error("[runFit]", err);
      toast.error(err?.message || "Failed to refresh AI Fit");
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
    if (!noteType || !noteText.trim()) return;
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
      setNoteType("");
    } finally {
      setNoteBusy(false);
    }
  };

  const deleteActivity = async (note: any) => {
    const eventId = String(note?.id || note?.timestamp || "");
    if (!canDeleteActivity || !eventId || deletingEventId) return;
    if (!window.confirm("Delete this activity log item? This cannot be undone.")) {
      return;
    }

    setDeletingEventId(eventId);
    try {
      const response = await fetch(
        `/api/candidate/${candidate.id}/events?eventId=${encodeURIComponent(eventId)}`,
        { method: "DELETE" },
      );
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body?.error || "Unable to delete activity");
      }
      setNotes((current) =>
        current.filter(
          (item) => String(item?.id || item?.timestamp || "") !== eventId,
        ),
      );
    } catch (error) {
      window.alert(
        error instanceof Error ? error.message : "Unable to delete activity",
      );
    } finally {
      setDeletingEventId(null);
    }
  };

  const saveTags = async (nextTags: string[]) => {
    const normalized = Array.from(
      new Map(
        nextTags
          .map((tag) => tag.trim())
          .filter(Boolean)
          .slice(0, 25)
          .map((tag) => [tag.toLowerCase(), tag]),
      ).values(),
    );
    setTagBusy(true);
    setTagError("");
    try {
      const response = await fetch(`/api/candidate/${candidate.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags: normalized }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || "Unable to save tags");
      setTags(normalized);
    } catch (error) {
      setTagError(error instanceof Error ? error.message : "Unable to save tags");
    } finally {
      setTagBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f7f8fa] px-2 py-3 text-slate-900 sm:px-3 lg:px-4">
      <div className="mx-auto w-full max-w-none space-y-3">
        <div className="flex items-center">
          <Link
            href="/dashboard/candidates"
            className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-blue-700"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Candidates
          </Link>
        </div>

        {/*
          Layout:
            [ full-width header + account-rep pill ]
            [ applications | AI ] [ resume (taller, more width) ]
            [ activity (same width as apps+AI) ] [ resume continues ]
        */}
        <div className="space-y-3">
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <button
                  type="button"
                  onClick={() => avatarInputRef.current?.click()}
                  disabled={avatarBusy}
                  className="group relative h-12 w-12 shrink-0 overflow-hidden rounded-full bg-slate-900 text-sm font-semibold text-white"
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
                  <div className="flex min-w-0 items-center gap-1">
                    <h1 className="truncate text-2xl font-semibold tracking-tight">
                      {name}
                    </h1>
                    <CopyTextButton value={name} label="name" />
                  </div>
                  <p className="truncate text-sm text-slate-600">
                    {candidate?.title || currentJobTitle || "Candidate"}
                    {candidate?.company || currentCompany
                      ? ` · ${candidate?.company || currentCompany}`
                      : ""}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                    {candidateEmail && (
                      <span className="inline-flex items-center gap-0.5">
                        <button
                          type="button"
                          onClick={handleEmailClick}
                          className="inline-flex items-center gap-1 hover:text-blue-700"
                          title="Compose email"
                        >
                          <Mail className="h-3.5 w-3.5" />
                          {candidateEmail}
                        </button>
                        <CopyTextButton value={candidateEmail} label="email" />
                      </span>
                    )}
                    {candidate?.phone && (
                      <span className="inline-flex items-center gap-0.5">
                        <a
                          className="inline-flex items-center gap-1 hover:text-blue-700"
                          href={`tel:${candidate.phone}`}
                        >
                          <Phone className="h-3.5 w-3.5" />
                          {candidate.phone}
                        </a>
                        <CopyTextButton value={candidate.phone} label="phone" />
                      </span>
                    )}
                    {(candidate?.location || currentJob?.location) && (
                      <span className="inline-flex items-center gap-0.5">
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5" />
                          {candidate?.location || currentJob.location}
                        </span>
                        <CopyTextButton
                          value={candidate?.location || currentJob.location}
                          label="location"
                        />
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
                          LinkedIn
                        </a>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <AccountRepPill
                objectType="candidate"
                objectId={String(candidate.id)}
                label="Account Rep"
                assignmentRole="account_manager"
              />
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={handleEmailClick}
                disabled={!candidateEmail}
                className={actionBarBtn}
              >
                <Mail className="h-3.5 w-3.5" />
                Email
              </button>
              <a
                href={candidate?.phone ? `tel:${candidate.phone}` : undefined}
                className={`${actionBarBtn} ${!candidate?.phone ? "pointer-events-none opacity-50" : ""}`}
              >
                <Phone className="h-3.5 w-3.5" />
                Call
              </a>
              <a
                href={candidate?.phone ? `sms:${candidate.phone}` : undefined}
                className={`${actionBarBtn} ${!candidate?.phone ? "pointer-events-none opacity-50" : ""}`}
              >
                <MessageSquare className="h-3.5 w-3.5" />
                Text
              </a>
              {linkedinUrl ? (
                <a
                  href={linkedinUrl}
                  target="_blank"
                  rel="noreferrer"
                  className={actionBarBtn}
                >
                  <Linkedin className="h-3.5 w-3.5" />
                  LinkedIn
                </a>
              ) : (
                <Link
                  href={`/dashboard/candidates/${candidate.id}/edit`}
                  className={actionBarBtn}
                >
                  <Linkedin className="h-3.5 w-3.5" />
                  Add LinkedIn
                </Link>
              )}
              <button
                type="button"
                className={actionBarPrimary}
                disabled={!currentJob || stageBusy}
                onClick={() => void changeApplicationStage("submitted")}
              >
                Submit to Client
              </button>
              <select
                className={`${actionBarBtn} pr-8`}
                disabled={!currentJob || stageBusy}
                value={normalizedStage(currentJob?.stage)}
                onChange={(e) => void changeApplicationStage(e.target.value)}
                aria-label="Move stage"
              >
                <option value="" disabled>
                  Move Stage
                </option>
                {PIPELINE.map((stage) => (
                  <option key={stage} value={stage}>
                    {stageLabel(stage)}
                  </option>
                ))}
                <option value="rejected">Rejected</option>
              </select>
              <button
                type="button"
                className={actionBarBtn}
                onClick={() => {
                  document
                    .getElementById("candidate-activity-log")
                    ?.scrollIntoView({ behavior: "smooth", block: "center" });
                  window.setTimeout(() => {
                    document
                      .querySelector<HTMLTextAreaElement>(
                        "#candidate-activity-log textarea"
                      )
                      ?.focus();
                  }, 250);
                }}
              >
                Add Note
              </button>
              <Link
                href={`/dashboard/candidates/${candidate.id}/edit`}
                className={actionBarBtn}
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </Link>
            </div>
          </section>

          <div className="grid items-stretch gap-3 xl:grid-cols-[minmax(0,0.9fr)_minmax(520px,1.45fr)]">
            <div className="grid min-w-0 content-start gap-3">
              <div className="grid grid-cols-1 items-stretch gap-3 lg:grid-cols-2">
              <section className="flex h-full min-h-0 flex-col rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h2 className="text-xs font-bold uppercase tracking-wide text-slate-700">
                    Applications ({jobs.length})
                  </h2>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 shrink-0 gap-1 px-2 text-[11px] font-semibold"
                    onClick={() => setLinkJobOpen(true)}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Attach to Job
                  </Button>
                </div>
                <div className="min-h-0 flex-1 space-y-3">
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
                    <div className="flex flex-col items-center gap-2 py-6 text-center">
                      <p className="text-sm text-slate-500">
                        No active applications.
                      </p>
                      <Button
                        type="button"
                        size="sm"
                        className="h-8 gap-1 bg-blue-600 text-xs hover:bg-blue-700"
                        onClick={() => setLinkJobOpen(true)}
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Attach to Job
                      </Button>
                    </div>
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
                <div className="mt-auto border-t border-slate-100 pt-4">
                  <div className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">
                    <Tag className="h-3.5 w-3.5 text-violet-600" /> Tags
                  </div>
                  <TagEditor
                    value={tags}
                    onChange={(next) => void saveTags(next)}
                    objectType="candidate"
                    disabled={tagBusy}
                    placeholder="+ Add tag"
                  />
                  {tagError && <p className="mt-1 text-xs text-red-600">{tagError}</p>}
                </div>
              </section>

              <section
                data-ai-evaluation
                className="flex h-full min-h-0 flex-col rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
              >
                <h2 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-700">
                  <Sparkles className="h-4 w-4 text-violet-600" /> AI Evaluation
                </h2>

                <div className="mb-3 rounded-lg border border-slate-100 bg-slate-50/80 p-3">
                  <div className="flex items-center gap-3">
                    <div
                      className="relative flex h-[4.5rem] w-[4.5rem] shrink-0 items-center justify-center rounded-full"
                      style={{
                        background: `conic-gradient(${fitRingColor} ${Math.max(0, Math.min(100, Number(fitScore) || 0)) * 3.6}deg, #e2e8f0 0deg)`,
                      }}
                      aria-label={
                        fitScore != null
                          ? `Overall fit ${Math.round(Number(fitScore))} out of 100`
                          : "Not scored"
                      }
                    >
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-lg font-bold text-slate-900">
                        {fitScore != null ? Math.round(Number(fitScore)) : "—"}
                      </div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                        Overall fit
                      </div>
                      <div className={`text-base font-semibold ${fitBandColor}`}>
                        {fitBand
                          ? fitBand
                          : fitScore != null
                            ? "Scored"
                            : "Not scored"}
                      </div>
                      {fitHm ? (
                        <div className="mt-1 text-[11px] leading-snug text-slate-600">
                          Hiring manager reach out: <span className="font-semibold">{fitHm}</span>
                          {fitHmReason ? ` — ${fitHmReason}` : ""}
                        </div>
                      ) : null}
                      {fitFactors.length > 0 ? (
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {fitFactors.map((f) => (
                            <span
                              key={f.label || f.id}
                              className="inline-flex items-center rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold tabular-nums text-slate-700"
                              title={f.detail}
                            >
                              {(f.label || "").replace("Relevant Experience / Can-Do", "Experience").replace("Software / Skills / Certs", "Skills").replace("Location & Logistics", "Location").replace("Industry Alignment", "Industry")}{" "}
                              {f.points}/{f.max}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>

                {fitVerify.length > 0 && (
                  <div className="mb-3 rounded-lg border border-slate-200 bg-white p-2.5">
                    <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-600">
                      Verify before advancing
                    </div>
                    <ul className="space-y-1 text-xs text-slate-700">
                      {fitVerify.slice(0, 4).map((item) => (
                        <li key={item}>• {item}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="mb-3 grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2 sm:grid-rows-1">
                  <div className="flex h-full min-h-[9rem] min-w-0 flex-col rounded-lg border border-emerald-100 bg-emerald-50/40 p-2.5">
                    <div className="mb-1.5 shrink-0 text-[11px] font-bold uppercase tracking-wide text-emerald-800">
                      Key strengths
                    </div>
                    <ul className="min-h-0 flex-1 space-y-1.5 overflow-hidden text-xs leading-snug text-slate-700">
                      {fitStrengthsList.length ? (
                        fitStrengthsList.slice(0, 4).map((item: string) => (
                          <li key={item} className="flex gap-1.5" title={item}>
                            <span className="shrink-0 font-bold text-emerald-600">
                              ✓
                            </span>
                            <span className="min-w-0 break-words [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:3] overflow-hidden">
                              {item}
                            </span>
                          </li>
                        ))
                      ) : (
                        <li className="text-slate-500">
                          {fitScore != null
                            ? "No strong factors (75+) on this run."
                            : "Run AI Fit to score this application."}
                        </li>
                      )}
                    </ul>
                  </div>
                  <div className="flex h-full min-h-[9rem] min-w-0 flex-col rounded-lg border border-amber-100 bg-amber-50/40 p-2.5">
                    <div className="mb-1.5 shrink-0 text-[11px] font-bold uppercase tracking-wide text-amber-900">
                      Potential concerns
                    </div>
                    <ul className="min-h-0 flex-1 space-y-1.5 overflow-hidden text-xs leading-snug text-slate-700">
                      {fitGapsList.length ? (
                        fitGapsList.slice(0, 4).map((item: string) => (
                          <li key={item} className="flex gap-1.5" title={item}>
                            <span className="shrink-0 text-amber-600">•</span>
                            <span className="min-w-0 break-words [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:3] overflow-hidden">
                              {item}
                            </span>
                          </li>
                        ))
                      ) : (
                        <li className="text-slate-500">
                          {fitScore != null
                            ? "No major concerns identified."
                            : "—"}
                        </li>
                      )}
                    </ul>
                  </div>
                </div>

                <Button
                  size="sm"
                  variant="outline"
                  className="mt-auto w-full shrink-0 text-xs"
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

            <section
              id="candidate-activity-log"
              className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="mb-3">
                <h2 className="text-xs font-bold uppercase tracking-wide text-slate-700">
                  Candidate Activity Timeline
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  All activity for this candidate is shown.
                </p>
              </div>
              <div className="mb-3 rounded-lg border border-blue-100 bg-blue-50/40 p-2.5">
                <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-end">
                  <select
                    value={noteType}
                    onChange={(event) => setNoteType(event.target.value)}
                    aria-label="Activity type"
                    className="h-9 rounded-md border border-slate-200 bg-white px-2 text-xs sm:w-36"
                  >
                    <option value="">Select type...</option>
                    {ACTIVITY_NOTE_TYPES.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                  <textarea
                    value={noteText}
                    onChange={(event) => setNoteText(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                        event.preventDefault();
                        void addActivity();
                      }
                    }}
                    placeholder="Add activity details..."
                    rows={3}
                    className="min-h-[76px] min-w-0 flex-1 resize-y rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
                  />
                  <FormatActivityNoteButton
                    value={noteText}
                    onChange={setNoteText}
                    disabled={noteBusy}
                  />
                  <Button
                    size="sm"
                    disabled={noteBusy || !noteType || !noteText.trim()}
                    onClick={() => void addActivity()}
                    className="h-9 shrink-0 bg-blue-600 text-xs hover:bg-blue-700"
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
                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] text-slate-500">
                              {date(note.createdAt || note.timestamp)}
                            </span>
                            {canDeleteActivity && (note.id || note.timestamp) && (
                              <button
                                type="button"
                                onClick={() => void deleteActivity(note)}
                                disabled={
                                  deletingEventId ===
                                  String(note.id || note.timestamp)
                                }
                                title="Delete activity"
                                aria-label="Delete activity"
                                className="rounded-md p-1 text-red-600 hover:bg-red-50 hover:text-red-700 disabled:cursor-wait disabled:opacity-40"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                        <ActivityNoteText
                          text={String(
                            note.metadata?.noteText ||
                              note.note ||
                              note.description ||
                              "Activity recorded.",
                          )}
                        />
                        {(note.metadata?.jobTitle ||
                          note.jobTitle ||
                          note.metadata?.companyName ||
                          note.createdByName ||
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
                            {note.createdByName || note.createdBy
                              ? ` · Added by ${note.createdByName || note.createdBy}`
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

          <section className="flex min-h-[560px] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm xl:min-h-full">
            <div className="border-b border-slate-200 px-4 py-3">
              <h2 className="text-xs font-bold uppercase tracking-wide text-slate-700">
                Resume
              </h2>
            </div>
            <div className="min-h-[560px] flex-1 xl:min-h-0">
              <ResumeViewer
                url={resumeUrl}
                fileName={resumeName}
                fileKey={resumeKey}
                candidateId={candidate.id}
                className="h-full min-h-[560px]"
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
          </div>
        </div>
      </div>

      <LinkJobModal
        open={linkJobOpen}
        onOpenChange={setLinkJobOpen}
        candidateId={String(candidate?.id || "")}
        candidateName={name}
        currentLinkedJobs={linkedJobs.map((j: any) => ({
          jobId: String(j.jobId || j.id || ""),
          jobTitle: j.jobTitle || j.title,
          companyId: j.companyId || j.company_id,
          companyName: j.companyName || j.company_name || j.company,
          stage: j.stage,
        }))}
        onLinked={(next) => {
          // Merge modal summary with any existing stage metadata we already had.
          // `next` is the full desired set — unlinked jobs are omitted entirely.
          const prevIds = new Set(
            linkedJobs.map((j: any) => String(j.jobId || j.id || "")),
          );
          const byId = new Map(
            linkedJobs.map((j: any) => [String(j.jobId || j.id || ""), j]),
          );
          const merged = next.map((n) => {
            const prev = byId.get(String(n.jobId));
            return {
              ...(prev || {}),
              jobId: n.jobId,
              jobTitle: n.jobTitle || prev?.jobTitle || prev?.title,
              companyId: n.companyId || prev?.companyId,
              companyName:
                n.companyName ||
                prev?.companyName ||
                prev?.company_name ||
                prev?.company,
              stage: n.stage || prev?.stage || "sourced",
            };
          });
          setLinkedJobs(merged);
          const added = next.filter((n) => !prevIds.has(String(n.jobId)));
          const stillSelected = merged.some(
            (j) => String(j.jobId || j.id || "") === String(selectedJobId),
          );
          const focusJobId = added[0]?.jobId
            ? String(added[0].jobId)
            : stillSelected
              ? String(selectedJobId)
              : String(merged[0]?.jobId || merged[0]?.id || "");
          if (!merged.length) {
            setSelectedJobId("");
          } else {
            setSelectedJobId(focusJobId);
          }
          if (added[0]?.jobId && candidate?.id) {
            const jobId = String(added[0].jobId);
            setFitBusy(true);
            void fetch(
              `/api/jobs/${encodeURIComponent(jobId)}/fit-score`,
              {
                method: "POST",
                credentials: "include",
                cache: "no-store",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  candidateId: String(candidate.id),
                  persist: true,
                }),
              },
            )
              .then(async (response) => {
                const body = await response.json().catch(() => ({}));
                if (!response.ok) {
                  throw new Error(body?.error || "Fit scoring failed");
                }
                const row = Array.isArray(body?.scores) ? body.scores[0] : null;
                const scored =
                  body?.fit ||
                  row?.fit ||
                  (row && typeof row.score === "number" ? row : null) ||
                  {};
                if (scored.score == null && scored.grade == null) return;
                setFitOverlay({
                  fitScore: scored.score,
                  fitGrade: scored.grade,
                  fitBand: scored.band,
                  fitHmReachOut: scored.hmReachOut,
                  fitHmReason: scored.hmReason,
                  fitVerify: scored.verifyBeforeAdvancing || scored.fitVerify,
                  fitFactors: scored.rubric || scored.fitFactors,
                  fitStrengths: Array.isArray(scored.strengths)
                    ? scored.strengths
                    : [],
                  fitGaps: Array.isArray(scored.gaps) ? scored.gaps : [],
                  fitSummary: scored.summary || "",
                });
                toast.success(
                  `AI Fit updated: ${Math.round(Number(scored.score))}/100` +
                    (scored.band ? ` · ${scored.band}` : ""),
                );
              })
              .catch((err) => {
                console.warn("[auto-fit after attach]", err);
              })
              .finally(() => setFitBusy(false));
          }
        }}
      />

      <SendEmailModal
        open={emailOpen}
        onOpenChange={setEmailOpen}
        candidate={
          candidateEmail ? { email: candidateEmail, name } : null
        }
        fromLabel={emailFromLabel}
        allowInAppSend={emailConfigured === true}
        onSend={async (subject, body) => {
          const res = await fetch("/api/email/send", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              to: candidate.email,
              subject,
              text: body,
              html: body.replace(/\n/g, "<br/>"),
              candidateId: candidate.id,
              candidateEmail: candidate.email,
            }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok || data.success === false) {
            throw new Error(data.error || "Failed to send email");
          }
          // Log activity on candidate timeline
          try {
            await fetch(`/api/candidate/${candidate.id}/notes`, {
              method: "POST",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                noteText: `Email sent: ${subject}`,
                noteType: "EM Sent",
              }),
            });
            // Refresh notes list
            const notesRes = await fetch(
              `/api/candidate/${candidate.id}/events?limit=100`,
              { credentials: "include" }
            );
            if (notesRes.ok) {
              const notesBody = await notesRes.json();
              setNotes(
                Array.isArray(notesBody?.events)
                  ? notesBody.events
                  : Array.isArray(notesBody)
                    ? notesBody
                    : []
              );
            }
          } catch {
            /* non-blocking */
          }
          toast.success(`Email sent to ${candidate.email}`);
        }}
      />
    </div>
  );
}
