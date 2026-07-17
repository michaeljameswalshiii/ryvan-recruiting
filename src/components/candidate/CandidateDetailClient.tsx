'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Mail,
  Phone,
  MapPin,
  Pencil,
  Trash2,
  Loader2,
  FileText,
  Download,
  ExternalLink,
  RefreshCw,
  Sparkles,
  Briefcase,
  ChevronRight,
  Linkedin,
  DollarSign,
  Check,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { SendEmailModal } from '@/components/email/send-email-modal';
import { ResumeViewer } from '@/components/candidate/ResumeViewer';
import { LinkJobModal } from '@/components/candidate/LinkJobModal';
import { MergeCandidatesModal } from '@/components/candidate/MergeCandidatesModal';
import { Link2, Unlink, Combine } from 'lucide-react';

import {
  ACTIVITY_NOTE_TYPES,
  noteTypeDrivesStage,
  noteTypeFromStage,
  stageDisplayLabel,
} from '@/lib/candidates/note-type-stage';
import { ExpandableNoteText } from '@/components/shared/ExpandableNoteText';

/** Activity / note types shown in the log composer */
const NOTE_TYPES = ACTIVITY_NOTE_TYPES;

/** Human labels for system event types in the activity log */
const EVENT_TYPE_LABELS: Record<string, string> = {
  NOTE: 'Note',
  EMAIL_SENT: 'Email sent',
  EMAIL_OPENED: 'Email opened',
  STATUS_CHANGED: 'Stage change',
  STATUS_CHANGE: 'Stage change',
  STAGE_CHANGED: 'Stage change',
  STAGE_CHANGE: 'Stage change',
  PIPELINE_MOVE: 'Pipeline',
  JOB_LINKED: 'Job linked',
  JOB_UNLINKED: 'Job unlinked',
  JOB_STAGE_CHANGED: 'Job stage',
  PROFILE_UPDATED: 'Profile update',
  INTERVIEW_SCHEDULED: 'Interview',
  INTERVIEW_COMPLETED: 'Interview done',
  CALL_COMPLETED: 'Call',
  CANDIDATE_CREATED: 'Created',
  CANDIDATE_IMPORTED: 'Imported',
};

/**
 * Pipeline chips on candidate detail.
 * Sourced = recruiter-found; Applied = careers self-apply; Interested before Submitted.
 * Legacy statuses (identification, etc.) still map into these steps.
 */
const PIPELINE_STEPS = [
  {
    key: 'sourced',
    label: 'Sourced',
    match: [
      'sourced',
      'identification',
      'outreach',
      'new',
      'contacted',
      'identified',
      'left_message',
      'text',
      'email',
      'other',
    ],
  },
  { key: 'applied', label: 'Applied', match: ['applied', 'application'] },
  { key: 'interested', label: 'Interested', match: ['interested'] },
  {
    key: 'submitted',
    label: 'Submitted',
    match: ['submitted', 'pre_screened', 'presented', 'conversation', 'qualified'],
  },
  { key: 'interviewing', label: 'Interviewing', match: ['interviewing', 'interview'] },
  {
    key: 'offer_out',
    label: 'Offer Out',
    match: ['offer_out', 'offer', 'accept', 'offer_accepted'],
  },
  {
    key: 'accepted',
    label: 'Accepted',
    match: ['placed', 'converted', 'hired', 'accepted'],
  },
] as const;

const REJECTED = ['rejected', 'not_interested', 'offer_declined', 'withdrawn'];

/** Header fields that support click-to-edit / paste-and-save */
type HeaderFieldKey =
  | 'name'
  | 'title'
  | 'company'
  | 'email'
  | 'phone'
  | 'location'
  | 'linkedin'
  | 'salaryRequirements';

function normalizeStage(raw?: string): string {
  if (!raw) return 'sourced';
  return String(raw).trim().toLowerCase().replace(/\s+/g, '_');
}

function stageIndex(status?: string): number {
  const s = normalizeStage(status);
  if (REJECTED.includes(s)) return -1;
  // Exact key match first so "interested" does not collide with "not_interested"
  // (not_interested already filtered above).
  for (let i = PIPELINE_STEPS.length - 1; i >= 0; i--) {
    if (PIPELINE_STEPS[i].key === s || PIPELINE_STEPS[i].match.includes(s)) return i;
  }
  return 0;
}

function stageToApiStatus(stepKey: string): string {
  const map: Record<string, string> = {
    sourced: 'sourced',
    applied: 'applied',
    interested: 'interested',
    submitted: 'submitted',
    interviewing: 'interviewing',
    offer_out: 'offer_out',
    accepted: 'converted',
  };
  return map[stepKey] || stepKey;
}

/**
 * Effective pipeline status: furthest of lead.status and linkedJobs[].stage.
 * List UI historically preferred linked job stage only — after status-only
 * advances those diverged and the person looked stuck on early stages.
 */
function resolveEffectiveStatus(candidate: any): string {
  const linked = Array.isArray(candidate?.linkedJobs) ? candidate.linkedJobs : [];
  const values: string[] = [];
  if (candidate?.status) values.push(String(candidate.status));
  for (const j of linked) {
    if (j?.stage) values.push(String(j.stage));
  }
  if (values.length === 0) return 'sourced';

  const statusNorm = normalizeStage(candidate?.status);
  if (REJECTED.includes(statusNorm)) return statusNorm;

  let best = values[0];
  let bestIdx = stageIndex(best);
  for (const v of values) {
    const n = normalizeStage(v);
    if (REJECTED.includes(n)) continue;
    const idx = stageIndex(v);
    if (idx > bestIdx) {
      best = v;
      bestIdx = idx;
    }
  }
  return best;
}

function getInitials(name: string) {
  if (!name) return '?';
  return name
    .split(/\s+/)
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function formatShortDate(value?: string) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return '—';
  }
}

function formatDateTime(value?: string) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

function noteTypeBadgeClass(label: string) {
  const l = label.toLowerCase();
  if (l.includes('interview')) return 'bg-violet-100 text-violet-800 border-violet-200';
  if (l.includes('submit')) return 'bg-sky-100 text-sky-800 border-sky-200';
  if (l.includes('email')) return 'bg-blue-100 text-blue-800 border-blue-200';
  if (l.includes('left message') || l.includes('phone') || l.includes('call'))
    return 'bg-amber-100 text-amber-900 border-amber-200';
  if (l.includes('conversation'))
    return 'bg-emerald-100 text-emerald-800 border-emerald-200';
  if (l.includes('job linked') || l.includes('job unlinked'))
    return 'bg-indigo-100 text-indigo-800 border-indigo-200';
  if (l.includes('job stage') || l.includes('stage') || l.includes('pipeline'))
    return 'bg-orange-100 text-orange-900 border-orange-200';
  if (l.includes('profile')) return 'bg-slate-100 text-slate-800 border-slate-200';
  return 'bg-slate-100 text-slate-700 border-slate-200';
}

interface CandidateDetailClientProps {
  candidate: any;
}

export function CandidateDetailClient({ candidate }: CandidateDetailClientProps) {
  const router = useRouter();
  const safe = candidate || {};
  const candidateId = safe.id || '';

  const [activeTab, setActiveTab] = useState<
    'overview' | 'timeline' | 'resume' | 'jobs'
  >('overview');
  const [notes, setNotes] = useState<any[]>([]);
  const [notesLoading, setNotesLoading] = useState(true);
  const [newNote, setNewNote] = useState('');
  const [noteType, setNoteType] = useState('Conversation');
  const [addingNote, setAddingNote] = useState(false);
  /** Inline edit state for activity log rows */
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [editNoteText, setEditNoteText] = useState('');
  const [editNoteType, setEditNoteType] = useState('Conversation');
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingEventId, setDeletingEventId] = useState<string | null>(null);
  const [status, setStatus] = useState(() => resolveEffectiveStatus(safe));
  const [updatingStage, setUpdatingStage] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [aiLoading, setAiLoading] = useState<string | null>(null);
  const [aiOutput, setAiOutput] = useState<string>('');
  const [resumeUrl, setResumeUrl] = useState(safe.resumeUrl || '');
  const [resumeFileName, setResumeFileName] = useState(
    safe.resumeFileName || ''
  );
  const [resumeKey, setResumeKey] = useState(
    safe.resumeKey || safe.resume_key || ''
  );
  const [linkJobOpen, setLinkJobOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [linkedJobs, setLinkedJobs] = useState<any[]>(
    Array.isArray(safe.linkedJobs) ? safe.linkedJobs : []
  );
  const [unlinkingJobId, setUnlinkingJobId] = useState<string | null>(null);

  const [contactInfo, setContactInfo] = useState({
    name: safe.name || '',
    email: safe.email || '',
    phone: safe.phone || '',
    location: safe.location || '',
    title: safe.title || '',
    fullAddress: safe.fullAddress || '',
    salaryRequirements: safe.salaryRequirements || '',
    company: safe.company || '',
    linkedin: safe.linkedin || '',
  });

  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState({ ...contactInfo });
  const [isSavingContact, setIsSavingContact] = useState(false);

  /** Inline header field edit — click value / "Add …" to paste and save */
  const [editingField, setEditingField] = useState<HeaderFieldKey | null>(null);
  const [fieldDraft, setFieldDraft] = useState('');
  const [savingField, setSavingField] = useState(false);

  const currentStep = stageIndex(status);
  const currentStepLabel =
    currentStep >= 0 ? PIPELINE_STEPS[currentStep].label : 'Rejected';
  const primaryJob =
    linkedJobs.length > 0 ? linkedJobs[0] : null;

  const skills: string[] = Array.isArray(safe.skills) ? safe.skills : [];
  const experience: any[] = Array.isArray(safe.experience) ? safe.experience : [];
  const education: any[] = Array.isArray(safe.education) ? safe.education : [];

  const fetchNotes = async () => {
    if (!candidateId) {
      setNotesLoading(false);
      return;
    }
    setNotesLoading(true);
    try {
      const res = await fetch(
        `/api/candidate/${candidateId}/events?t=${Date.now()}&limit=50`
      );
      if (res.ok) {
        const data = await res.json();
        const events = Array.isArray(data) ? data : data.events || [];
        setNotes(events);
      }
    } catch (err) {
      console.error('Failed to fetch notes', err);
    } finally {
      setNotesLoading(false);
    }
  };

  useEffect(() => {
    fetchNotes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidateId]);

  const getNoteTypeLabel = (note: any): string => {
    const meta = note?.metadata || {};
    if (meta.noteTypeLabel) return meta.noteTypeLabel;
    if (meta.noteType) {
      const match = NOTE_TYPES.find((t) => t.value === meta.noteType);
      if (match) return match.label;
      const pretty = String(meta.noteType).replace(/_/g, ' ');
      return pretty.charAt(0).toUpperCase() + pretty.slice(1);
    }
    const et = note?.eventType as string | undefined;
    if (et && EVENT_TYPE_LABELS[et]) return EVENT_TYPE_LABELS[et];
    if (et && et !== 'NOTE') {
      return String(et).replace(/_/g, ' ');
    }
    return 'Note';
  };

  const getNoteBody = (note: any): string => {
    const meta = note?.metadata || {};
    if (meta.noteText) return String(meta.noteText);
    if (note?.description) return String(note.description);
    if (note?.title) return String(note.title);
    if (note?.noteText) return String(note.noteText);
    // Compose from job metadata when present
    if (meta.jobTitle) {
      const stage = meta.stage || meta.newStage;
      return stage
        ? `${meta.jobTitle} · ${String(stage).replace(/_/g, ' ')}`
        : String(meta.jobTitle);
    }
    return '—';
  };

  const handleAddNote = async () => {
    if (!candidateId) return;
    // Detail text optional — action type alone is enough
    setAddingNote(true);
    try {
      const res = await fetch(`/api/candidate/${candidateId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          noteText: newNote.trim(),
          noteType,
          stage: status || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Failed to add note');
      }

      // Note types like Submitted / Interview / Offer Out also move the pipeline
      if (data.stageUpdated && data.status) {
        setStatus(data.status);
        toast.success(
          `Note logged · stage set to ${data.stageLabel || stageDisplayLabel(data.status)}`
        );
      } else if (noteTypeDrivesStage(noteType) && data.status) {
        setStatus(data.status);
        toast.success('Note logged (pipeline already at this stage)');
      } else if (noteTypeDrivesStage(noteType) && !data.status) {
        // Server couldn't confirm stage write — still try local UI if type maps
        toast.success('Note logged');
        toast.message(
          'Stage may not have updated — use Advance if the pipeline looks wrong'
        );
      } else {
        toast.success('Note logged');
      }
      setNewNote('');
      await fetchNotes();
      router.refresh();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to log note');
    } finally {
      setAddingNote(false);
    }
  };

  /** Synthetic rows (e.g. profile notes) have no Dynamo event to mutate */
  const isMutableActivity = (note: any): boolean => {
    const id = note?.id || note?.timestamp;
    if (!id || id === 'profile-notes') return false;
    if (note?.metadata?.fromProfileNotes) return false;
    return true;
  };

  const startEditActivity = (note: any) => {
    if (!isMutableActivity(note)) return;
    const id = String(note.id || note.timestamp);
    setEditingEventId(id);
    setEditNoteText(getNoteBody(note) === '—' ? '' : getNoteBody(note));
    const meta = note?.metadata || {};
    setEditNoteType(
      meta.noteType ||
        NOTE_TYPES.find((t) => t.label === getNoteTypeLabel(note))?.value ||
        'Conversation'
    );
  };

  const cancelEditActivity = () => {
    setEditingEventId(null);
    setEditNoteText('');
    setEditNoteType('Conversation');
  };

  const handleSaveEditActivity = async () => {
    if (!candidateId || !editingEventId) return;
    if (!editNoteText.trim()) {
      toast.error('Note text is required');
      return;
    }
    setSavingEdit(true);
    try {
      const res = await fetch(`/api/candidate/${candidateId}/events`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId: editingEventId,
          noteText: editNoteText.trim(),
          noteType: editNoteType,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update note');
      }
      if (data.stageUpdated && data.status) {
        setStatus(data.status);
        toast.success(
          `Note updated · stage set to ${data.stageLabel || stageDisplayLabel(data.status)}`
        );
      } else {
        toast.success('Note updated');
      }
      cancelEditActivity();
      await fetchNotes();
      router.refresh();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update note');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDeleteActivity = async (note: any) => {
    if (!candidateId || !isMutableActivity(note)) return;
    const id = String(note.id || note.timestamp);
    const label = getNoteTypeLabel(note);
    if (!confirm(`Delete this ${label} entry from the activity log?`)) return;

    setDeletingEventId(id);
    try {
      const res = await fetch(
        `/api/candidate/${candidateId}/events?eventId=${encodeURIComponent(id)}`,
        { method: 'DELETE' }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Failed to delete note');
      }
      if (editingEventId === id) cancelEditActivity();
      toast.success('Activity deleted');
      // Optimistic remove; then refresh
      setNotes((prev) =>
        prev.filter((n) => String(n.id || n.timestamp) !== id)
      );
      await fetchNotes();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to delete note');
    } finally {
      setDeletingEventId(null);
    }
  };

  /** Persist pipeline stage (status + linked job stages) and log activity */
  const setPipelineStage = async (
    nextStatus: string,
    options?: { noteText?: string; silent?: boolean }
  ) => {
    if (!candidateId || !nextStatus) return;
    const previous = status;
    setUpdatingStage(true);
    // Optimistic UI so chips / list feel instant
    setStatus(nextStatus);
    try {
      const res = await fetch(`/api/candidate/${candidateId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus(previous);
        throw new Error(data.error || 'Failed to update stage');
      }
      if (data.status) setStatus(data.status);
      // Keep local linkedJobs stage in sync for header / primary job
      setLinkedJobs((prev) =>
        prev.map((j) => ({ ...j, stage: data.status || nextStatus }))
      );

      const label = stageDisplayLabel(data.status || nextStatus);
      if (!options?.silent) {
        toast.success(
          nextStatus === 'rejected'
            ? 'Candidate rejected'
            : `Stage updated to ${label}`
        );
      }

      const stageNoteType =
        noteTypeFromStage(nextStatus) ||
        (nextStatus === 'rejected' ? 'Rejected' : 'Conversation');
      await fetch(`/api/candidate/${candidateId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          noteText: options?.noteText || `Moved to ${label}`,
          noteType: stageNoteType,
          stage: nextStatus,
        }),
      }).catch(() => {});
      await fetchNotes();
      router.refresh();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update stage');
    } finally {
      setUpdatingStage(false);
    }
  };

  const updateStage = async (direction: 'back' | 'advance' | 'reject') => {
    if (!candidateId) return;
    let nextStatus = status;
    if (direction === 'reject') {
      nextStatus = 'rejected';
    } else if (direction === 'advance') {
      const idx = Math.min(currentStep + 1, PIPELINE_STEPS.length - 1);
      nextStatus = stageToApiStatus(PIPELINE_STEPS[Math.max(idx, 0)].key);
    } else {
      const idx = Math.max(currentStep - 1, 0);
      nextStatus = stageToApiStatus(PIPELINE_STEPS[idx].key);
    }
    await setPipelineStage(nextStatus);
  };

  /** Click a pipeline chip to jump directly to that stage */
  const jumpToStep = async (stepIndex: number) => {
    if (updatingStage || stepIndex < 0 || stepIndex >= PIPELINE_STEPS.length) {
      return;
    }
    if (stepIndex === currentStep) return;
    const nextStatus = stageToApiStatus(PIPELINE_STEPS[stepIndex].key);
    await setPipelineStage(nextStatus, {
      noteText: `Moved to ${PIPELINE_STEPS[stepIndex].label}`,
    });
  };

  const handleUnlinkJob = async (job: any) => {
    const jobId = job.jobId || job.id;
    const title = job.jobTitle || job.title || 'this job';
    if (!candidateId || !jobId) return;
    if (!confirm(`Unlink candidate from "${title}"?`)) return;

    setUnlinkingJobId(jobId);
    try {
      const res = await fetch(
        `/api/data/leads/${candidateId}/job/${jobId}/unlink`,
        { method: 'POST', credentials: 'include' }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Failed to unlink job');
      }
      setLinkedJobs((prev) =>
        prev.filter((j) => (j.jobId || j.id) !== jobId)
      );
      toast.success(`Unlinked from ${title}`);
      void fetchNotes();
      router.refresh();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to unlink job');
    } finally {
      setUnlinkingJobId(null);
    }
  };

  const handleDelete = async () => {
    if (!candidateId) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/candidate/${candidateId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        toast.success('Candidate deleted');
        router.push('/dashboard/candidates');
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || 'Failed to delete');
      }
    } catch {
      toast.error('Failed to delete');
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const handleSaveContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!candidateId) return;
    setIsSavingContact(true);
    try {
      const res = await fetch(`/api/candidate/${candidateId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: editForm.email.trim(),
          phone: editForm.phone.trim(),
          location: editForm.location.trim(),
          title: editForm.title.trim(),
          name: editForm.name.trim(),
          full_address: editForm.fullAddress.trim(),
          salary_requirements: editForm.salaryRequirements.trim(),
          linkedin_url: editForm.linkedin.trim(),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to update');
      }
      setContactInfo({ ...editForm });
      setShowEditModal(false);
      toast.success('Contact information updated');
      await fetch(`/api/candidate/${candidateId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          noteText: `Contact info updated (${editForm.name || 'candidate'})`,
          noteType: 'profile_updated',
        }),
      }).catch(() => {});
      await fetchNotes();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update');
    } finally {
      setIsSavingContact(false);
    }
  };

  /** Map UI contact field → API body key */
  const headerFieldApiKey = (field: HeaderFieldKey): string => {
    switch (field) {
      case 'linkedin':
        return 'linkedin_url';
      case 'salaryRequirements':
        return 'salary_requirements';
      default:
        return field;
    }
  };

  const headerFieldLabel = (field: HeaderFieldKey): string => {
    const labels: Record<HeaderFieldKey, string> = {
      name: 'Name',
      title: 'Title',
      company: 'Company',
      email: 'Email',
      phone: 'Phone',
      location: 'Location',
      linkedin: 'LinkedIn',
      salaryRequirements: 'Salary',
    };
    return labels[field];
  };

  const openFieldEditor = (field: HeaderFieldKey) => {
    setFieldDraft(contactInfo[field] || '');
    setEditingField(field);
  };

  const cancelFieldEditor = () => {
    setEditingField(null);
    setFieldDraft('');
  };

  /** Normalize pasted LinkedIn value to a full URL when possible. */
  const normalizeLinkedInUrl = (raw: string): string => {
    const s = raw.trim();
    if (!s) return '';
    if (/^https?:\/\//i.test(s)) return s;
    if (/^(www\.)?linkedin\.com\//i.test(s)) {
      return `https://${s.replace(/^www\./i, 'www.')}`;
    }
    if (/^[\w-]+$/.test(s)) {
      return `https://www.linkedin.com/in/${s}`;
    }
    return s;
  };

  const handleSaveHeaderField = async (field: HeaderFieldKey) => {
    if (!candidateId) return;
    let value = fieldDraft.trim();
    if (field === 'linkedin') {
      value = normalizeLinkedInUrl(value);
    }
    if (field === 'name' && !value) {
      toast.error('Name cannot be empty');
      return;
    }
    setSavingField(true);
    try {
      const body: Record<string, string> = {
        [headerFieldApiKey(field)]: value,
      };
      const res = await fetch(`/api/candidate/${candidateId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Failed to save ${headerFieldLabel(field)}`);
      }
      setContactInfo((prev) => ({ ...prev, [field]: value }));
      setEditForm((prev) => ({ ...prev, [field]: value }));
      setEditingField(null);
      setFieldDraft('');
      toast.success(
        value
          ? `${headerFieldLabel(field)} saved`
          : `${headerFieldLabel(field)} cleared`
      );
      await fetch(`/api/candidate/${candidateId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          noteText: value
            ? `${headerFieldLabel(field)} updated: ${value}`
            : `${headerFieldLabel(field)} cleared`,
          noteType: 'profile_updated',
        }),
      }).catch(() => {});
      await fetchNotes();
    } catch (err: any) {
      toast.error(err?.message || `Failed to save ${headerFieldLabel(field)}`);
    } finally {
      setSavingField(false);
    }
  };

  const renderInlineFieldEditor = (
    field: HeaderFieldKey,
    opts?: {
      icon?: React.ReactNode;
      placeholder?: string;
      inputClassName?: string;
      inputType?: string;
    }
  ) => (
    <form
      className="inline-flex items-center gap-1.5 min-w-0 max-w-full"
      onSubmit={(e) => {
        e.preventDefault();
        void handleSaveHeaderField(field);
      }}
    >
      {opts?.icon}
      <Input
        autoFocus
        type={opts?.inputType || 'text'}
        value={fieldDraft}
        onChange={(e) => setFieldDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            cancelFieldEditor();
          }
        }}
        placeholder={opts?.placeholder || `Add ${headerFieldLabel(field).toLowerCase()}…`}
        disabled={savingField}
        className={
          opts?.inputClassName ||
          'h-7 w-[min(100%,16rem)] sm:w-56 text-xs px-2'
        }
      />
      <Button
        type="submit"
        size="sm"
        variant="ghost"
        disabled={savingField}
        className="h-7 w-7 p-0 text-green-700 hover:text-green-800 hover:bg-green-50"
        title={`Save ${headerFieldLabel(field)}`}
      >
        {savingField ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Check className="h-3.5 w-3.5" />
        )}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={savingField}
        onClick={cancelFieldEditor}
        className="h-7 w-7 p-0 text-gray-500"
        title="Cancel"
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </form>
  );

  const renderFieldEditButton = (field: HeaderFieldKey, title?: string) => (
    <button
      type="button"
      onClick={() => openFieldEditor(field)}
      className="inline-flex h-6 w-6 items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-gray-700"
      title={title || `Edit ${headerFieldLabel(field)}`}
    >
      <Pencil className="h-3 w-3" />
    </button>
  );

  const runAiTool = async (tool: string) => {
    setAiLoading(tool);
    setAiOutput('');
    const prompts: Record<string, string> = {
      rate: `Rate this candidate for recruiting. Give a score 1-10 with brief reasoning.\n\nName: ${contactInfo.name}\nTitle: ${contactInfo.title}\nSummary: ${safe.summary || 'N/A'}\nSkills: ${skills.join(', ') || 'N/A'}\nExperience: ${JSON.stringify(experience).slice(0, 1500)}`,
      match: `Match this candidate against typical job requirements for "${contactInfo.title || 'their role'}". List strengths, gaps, and fit %.\n\nSummary: ${safe.summary || 'N/A'}\nSkills: ${skills.join(', ')}\nExperience: ${JSON.stringify(experience).slice(0, 1500)}`,
      interview: `Generate 8 strong interview questions for a ${contactInfo.title || 'professional'} candidate named ${contactInfo.name}. Include behavioral and technical questions.`,
      summarize: `Write a concise client-facing resume summary (3-5 sentences, professional tone) for ${contactInfo.name}, ${contactInfo.title}.\n\nSummary: ${safe.summary || 'N/A'}\nSkills: ${skills.join(', ')}\nExperience: ${JSON.stringify(experience).slice(0, 1500)}`,
    };
    try {
      const res = await fetch('/api/bedrock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: prompts[tool] || prompts.rate }],
          useTools: false,
          useSearch: false,
        }),
      });
      const data = await res.json();
      if (data.response) {
        setAiOutput(data.response);
      } else {
        throw new Error(data.error || 'AI unavailable');
      }
    } catch (err: any) {
      toast.error(err?.message || 'AI tool failed');
      setAiOutput('');
    } finally {
      setAiLoading(null);
    }
  };

  const tabs = [
    { id: 'overview' as const, label: 'Overview' },
    { id: 'timeline' as const, label: 'Timeline' },
    { id: 'resume' as const, label: 'Resume' },
    { id: 'jobs' as const, label: 'Linked Jobs' },
  ];

  const activityRows = useMemo(() => {
    const rows = [...notes];
    // Surface careers apply / profile notes field once if not already in events
    const profileNotes =
      typeof safe.notes === 'string' ? safe.notes.trim() : '';
    if (profileNotes) {
      const already = rows.some(
        (n) =>
          getNoteBody(n)?.includes(profileNotes.slice(0, 40)) ||
          n?.metadata?.fromProfileNotes
      );
      if (!already) {
        rows.push({
          id: 'profile-notes',
          eventType: 'NOTE',
          createdAt: safe.createdAt || safe.created_at || new Date().toISOString(),
          metadata: {
            noteText: profileNotes,
            noteType: 'Application message',
            noteTypeLabel: 'Application / notes',
            fromProfileNotes: true,
          },
          description: profileNotes,
        });
      }
    }
    // Newest first
    rows.sort((a, b) => {
      const ta = new Date(a.createdAt || a.timestamp || 0).getTime();
      const tb = new Date(b.createdAt || b.timestamp || 0).getTime();
      return tb - ta;
    });
    return rows;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes, safe.notes, safe.createdAt]);

  return (
    <div className="max-w-[1400px] mx-auto space-y-5 pb-10">
      {/* ── Header ───────────────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
          <div className="flex items-start gap-4 min-w-0">
            <div className="h-16 w-16 shrink-0 rounded-full bg-violet-600 text-white flex items-center justify-center text-xl font-semibold shadow-sm">
              {getInitials(contactInfo.name)}
            </div>
            <div className="min-w-0 space-y-1.5">
              {/* Name */}
              {editingField === 'name' ? (
                renderInlineFieldEditor('name', {
                  placeholder: 'Full name…',
                  inputClassName: 'h-8 w-[min(100%,20rem)] sm:w-72 text-base px-2 font-semibold',
                })
              ) : (
                <div className="flex items-center gap-1 min-w-0">
                  <h1 className="text-2xl font-semibold tracking-tight text-gray-900 truncate">
                    {contactInfo.name || 'Unknown'}
                  </h1>
                  {renderFieldEditButton('name')}
                </div>
              )}

              {/* Title + company */}
              <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600">
                {editingField === 'title' ? (
                  renderInlineFieldEditor('title', {
                    placeholder: 'Current title…',
                    inputClassName: 'h-7 w-[min(100%,14rem)] sm:w-52 text-xs px-2',
                  })
                ) : (
                  <span className="inline-flex items-center gap-1">
                    <span className="font-medium text-gray-800">
                      {contactInfo.title || (
                        <button
                          type="button"
                          onClick={() => openFieldEditor('title')}
                          className="text-gray-400 hover:text-gray-700 hover:underline font-normal"
                        >
                          Add title
                        </button>
                      )}
                    </span>
                    {contactInfo.title ? renderFieldEditButton('title') : null}
                  </span>
                )}
                {editingField === 'company' ? (
                  renderInlineFieldEditor('company', {
                    placeholder: 'Company…',
                    inputClassName: 'h-7 w-[min(100%,12rem)] sm:w-44 text-xs px-2',
                  })
                ) : contactInfo.company ? (
                  <span className="inline-flex items-center gap-0.5">
                    <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-700">
                      {contactInfo.company}
                    </span>
                    {renderFieldEditButton('company')}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => openFieldEditor('company')}
                    className="text-xs text-gray-400 hover:text-gray-700 hover:underline"
                  >
                    Add company
                  </button>
                )}
              </div>

              {/* Contact row: email, phone, location, LinkedIn, salary */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-600">
                {/* Email */}
                {editingField === 'email' ? (
                  renderInlineFieldEditor('email', {
                    icon: <Mail className="h-3.5 w-3.5 text-blue-600 shrink-0" />,
                    placeholder: 'email@example.com',
                    inputType: 'email',
                    inputClassName: 'h-7 w-[min(100%,16rem)] sm:w-56 text-xs px-2',
                  })
                ) : contactInfo.email ? (
                  <span className="inline-flex items-center gap-1">
                    <a
                      href={`mailto:${contactInfo.email}`}
                      className="inline-flex items-center gap-1.5 text-blue-600 hover:underline"
                    >
                      <Mail className="h-3.5 w-3.5" />
                      {contactInfo.email}
                    </a>
                    {renderFieldEditButton('email')}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => openFieldEditor('email')}
                    className="inline-flex items-center gap-1.5 text-gray-400 hover:text-blue-600 hover:underline"
                  >
                    <Mail className="h-3.5 w-3.5" />
                    Add email
                  </button>
                )}

                {/* Phone */}
                {editingField === 'phone' ? (
                  renderInlineFieldEditor('phone', {
                    icon: <Phone className="h-3.5 w-3.5 text-gray-400 shrink-0" />,
                    placeholder: 'Phone number…',
                    inputType: 'tel',
                    inputClassName: 'h-7 w-[min(100%,12rem)] sm:w-40 text-xs px-2',
                  })
                ) : contactInfo.phone ? (
                  <span className="inline-flex items-center gap-1">
                    <a
                      href={`tel:${contactInfo.phone}`}
                      className="inline-flex items-center gap-1.5"
                    >
                      <Phone className="h-3.5 w-3.5 text-gray-400" />
                      {contactInfo.phone}
                    </a>
                    {renderFieldEditButton('phone')}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => openFieldEditor('phone')}
                    className="inline-flex items-center gap-1.5 text-gray-400 hover:text-gray-700 hover:underline"
                  >
                    <Phone className="h-3.5 w-3.5" />
                    Add phone
                  </button>
                )}

                {/* Location */}
                {editingField === 'location' ? (
                  renderInlineFieldEditor('location', {
                    icon: <MapPin className="h-3.5 w-3.5 text-gray-400 shrink-0" />,
                    placeholder: 'City, State…',
                    inputClassName: 'h-7 w-[min(100%,12rem)] sm:w-44 text-xs px-2',
                  })
                ) : contactInfo.location ? (
                  <span className="inline-flex items-center gap-1">
                    <span className="inline-flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5 text-gray-400" />
                      {contactInfo.location}
                    </span>
                    {renderFieldEditButton('location')}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => openFieldEditor('location')}
                    className="inline-flex items-center gap-1.5 text-gray-400 hover:text-gray-700 hover:underline"
                  >
                    <MapPin className="h-3.5 w-3.5" />
                    Add location
                  </button>
                )}

                {/* LinkedIn */}
                {editingField === 'linkedin' ? (
                  renderInlineFieldEditor('linkedin', {
                    icon: (
                      <Linkedin className="h-3.5 w-3.5 text-[#0A66C2] shrink-0" />
                    ),
                    placeholder: 'Paste LinkedIn URL…',
                    inputClassName:
                      'h-7 w-[min(100%,18rem)] sm:w-72 text-xs px-2',
                  })
                ) : contactInfo.linkedin ? (
                  <span className="inline-flex items-center gap-1">
                    <a
                      href={
                        /^https?:\/\//i.test(contactInfo.linkedin)
                          ? contactInfo.linkedin
                          : `https://${contactInfo.linkedin}`
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-[#0A66C2] hover:underline"
                      title={contactInfo.linkedin}
                    >
                      <Linkedin className="h-3.5 w-3.5" />
                      LinkedIn
                      <ExternalLink className="h-3 w-3 opacity-60" />
                    </a>
                    {renderFieldEditButton('linkedin', 'Edit LinkedIn URL')}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => openFieldEditor('linkedin')}
                    className="inline-flex items-center gap-1.5 text-gray-400 hover:text-[#0A66C2] hover:underline"
                    title="Add LinkedIn profile URL"
                  >
                    <Linkedin className="h-3.5 w-3.5" />
                    Add LinkedIn
                  </button>
                )}

                {/* Salary */}
                {editingField === 'salaryRequirements' ? (
                  renderInlineFieldEditor('salaryRequirements', {
                    icon: (
                      <DollarSign className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                    ),
                    placeholder: 'e.g. $90k–$110k',
                    inputClassName: 'h-7 w-[min(100%,10rem)] sm:w-36 text-xs px-2',
                  })
                ) : contactInfo.salaryRequirements?.trim() ? (
                  <span className="inline-flex items-center gap-1">
                    <span
                      className="inline-flex items-center gap-1.5"
                      title="Salary target / range"
                    >
                      <DollarSign className="h-3.5 w-3.5 text-gray-400" />
                      {contactInfo.salaryRequirements}
                    </span>
                    {renderFieldEditButton('salaryRequirements')}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => openFieldEditor('salaryRequirements')}
                    className="inline-flex items-center gap-1.5 text-gray-400 hover:text-gray-700 hover:underline"
                    title="Add salary target / range"
                  >
                    <DollarSign className="h-3.5 w-3.5" />
                    Add salary
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {primaryJob && (
                  <span className="inline-flex items-center rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-0.5 text-[11px] font-medium text-indigo-800">
                    {primaryJob.jobTitle || 'Linked job'}
                  </span>
                )}
                <span className="inline-flex items-center rounded-full border border-violet-200 bg-violet-50 px-2.5 py-0.5 text-[11px] font-medium text-violet-800">
                  {currentStepLabel}
                </span>
                <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-2.5 py-0.5 text-[11px] font-medium text-gray-600">
                  Added {formatShortDate(safe.createdAt)} · {safe.source || 'Manual'}
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLinkJobOpen(true)}
            >
              <Link2 className="h-3.5 w-3.5 mr-1.5" />
              Link to job
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setMergeOpen(true)}
              title="Merge with a duplicate candidate"
              className="border-blue-200 text-blue-700 hover:bg-blue-50"
            >
              <Combine className="h-3.5 w-3.5 mr-1.5" />
              Merge
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setEditForm({ ...contactInfo });
                setShowEditModal(true);
              }}
            >
              <Pencil className="h-3.5 w-3.5 mr-1.5" />
              Edit
            </Button>
            <Button
              size="sm"
              className="bg-blue-600 hover:bg-blue-700"
              onClick={() => setEmailOpen(true)}
              disabled={!contactInfo.email}
            >
              <Mail className="h-3.5 w-3.5 mr-1.5" />
              Send Email
            </Button>
            {showDeleteConfirm ? (
              <>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleDelete}
                  disabled={isDeleting}
                >
                  {isDeleting ? 'Deleting…' : 'Confirm'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowDeleteConfirm(false)}
                >
                  Cancel
                </Button>
              </>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="text-red-600"
                onClick={() => setShowDeleteConfirm(true)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="mt-5 border-b border-gray-100">
          <nav className="flex gap-1 overflow-x-auto">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveTab(t.id)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                  activeTab === t.id
                    ? 'border-blue-600 text-blue-700'
                    : 'border-transparent text-gray-500 hover:text-gray-800'
                }`}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* ── Overview ─────────────────────────────────────────────── */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
          {/* Left column */}
          <div className="xl:col-span-7 space-y-5">
            {typeof safe.notes === 'string' && safe.notes.trim() && (
              <section className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4 shadow-sm">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-amber-900/80">
                  Application message / notes
                </h3>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-amber-950">
                  {safe.notes}
                </p>
              </section>
            )}

            {/* Pipeline stage */}
            <section className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 mb-1">
                Pipeline Stage
                {primaryJob?.jobTitle
                  ? ` — ${String(primaryJob.jobTitle).toUpperCase()}`
                  : ''}
              </h2>
              <div className="mt-4">
                <div className="flex flex-wrap items-center gap-1 mb-2">
                  {PIPELINE_STEPS.map((step, i) => {
                    const active = i === currentStep;
                    const done = currentStep >= 0 && i < currentStep;
                    return (
                      <React.Fragment key={step.key}>
                        <button
                          type="button"
                          disabled={updatingStage}
                          title={`Set stage to ${step.label}`}
                          onClick={() => void jumpToStep(i)}
                          className={`min-w-[4.5rem] flex-1 text-center rounded-lg border px-1.5 py-2 text-[11px] sm:text-xs font-semibold transition-colors disabled:opacity-60 ${
                            active
                              ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                              : done
                                ? 'bg-blue-50 text-blue-800 border-blue-200 hover:bg-blue-100'
                                : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100 hover:text-gray-700'
                          }`}
                        >
                          {step.label}
                        </button>
                        {i < PIPELINE_STEPS.length - 1 && (
                          <ChevronRight className="h-4 w-4 text-gray-300 shrink-0 hidden sm:block" />
                        )}
                      </React.Fragment>
                    );
                  })}
                </div>
                <p className="text-[11px] text-gray-400 mb-1">
                  Click a stage to jump there, or use Advance / Move Back
                </p>
                {currentStep < 0 && (
                  <p className="text-sm text-rose-600 font-medium mb-3">
                    Status: Rejected
                  </p>
                )}
                <div className="flex flex-wrap gap-2 mt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={updatingStage || currentStep <= 0}
                    onClick={() => updateStage('back')}
                  >
                    Move Back
                  </Button>
                  <Button
                    size="sm"
                    className="bg-blue-600 hover:bg-blue-700"
                    disabled={
                      updatingStage ||
                      currentStep < 0 ||
                      currentStep >= PIPELINE_STEPS.length - 1
                    }
                    onClick={() => updateStage('advance')}
                  >
                    {updatingStage ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : currentStep >= 0 &&
                      currentStep < PIPELINE_STEPS.length - 1 ? (
                      `Advance to ${PIPELINE_STEPS[currentStep + 1].label}`
                    ) : (
                      'Advance'
                    )}
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={updatingStage || currentStep < 0}
                    onClick={() => updateStage('reject')}
                  >
                    Reject
                  </Button>
                </div>
              </div>
            </section>

            {/* Notes & activity log */}
            <section className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5">
              <div className="mb-4">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
                  Notes & Activity Log
                </h2>
                <p className="text-xs text-gray-400 mt-1">
                  Stage types (Applied, Interested, Submitted, …) update the
                  pipeline automatically — no separate stage change needed
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-2 mb-5">
                <select
                  value={noteType}
                  onChange={(e) => setNoteType(e.target.value)}
                  className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm shadow-sm sm:w-48"
                >
                  {NOTE_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                      {'drivesStage' in t && t.drivesStage ? ' · stage' : ''}
                    </option>
                  ))}
                </select>
                <Input
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder="Optional note detail..."
                  className="flex-1 bg-white"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleAddNote();
                    }
                  }}
                />
                <Button
                  onClick={handleAddNote}
                  disabled={addingNote}
                  className="bg-blue-600 hover:bg-blue-700 shrink-0"
                >
                  {addingNote ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    'Log'
                  )}
                </Button>
              </div>

              {notesLoading ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                </div>
              ) : activityRows.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-8">
                  No activity yet. Log the first note above.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-gray-100">
                  <table className="w-full text-sm min-w-[560px]">
                    <thead>
                      <tr className="bg-gray-50/80 border-b border-gray-100 text-left">
                        <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 w-36">
                          Date
                        </th>
                        <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 w-40">
                          Action Type
                        </th>
                        <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                          Note
                        </th>
                        <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 w-24 text-right">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {activityRows.map((note: any, index: number) => {
                        const label = getNoteTypeLabel(note);
                        const rowId = String(note.id || note.timestamp || index);
                        const mutable = isMutableActivity(note);
                        const isEditing = editingEventId === rowId;
                        const isDeleting = deletingEventId === rowId;

                        return (
                          <tr
                            key={note.id || note.SK || index}
                            className="hover:bg-gray-50/60 group"
                          >
                            <td className="px-3 py-3 text-xs text-gray-500 whitespace-nowrap align-top">
                              {formatDateTime(
                                note.createdAt || note.timestamp || note.created_at
                              )}
                            </td>
                            <td className="px-3 py-3 align-top">
                              {isEditing ? (
                                <select
                                  value={editNoteType}
                                  onChange={(e) => setEditNoteType(e.target.value)}
                                  className="h-8 w-full max-w-[11rem] rounded-md border border-gray-200 bg-white px-2 text-xs"
                                  disabled={savingEdit}
                                >
                                  {NOTE_TYPES.map((t) => (
                                    <option key={t.value} value={t.value}>
                                      {t.label}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <span
                                  className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${noteTypeBadgeClass(label)}`}
                                >
                                  {label}
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-3 text-sm text-gray-800 align-top">
                              {isEditing ? (
                                <div className="flex flex-col gap-2">
                                  <Input
                                    value={editNoteText}
                                    onChange={(e) => setEditNoteText(e.target.value)}
                                    className="bg-white text-sm h-9"
                                    disabled={savingEdit}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        void handleSaveEditActivity();
                                      }
                                      if (e.key === 'Escape') cancelEditActivity();
                                    }}
                                    autoFocus
                                  />
                                  <div className="flex gap-2">
                                    <Button
                                      size="sm"
                                      className="h-7 text-xs bg-blue-600 hover:bg-blue-700"
                                      onClick={() => void handleSaveEditActivity()}
                                      disabled={savingEdit || !editNoteText.trim()}
                                    >
                                      {savingEdit ? (
                                        <Loader2 className="h-3 w-3 animate-spin" />
                                      ) : (
                                        'Save'
                                      )}
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-7 text-xs"
                                      onClick={cancelEditActivity}
                                      disabled={savingEdit}
                                    >
                                      Cancel
                                    </Button>
                                  </div>
                                </div>
                              ) : (
                                <ExpandableNoteText text={getNoteBody(note)} />
                              )}
                            </td>
                            <td className="px-3 py-3 align-top text-right">
                              {mutable && !isEditing && (
                                <div className="inline-flex items-center gap-0.5 opacity-70 group-hover:opacity-100">
                                  <button
                                    type="button"
                                    title="Edit"
                                    onClick={() => startEditActivity(note)}
                                    disabled={!!deletingEventId || savingEdit}
                                    className="p-1.5 rounded-md text-blue-600 hover:bg-blue-50 disabled:opacity-40"
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    title="Delete"
                                    onClick={() => void handleDeleteActivity(note)}
                                    disabled={isDeleting || savingEdit}
                                    className="p-1.5 rounded-md text-red-600 hover:bg-red-50 disabled:opacity-40"
                                  >
                                    {isDeleting ? (
                                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                      <Trash2 className="h-3.5 w-3.5" />
                                    )}
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>

          {/* Right column — live resume preview, then AI tools lower */}
          <div className="xl:col-span-5 space-y-5 xl:sticky xl:top-4 xl:self-start">
            <section className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-gray-100 bg-gray-50/50">
                <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Resume
                </span>
                <div className="flex flex-wrap gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => setActiveTab('resume')}
                  >
                    Full screen / manage
                  </Button>
                </div>
              </div>
              <div className="h-[min(70vh,720px)] min-h-[420px]">
                <ResumeViewer
                  url={resumeUrl}
                  fileName={resumeFileName || safe.resumeFileName}
                  candidateId={candidateId}
                  fileKey={resumeKey || safe.resumeKey}
                  className="h-full"
                  onUrlUpdated={(u) => setResumeUrl(u)}
                  onResumeChanged={(info) => {
                    if (!info) {
                      setResumeUrl('');
                      setResumeFileName('');
                      setResumeKey('');
                      return;
                    }
                    setResumeUrl(info.resumeUrl || '');
                    setResumeFileName(info.fileName || '');
                    setResumeKey(info.fileKey || info.resumeUrl || '');
                    void fetchNotes();
                  }}
                />
              </div>
            </section>

            {/* Parsed profile summary (compact) under the file viewer */}
            {(safe.summary ||
              experience.length > 0 ||
              education.length > 0 ||
              skills.length > 0) && (
              <section className="bg-white border border-gray-200 rounded-2xl shadow-sm p-4 space-y-3">
                <h3 className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                  Parsed profile
                </h3>
                {safe.summary && (
                  <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap line-clamp-6">
                    {safe.summary}
                  </p>
                )}
                {skills.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {skills.slice(0, 12).map((s) => (
                      <span
                        key={s}
                        className="inline-flex rounded-full border border-blue-100 bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-800"
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                )}
              </section>
            )}

            {/* AI evaluation tools — below resume */}
            <section className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5">
              <h2 className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-3 flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-violet-500" />
                AI Evaluation Tools
              </h2>
              <div className="space-y-2">
                {[
                  { id: 'rate', label: 'Rate This Candidate' },
                  { id: 'match', label: 'Match Against Job Requirements' },
                  { id: 'interview', label: 'Generate Interview Questions' },
                  { id: 'summarize', label: 'Summarize Resume for Client' },
                ].map((tool) => (
                  <Button
                    key={tool.id}
                    variant="outline"
                    className="w-full justify-between h-11 border-blue-200 text-blue-800 hover:bg-blue-50"
                    disabled={!!aiLoading}
                    onClick={() => runAiTool(tool.id)}
                  >
                    <span>{tool.label}</span>
                    {aiLoading === tool.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <ChevronRight className="h-4 w-4 opacity-50" />
                    )}
                  </Button>
                ))}
              </div>
              {aiOutput && (
                <div className="mt-4 rounded-xl border border-violet-100 bg-violet-50/50 p-4 text-sm text-gray-800 whitespace-pre-wrap max-h-80 overflow-y-auto">
                  {aiOutput}
                </div>
              )}
            </section>
          </div>
        </div>
      )}

      {/* ── Timeline tab ─────────────────────────────────────────── */}
      {activeTab === 'timeline' && (
        <section className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5">
          <h2 className="text-base font-semibold text-gray-900 mb-4">
            Full Timeline
          </h2>
          {notesLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : activityRows.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-10">
              No timeline events yet.
            </p>
          ) : (
            <div className="space-y-3">
              {activityRows.map((note: any, index: number) => {
                const label = getNoteTypeLabel(note);
                const rowId = String(note.id || note.timestamp || index);
                const mutable = isMutableActivity(note);
                const isEditing = editingEventId === rowId;
                const isDeleting = deletingEventId === rowId;

                return (
                  <div
                    key={note.id || note.SK || index}
                    className="flex gap-4 rounded-xl border border-gray-100 p-4 group"
                  >
                    <div className="w-36 shrink-0 text-xs text-gray-500">
                      {formatDateTime(
                        note.createdAt || note.timestamp || note.created_at
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      {isEditing ? (
                        <div className="space-y-2">
                          <select
                            value={editNoteType}
                            onChange={(e) => setEditNoteType(e.target.value)}
                            className="h-9 rounded-md border border-gray-200 bg-white px-2 text-sm"
                            disabled={savingEdit}
                          >
                            {NOTE_TYPES.map((t) => (
                              <option key={t.value} value={t.value}>
                                {t.label}
                              </option>
                            ))}
                          </select>
                          <Textarea
                            value={editNoteText}
                            onChange={(e) => setEditNoteText(e.target.value)}
                            className="min-h-[72px] bg-white text-sm"
                            disabled={savingEdit}
                          />
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              className="h-8 text-xs bg-blue-600 hover:bg-blue-700"
                              onClick={() => void handleSaveEditActivity()}
                              disabled={savingEdit || !editNoteText.trim()}
                            >
                              {savingEdit ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                'Save'
                              )}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 text-xs"
                              onClick={cancelEditActivity}
                              disabled={savingEdit}
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <span
                            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium mb-2 ${noteTypeBadgeClass(label)}`}
                          >
                            {label}
                          </span>
                          <ExpandableNoteText text={getNoteBody(note)} />
                        </>
                      )}
                    </div>
                    {mutable && !isEditing && (
                      <div className="shrink-0 flex flex-col gap-1 opacity-70 group-hover:opacity-100">
                        <button
                          type="button"
                          title="Edit"
                          onClick={() => startEditActivity(note)}
                          disabled={!!deletingEventId || savingEdit}
                          className="p-1.5 rounded-md text-blue-600 hover:bg-blue-50 disabled:opacity-40"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          title="Delete"
                          onClick={() => void handleDeleteActivity(note)}
                          disabled={isDeleting || savingEdit}
                          className="p-1.5 rounded-md text-red-600 hover:bg-red-50 disabled:opacity-40"
                        >
                          {isDeleting ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* ── Resume tab ───────────────────────────────────────────── */}
      {activeTab === 'resume' && (
        <section className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden flex flex-col h-[calc(100vh-10rem)] min-h-[520px]">
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 gap-2 flex-wrap shrink-0">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Resume</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                Full-page view — replace or remove from the toolbar below
              </p>
            </div>
          </div>
          <div className="flex-1 min-h-0">
            <ResumeViewer
              url={resumeUrl}
              fileName={resumeFileName || safe.resumeFileName}
              candidateId={candidateId}
              fileKey={resumeKey || safe.resumeKey}
              className="h-full"
              onUrlUpdated={(u) => setResumeUrl(u)}
              onResumeChanged={(info) => {
                if (!info) {
                  setResumeUrl('');
                  setResumeFileName('');
                  setResumeKey('');
                  return;
                }
                setResumeUrl(info.resumeUrl || '');
                setResumeFileName(info.fileName || '');
                setResumeKey(info.fileKey || info.resumeUrl || '');
                void fetchNotes();
              }}
            />
          </div>
        </section>
      )}

      {/* ── Linked jobs tab ──────────────────────────────────────── */}
      {activeTab === 'jobs' && (
        <section className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5">
          <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
            <h2 className="text-base font-semibold text-gray-900">Linked Jobs</h2>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => setLinkJobOpen(true)}>
                <Link2 className="h-4 w-4 mr-1.5" />
                Link to job
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => router.push('/dashboard/jobs')}
              >
                <Briefcase className="h-4 w-4 mr-1.5" /> Browse jobs
              </Button>
            </div>
          </div>
          {linkedJobs.length === 0 ? (
            <div className="text-center py-12 space-y-3">
              <p className="text-sm text-gray-500">
                No jobs linked yet. Link this candidate to an open role.
              </p>
              <Button size="sm" onClick={() => setLinkJobOpen(true)}>
                <Link2 className="h-4 w-4 mr-1.5" />
                Link to job
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {linkedJobs.map((job: any) => {
                const jobId = job.jobId || job.id;
                const isUnlinking = unlinkingJobId === jobId;
                return (
                  <div
                    key={jobId}
                    className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 px-4 py-3 hover:bg-gray-50"
                  >
                    <Link
                      href={`/dashboard/jobs/${jobId}`}
                      className="min-w-0 flex-1"
                    >
                      <div className="font-medium text-gray-900">
                        {job.jobTitle || job.title || 'Job'}
                      </div>
                      <div className="text-xs text-gray-500">
                        {job.companyName || '—'}
                        {job.stage ? ` · ${job.stage}` : ''}
                      </div>
                    </Link>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        disabled={isUnlinking || !!unlinkingJobId}
                        onClick={() => handleUnlinkJob(job)}
                      >
                        {isUnlinking ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                        ) : (
                          <Unlink className="h-3.5 w-3.5 mr-1.5" />
                        )}
                        Unlink
                      </Button>
                      <Link
                        href={`/dashboard/jobs/${jobId}`}
                        className="p-2 text-gray-400 hover:text-gray-600"
                        title="Open job"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      <LinkJobModal
        open={linkJobOpen}
        onOpenChange={setLinkJobOpen}
        candidateId={candidateId}
        candidateName={contactInfo.name || 'Candidate'}
        currentLinkedJobs={linkedJobs.map((j: any) => ({
          jobId: j.jobId || j.id,
          jobTitle: j.jobTitle || j.title,
          companyId: j.companyId,
          companyName: j.companyName,
          stage: j.stage,
        }))}
        onLinked={(next) => {
          setLinkedJobs(next);
          void fetchNotes();
          router.refresh();
        }}
      />

      <MergeCandidatesModal
        open={mergeOpen}
        onClose={() => setMergeOpen(false)}
        currentCandidate={{
          id: candidateId,
          name: contactInfo.name || 'Candidate',
          email: contactInfo.email,
          createdAt: safe.createdAt || safe.created_at,
        }}
      />

      {/* Edit contact modal */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full max-h-[90vh] overflow-auto shadow-xl">
            <div className="p-6">
              <h2 className="text-xl font-semibold mb-1">
                Edit Contact Information
              </h2>
              <p className="text-sm text-muted-foreground mb-4">
                Update the candidate&apos;s details.
              </p>
              <form onSubmit={handleSaveContact} className="space-y-3">
                {(
                  [
                    ['name', 'Full Name'],
                    ['email', 'Email'],
                    ['phone', 'Phone'],
                    ['title', 'Title'],
                    ['company', 'Company'],
                    ['location', 'Location'],
                    ['fullAddress', 'Address'],
                    ['salaryRequirements', 'Salary Target'],
                    ['linkedin', 'LinkedIn URL'],
                  ] as const
                ).map(([key, label]) => (
                  <div key={key}>
                    <label className="text-sm font-medium block mb-1">
                      {label}
                    </label>
                    <Input
                      value={(editForm as any)[key] || ''}
                      onChange={(e) =>
                        setEditForm({ ...editForm, [key]: e.target.value })
                      }
                    />
                  </div>
                ))}
                <div className="flex gap-3 pt-3">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={() => setShowEditModal(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={isSavingContact}
                    className="flex-1 bg-blue-600 hover:bg-blue-700"
                  >
                    {isSavingContact ? 'Saving…' : 'Save Changes'}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      <SendEmailModal
        open={emailOpen}
        onOpenChange={setEmailOpen}
        candidate={
          contactInfo.email
            ? { email: contactInfo.email, name: contactInfo.name }
            : null
        }
        onSend={async (subject, body) => {
          const res = await fetch('/api/email/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              to: contactInfo.email,
              subject,
              text: body,
              html: body.replace(/\n/g, '<br/>'),
            }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok || data.success === false) {
            throw new Error(data.error || 'Failed to send email');
          }
          await fetch(`/api/candidate/${candidateId}/notes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              noteText: `Email sent: ${subject}`,
              noteType: 'Email Sent',
            }),
          }).catch(() => {});
          await fetchNotes();
        }}
      />
    </div>
  );
}
