'use client';

import { useState } from 'react';
import { Sparkles, Loader2, Link2, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
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

interface RankedRow {
  candidateId: string;
  name: string;
  email?: string;
  title?: string;
  score: number;
  reasons: string[];
  matchedSkills: string[];
  alreadyLinked: boolean;
}

interface DraftRow {
  candidateId: string;
  candidateName: string;
  subject: string;
  body: string;
  source?: string;
}

interface ExternalRow {
  apolloId: string;
  name: string;
  email?: string;
  title?: string;
  company?: string;
  linkedinUrl?: string;
  location?: string;
  score: number;
  reasons: string[];
}

interface PlaybookResponse {
  job?: { id: string; title: string; companyName?: string; linkedCount: number };
  ranked?: RankedRow[];
  external?: ExternalRow[];
  drafts?: DraftRow[];
  nextActions?: string[];
  summary?: string;
  suggestedSequenceId?: string;
  notes?: string[];
  error?: string;
}

interface FillReqPlaybookButtonProps {
  jobId: string;
  jobTitle?: string;
  className?: string;
}

export function FillReqPlaybookButton({
  jobId,
  jobTitle,
  className,
}: FillReqPlaybookButtonProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PlaybookResponse | null>(null);
  const [expandedDraft, setExpandedDraft] = useState<string | null>(null);

  const runPlaybook = async () => {
    if (!jobId) {
      toast.error('Missing job id');
      return;
    }
    setLoading(true);
    setResult(null);
    setOpen(true);
    try {
      const res = await fetch('/api/playbooks/fill-req', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId,
          maxCandidates: 10,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Playbook failed');
      }
      setResult(data);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to run Fill this req');
      setResult({ error: e?.message || 'Failed' });
    } finally {
      setLoading(false);
    }
  };

  const draftFor = (candidateId: string) =>
    result?.drafts?.find((d) => d.candidateId === candidateId);

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className={
          className ||
          'border-violet-200 bg-violet-50 text-violet-900 hover:bg-violet-100'
        }
        onClick={() => void runPlaybook()}
        disabled={loading || !jobId}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : (
          <Sparkles className="h-4 w-4 mr-2" />
        )}
        Fill this req
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-violet-600" />
              Fill this req
            </DialogTitle>
            <DialogDescription>
              Ranked internal + Apollo external prospects and draft outreach for{' '}
              <span className="font-medium text-gray-800">
                {jobTitle || result?.job?.title || 'this job'}
              </span>
              . Planning only — no automatic CRM changes.
            </DialogDescription>
          </DialogHeader>

          {loading && (
            <div className="flex items-center justify-center gap-2 py-12 text-gray-600">
              <Loader2 className="h-5 w-5 animate-spin" />
              Scoring internal + Apollo, drafting outreach…
            </div>
          )}

          {!loading && result?.error && (
            <p className="text-sm text-red-600 py-4">{result.error}</p>
          )}

          {!loading && result && !result.error && (
            <div className="space-y-4 py-1">
              {result.summary ? (
                <p className="text-sm text-gray-700 bg-slate-50 border border-slate-100 rounded-lg p-3">
                  {result.summary}
                </p>
              ) : null}

              {result.notes?.length ? (
                <ul className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-lg p-3 space-y-1">
                  {result.notes.map((n, i) => (
                    <li key={i}>• {n}</li>
                  ))}
                </ul>
              ) : null}

              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-2">
                  Ranked internal candidates
                </h3>
                {!result.ranked?.length ? (
                  <p className="text-sm text-gray-500">
                    No candidates to rank. Add leads first.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {result.ranked.map((r) => {
                      const draft = draftFor(r.candidateId);
                      const openDraft = expandedDraft === r.candidateId;
                      return (
                        <li
                          key={r.candidateId}
                          className="border border-gray-100 rounded-xl p-3"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <div className="font-medium text-gray-900">
                                {r.name}
                                {r.title ? (
                                  <span className="text-gray-500 font-normal">
                                    {' '}
                                    · {r.title}
                                  </span>
                                ) : null}
                              </div>
                              {r.email ? (
                                <div className="text-xs text-gray-400">
                                  {r.email}
                                </div>
                              ) : null}
                              {r.reasons?.[0] ? (
                                <p className="text-xs text-gray-500 mt-1">
                                  {r.reasons[0]}
                                </p>
                              ) : null}
                            </div>
                            <div className="flex items-center gap-2">
                              {r.alreadyLinked ? (
                                <span className="inline-flex items-center gap-1 text-xs rounded-full bg-sky-50 text-sky-800 border border-sky-100 px-2 py-0.5">
                                  <Link2 className="h-3 w-3" />
                                  Linked
                                </span>
                              ) : null}
                              <span
                                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                                  r.score >= 60
                                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-100'
                                    : r.score >= 30
                                      ? 'bg-amber-50 text-amber-900 border border-amber-100'
                                      : 'bg-slate-100 text-slate-700 border border-slate-200'
                                }`}
                              >
                                {r.score}% fit
                              </span>
                            </div>
                          </div>
                          {draft ? (
                            <div className="mt-2">
                              <button
                                type="button"
                                className="inline-flex items-center gap-1 text-xs text-violet-700 hover:underline"
                                onClick={() =>
                                  setExpandedDraft(
                                    openDraft ? null : r.candidateId
                                  )
                                }
                              >
                                <Mail className="h-3 w-3" />
                                {openDraft ? 'Hide draft' : 'Show draft'}
                              </button>
                              {openDraft ? (
                                <div className="mt-2 rounded-lg bg-gray-50 border border-gray-100 p-2 space-y-1">
                                  <p className="text-xs font-medium text-gray-800">
                                    {draft.subject}
                                  </p>
                                  <Textarea
                                    readOnly
                                    value={draft.body}
                                    className="min-h-[100px] text-xs bg-white"
                                  />
                                </div>
                              ) : null}
                            </div>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              {result.external && result.external.length > 0 ? (
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 mb-2">
                    Apollo external prospects
                  </h3>
                  <ul className="space-y-2">
                    {result.external.map((r) => (
                      <li
                        key={r.apolloId}
                        className="border border-indigo-100 bg-indigo-50/40 rounded-xl p-3"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <div className="font-medium text-gray-900">
                              {r.name}
                              {r.title ? (
                                <span className="text-gray-500 font-normal">
                                  {' '}
                                  · {r.title}
                                </span>
                              ) : null}
                            </div>
                            <div className="text-xs text-gray-500">
                              {[r.company, r.location].filter(Boolean).join(' · ')}
                            </div>
                            {r.linkedinUrl ? (
                              <a
                                href={r.linkedinUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-xs text-blue-600 hover:underline"
                              >
                                LinkedIn
                              </a>
                            ) : null}
                            {r.reasons?.[0] ? (
                              <p className="text-xs text-gray-500 mt-1">
                                {r.reasons[0]}
                              </p>
                            ) : null}
                          </div>
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                              r.score >= 60
                                ? 'bg-emerald-50 text-emerald-800 border border-emerald-100'
                                : 'bg-slate-100 text-slate-700 border border-slate-200'
                            }`}
                          >
                            {r.score}% fit
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {result.nextActions?.length ? (
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 mb-1">
                    Suggested next actions
                  </h3>
                  <ul className="text-sm text-gray-600 list-disc pl-5 space-y-1">
                    {result.nextActions.map((a, i) => (
                      <li key={i}>{a}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {result.suggestedSequenceId ? (
                <p className="text-xs text-gray-400 font-mono truncate">
                  Suggested sequence: {result.suggestedSequenceId}
                </p>
              ) : null}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Close
            </Button>
            <Button
              onClick={() => void runPlaybook()}
              disabled={loading}
              className="bg-violet-600 hover:bg-violet-700"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4 mr-2" />
              )}
              Re-run
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default FillReqPlaybookButton;
