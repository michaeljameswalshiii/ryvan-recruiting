'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ListOrdered,
  Plus,
  RefreshCw,
  Loader2,
  Mail,
  CheckSquare,
  Linkedin,
  Eye,
  Users,
  Play,
  MessageSquareReply,
  Inbox,
  Calendar,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';

interface SequenceStep {
  id: string;
  order: number;
  channel: 'email' | 'task' | 'linkedin_task' | 'schedule_link';
  delayDays: number;
  subject?: string;
  bodyTemplate?: string;
  taskTitle?: string;
  scheduleInterviewType?: string;
  scheduleDurationMinutes?: number;
}

interface SequenceDefinition {
  id: string;
  name: string;
  description?: string;
  steps: SequenceStep[];
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

interface SequenceEnrollment {
  id: string;
  sequenceId: string;
  candidateId: string;
  candidateName?: string;
  candidateEmail?: string;
  jobId?: string;
  jobTitle?: string;
  status: string;
  currentStepIndex: number;
  nextRunAt: string;
  drafts?: { stepId: string; subject?: string; body?: string }[];
  createdAt: string;
}

function channelIcon(channel: string) {
  if (channel === 'email') return <Mail className="h-3.5 w-3.5" />;
  if (channel === 'linkedin_task') return <Linkedin className="h-3.5 w-3.5" />;
  if (channel === 'schedule_link') return <Calendar className="h-3.5 w-3.5" />;
  return <CheckSquare className="h-3.5 w-3.5" />;
}

function channelLabel(channel: string) {
  if (channel === 'email') return 'Email';
  if (channel === 'linkedin_task') return 'LinkedIn task';
  if (channel === 'schedule_link') return 'Schedule link';
  return 'Task';
}

export default function SequencesPage() {
  const [sequences, setSequences] = useState<SequenceDefinition[]>([]);
  const [enrollments, setEnrollments] = useState<SequenceEnrollment[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('Default 3-step outreach');
  const [newDescription, setNewDescription] = useState(
    'Day 0 email, Day 3 task, Day 7 follow-up email'
  );

  // Draft preview
  const [draftOpen, setDraftOpen] = useState(false);
  const [draftCandidateId, setDraftCandidateId] = useState('');
  const [draftJobId, setDraftJobId] = useState('');
  const [draftSequenceId, setDraftSequenceId] = useState('');
  const [draftLoading, setDraftLoading] = useState(false);
  const [draftResult, setDraftResult] = useState<{
    subject: string;
    body: string;
    source?: string;
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [seqRes, enrollRes] = await Promise.all([
        fetch('/api/sequences'),
        fetch('/api/sequences/enrollments'),
      ]);
      if (seqRes.ok) {
        const data = await seqRes.json();
        setSequences(Array.isArray(data.sequences) ? data.sequences : []);
      } else {
        toast.error('Failed to load sequences');
      }
      if (enrollRes.ok) {
        const data = await enrollRes.json();
        setEnrollments(Array.isArray(data.enrollments) ? data.enrollments : []);
      }
    } catch {
      toast.error('Failed to load sequences');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const createDefaultSequence = async () => {
    if (!newName.trim()) {
      toast.error('Name is required');
      return;
    }
    setCreating(true);
    try {
      const res = await fetch('/api/sequences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName.trim(),
          description: newDescription.trim() || undefined,
          // omit steps → repository injects Day 0 / Day 3 / Day 7 default
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Create failed');
      }
      toast.success('Sequence created');
      setNewName('Default 3-step outreach');
      await load();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to create sequence');
    } finally {
      setCreating(false);
    }
  };

  const previewDraft = async () => {
    if (!draftCandidateId.trim()) {
      toast.error('Candidate ID is required');
      return;
    }
    setDraftLoading(true);
    setDraftResult(null);
    try {
      const res = await fetch('/api/sequences/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candidateId: draftCandidateId.trim(),
          jobId: draftJobId.trim() || undefined,
          sequenceId: draftSequenceId || undefined,
          stepIndex: 0,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Draft failed');
      }
      setDraftResult({
        subject: data.subject || '',
        body: data.body || '',
        source: data.source,
      });
    } catch (e: any) {
      toast.error(e?.message || 'Failed to generate draft');
    } finally {
      setDraftLoading(false);
    }
  };

  const sequenceNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of sequences) map.set(s.id, s.name);
    return map;
  }, [sequences]);

  const [running, setRunning] = useState(false);
  const [replyBusy, setReplyBusy] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);

  const pollReplies = async () => {
    setPolling(true);
    try {
      const res = await fetch('/api/sequences/poll-replies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 30, newerThanDays: 14 }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Poll failed');
      if (data.repliesFound > 0) {
        toast.success(
          `Found ${data.repliesFound} reply(ies) — sequences updated`
        );
      } else {
        toast.message(
          data.errors?.[0]?.includes('not connected')
            ? data.errors[0]
            : `No new replies (${data.scannedEnrollments || 0} enrollments scanned)`
        );
      }
      await load();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to poll inbox');
    } finally {
      setPolling(false);
    }
  };

  const runDue = async (enrollmentId?: string) => {
    setRunning(true);
    try {
      const res = await fetch('/api/sequences/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          enrollmentId
            ? { enrollmentId, force: true }
            : { limit: 25 }
        ),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Run failed');
      if (data.mode === 'single') {
        if (data.result?.success) {
          toast.success(data.result.message || 'Step sent');
        } else {
          toast.error(data.result?.message || 'Step failed');
        }
      } else {
        toast.success(
          `Ran ${data.processed} due: ${data.sent} ok, ${data.failed} failed`
        );
      }
      await load();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to run sequences');
    } finally {
      setRunning(false);
    }
  };

  const logReply = async (
    enrollmentId: string,
    classification: 'positive' | 'negative' | 'neutral'
  ) => {
    setReplyBusy(enrollmentId);
    try {
      const res = await fetch(
        `/api/sequences/enrollments/${encodeURIComponent(enrollmentId)}/reply`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ classification }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Reply failed');
      toast.success(
        `Logged ${data.classification}${
          data.stageSuggestion ? ` → ${data.stageSuggestion}` : ''
        }`
      );
      await load();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to log reply');
    } finally {
      setReplyBusy(null);
    }
  };

  const dueCount = enrollments.filter((e) => {
    if (e.status !== 'active') return false;
    const t = Date.parse(e.nextRunAt);
    return !Number.isNaN(t) && t <= Date.now();
  }).length;

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900 flex items-center gap-2">
            <ListOrdered className="h-6 w-6 text-blue-600" />
            Sequences
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Multi-step outreach with send, inbox reply polling, and AI drafts.
            Connect Gmail/Outlook in Settings to send and detect replies.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            className="bg-emerald-700 hover:bg-emerald-800"
            onClick={() => void runDue()}
            disabled={running || loading}
          >
            {running ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Play className="h-4 w-4 mr-2" />
            )}
            Run due{dueCount > 0 ? ` (${dueCount})` : ''}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void pollReplies()}
            disabled={polling || loading}
          >
            {polling ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Inbox className="h-4 w-4 mr-2" />
            )}
            Poll replies
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void load()}
            disabled={loading}
          >
            <RefreshCw
              className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`}
            />
            Refresh
          </Button>
        </div>
      </div>

      {/* Create default sequence */}
      <section className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">
          Create sequence
        </h2>
        <p className="text-sm text-gray-500 mb-4">
          Creates a simple 3-step default: Day 0 email → Day 3 task → Day 7
          follow-up email.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="seq-name">Name</Label>
            <Input
              id="seq-name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="seq-desc">Description</Label>
            <Input
              id="seq-desc"
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              className="mt-1"
            />
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            onClick={() => void createDefaultSequence()}
            disabled={creating}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {creating ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Plus className="h-4 w-4 mr-2" />
            )}
            Create 3-step sequence
          </Button>
          <Button variant="outline" onClick={() => setDraftOpen(true)}>
            <Eye className="h-4 w-4 mr-2" />
            Preview draft
          </Button>
        </div>
      </section>

      {/* Sequence list */}
      <section className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Your sequences
        </h2>
        {loading ? (
          <div className="flex items-center gap-2 text-gray-600 py-8 justify-center">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading…
          </div>
        ) : sequences.length === 0 ? (
          <p className="text-sm text-gray-500 py-6 text-center">
            No sequences yet. Create the default 3-step sequence above.
          </p>
        ) : (
          <ul className="space-y-4">
            {sequences.map((seq) => (
              <li
                key={seq.id}
                className="border border-gray-100 rounded-xl p-4 hover:border-gray-200 transition-colors"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="font-medium text-gray-900">{seq.name}</h3>
                    {seq.description ? (
                      <p className="text-sm text-gray-500 mt-0.5">
                        {seq.description}
                      </p>
                    ) : null}
                  </div>
                  <span
                    className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                      seq.active
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                        : 'border-slate-200 bg-slate-50 text-slate-600'
                    }`}
                  >
                    {seq.active ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <ol className="mt-3 flex flex-wrap gap-2">
                  {(seq.steps || [])
                    .slice()
                    .sort((a, b) => a.order - b.order)
                    .map((step, i) => (
                      <li
                        key={step.id || i}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs text-gray-700"
                      >
                        <span className="font-semibold text-gray-500">
                          Day {step.delayDays}
                        </span>
                        {channelIcon(step.channel)}
                        {channelLabel(step.channel)}
                        {step.subject ? (
                          <span className="text-gray-400 max-w-[140px] truncate">
                            · {step.subject}
                          </span>
                        ) : null}
                      </li>
                    ))}
                </ol>
                <p className="text-xs text-gray-400 mt-2 font-mono truncate">
                  {seq.id}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Enrollments */}
      <section className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-1 flex items-center gap-2">
          <Users className="h-5 w-5 text-gray-600" />
          Enrollments
        </h2>
        <p className="text-sm text-gray-500 mb-4">
          Candidates currently or recently enrolled in sequences.
        </p>
        {enrollments.length === 0 ? (
          <p className="text-sm text-gray-500 py-4 text-center">
            No enrollments yet. Enroll from AI tools or the Fill this req
            playbook.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b">
                  <th className="pb-2 pr-3 font-medium">Candidate</th>
                  <th className="pb-2 pr-3 font-medium">Sequence</th>
                  <th className="pb-2 pr-3 font-medium">Job</th>
                  <th className="pb-2 pr-3 font-medium">Status</th>
                  <th className="pb-2 pr-3 font-medium">Step</th>
                  <th className="pb-2 pr-3 font-medium">Next run</th>
                  <th className="pb-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {enrollments.map((e) => (
                  <tr key={e.id} className="border-b border-gray-50">
                    <td className="py-2.5 pr-3">
                      <div className="font-medium text-gray-900">
                        {e.candidateName || e.candidateId}
                      </div>
                      {e.candidateEmail ? (
                        <div className="text-xs text-gray-400">
                          {e.candidateEmail}
                        </div>
                      ) : null}
                    </td>
                    <td className="py-2.5 pr-3 text-gray-700">
                      {sequenceNameById.get(e.sequenceId) || '—'}
                    </td>
                    <td className="py-2.5 pr-3 text-gray-700">
                      {e.jobTitle || e.jobId || '—'}
                    </td>
                    <td className="py-2.5 pr-3">
                      <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs capitalize">
                        {e.status}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3 text-gray-600">
                      {e.currentStepIndex + 1}
                    </td>
                    <td className="py-2.5 pr-3 text-gray-600 text-xs">
                      {e.nextRunAt
                        ? new Date(e.nextRunAt).toLocaleString()
                        : '—'}
                    </td>
                    <td className="py-2.5">
                      <div className="flex flex-wrap gap-1">
                        {e.status === 'active' && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 text-[11px] px-2"
                            disabled={running}
                            onClick={() => void runDue(e.id)}
                          >
                            <Play className="h-3 w-3 mr-1" />
                            Run
                          </Button>
                        )}
                        {e.status === 'active' && (
                          <>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-7 text-[11px] px-2"
                              disabled={replyBusy === e.id}
                              onClick={() => void logReply(e.id, 'positive')}
                            >
                              <MessageSquareReply className="h-3 w-3 mr-1" />
                              +
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-7 text-[11px] px-2"
                              disabled={replyBusy === e.id}
                              onClick={() => void logReply(e.id, 'negative')}
                            >
                              −
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Draft preview dialog */}
      <Dialog open={draftOpen} onOpenChange={setDraftOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Preview outreach draft</DialogTitle>
            <DialogDescription>
              Generate a first-touch email for a candidate (template or
              personalized). Paste candidate and optional job IDs from the
              dashboard.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label htmlFor="draft-cand">Candidate ID</Label>
              <Input
                id="draft-cand"
                value={draftCandidateId}
                onChange={(e) => setDraftCandidateId(e.target.value)}
                placeholder="UUID from Candidates"
                className="mt-1 font-mono text-sm"
              />
            </div>
            <div>
              <Label htmlFor="draft-job">Job ID (optional)</Label>
              <Input
                id="draft-job"
                value={draftJobId}
                onChange={(e) => setDraftJobId(e.target.value)}
                placeholder="UUID from Jobs"
                className="mt-1 font-mono text-sm"
              />
            </div>
            <div>
              <Label htmlFor="draft-seq">Sequence (optional)</Label>
              <select
                id="draft-seq"
                value={draftSequenceId}
                onChange={(e) => setDraftSequenceId(e.target.value)}
                className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
              >
                <option value="">None (default personalized)</option>
                {sequences.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            {draftResult ? (
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-2">
                <div>
                  <p className="text-xs font-medium text-gray-500">Subject</p>
                  <p className="text-sm font-medium text-gray-900">
                    {draftResult.subject}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500">Body</p>
                  <Textarea
                    readOnly
                    value={draftResult.body}
                    className="mt-1 min-h-[160px] text-sm bg-white"
                  />
                </div>
                {draftResult.source ? (
                  <p className="text-xs text-gray-400">
                    Source: {draftResult.source}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraftOpen(false)}>
              Close
            </Button>
            <Button
              onClick={() => void previewDraft()}
              disabled={draftLoading}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {draftLoading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Eye className="h-4 w-4 mr-2" />
              )}
              Generate draft
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
