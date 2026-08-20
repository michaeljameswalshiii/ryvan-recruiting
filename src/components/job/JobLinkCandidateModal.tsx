'use client';

import { useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useLinkCandidateToJob } from '@/lib/hooks/query-job';
import { APPLICATION_STAGES, getStageLabel } from '@/lib/schemas/lead';
import { matchControlledTags } from '@/lib/tags';
import { Search, UserPlus, X, Tag } from 'lucide-react';
import { toast } from 'sonner';

const STAGES = APPLICATION_STAGES.map((s) => s.value);

export interface JobLinkCandidateModalProps {
  isOpen: boolean;
  onClose: () => void;
  jobId: string;
  jobTitle?: string;
  linkedCandidateIds: Set<string>;
  allCandidates: any[];
  jobTags?: string[];
  onSuccess?: () => void;
}

export function JobLinkCandidateModal({
  isOpen,
  onClose,
  jobId,
  jobTitle,
  linkedCandidateIds,
  allCandidates,
  jobTags = [],
  onSuccess,
}: JobLinkCandidateModalProps) {
  const linkCandidate = useLinkCandidateToJob();
  const [search, setSearch] = useState('');
  const [selectedCandidate, setSelectedCandidate] = useState<any | null>(null);
  const [stage, setStage] = useState('sourced');
  const [notes, setNotes] = useState('');

  const availableCandidates = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (Array.isArray(allCandidates) ? allCandidates : [])
      .filter((c: any) => c?.id && !linkedCandidateIds.has(String(c.id)))
      .filter((c: any) => {
        if (!q) return true;
        const hay = [c.name, c.email, c.title, c.phone, c.id]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 30);
  }, [allCandidates, linkedCandidateIds, search]);

  const selectedTagMatch = useMemo(() => {
    if (!jobTags.length || !selectedCandidate) return null;
    const candTags = Array.isArray(selectedCandidate.tags)
      ? selectedCandidate.tags
      : [];
    return matchControlledTags({ required: jobTags, candidate: candTags });
  }, [jobTags, selectedCandidate]);

  const handleSelect = (cand: any) => {
    setSelectedCandidate(cand);
    setSearch(cand.name || '');
  };

  const handleClear = () => {
    setSelectedCandidate(null);
    setSearch('');
    setNotes('');
    setStage('sourced');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCandidate) {
      toast.error('Please select a candidate first');
      return;
    }

    try {
      await linkCandidate.mutateAsync({
        jobId,
        candidateData: {
          candidateId: String(selectedCandidate.id),
          candidateName: selectedCandidate.name || 'Unknown',
          candidateEmail: selectedCandidate.email || undefined,
          stage,
          notes: notes.trim() || undefined,
        },
      });

      handleClear();
      onSuccess?.();
      onClose();
    } catch {
      // toast shown by mutation
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-xl max-h-[min(90vh,760px)] flex flex-col gap-0 p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-3 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            <UserPlus className="h-5 w-5 text-blue-600" />
            Link Candidate to {jobTitle || 'Job'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            {selectedCandidate ? (
              <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-semibold text-blue-950">
                      {selectedCandidate.name}
                    </h4>
                    {selectedCandidate.title && (
                      <p className="text-xs text-blue-800">
                        {selectedCandidate.title}
                      </p>
                    )}
                    {selectedCandidate.email && (
                      <p className="text-xs text-blue-600">
                        {selectedCandidate.email}
                      </p>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs text-blue-700 hover:bg-blue-100"
                    onClick={handleClear}
                  >
                    <X className="h-4 w-4 mr-1" />
                    Change
                  </Button>
                </div>

                {selectedTagMatch && (
                  <div className="pt-2 border-t border-blue-200/60 flex items-center gap-1.5 text-xs text-blue-800">
                    <Tag className="h-3.5 w-3.5" />
                    <span>
                      Tag Match: {selectedTagMatch.matched.length}/
                      {jobTags.length} ({selectedTagMatch.score}%)
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <Label>Search Candidates</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search by name, email, or title…"
                    className="pl-9"
                    autoFocus
                  />
                </div>

                <div className="border border-slate-200 dark:border-slate-700 rounded-xl max-h-56 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                  {availableCandidates.length === 0 ? (
                    <div className="p-4 text-center text-xs text-slate-500">
                      {search
                        ? 'No matching candidates found'
                        : 'No more candidates available to link'}
                    </div>
                  ) : (
                    availableCandidates.map((c: any) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => handleSelect(c)}
                        className="w-full text-left px-3.5 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/60 flex items-center justify-between transition-colors text-xs"
                      >
                        <div className="min-w-0 pr-2">
                          <p className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                            {c.name || 'Unnamed Candidate'}
                          </p>
                          <p className="text-slate-500 dark:text-slate-400 truncate">
                            {c.title || c.email || 'No title'}
                          </p>
                        </div>
                        <span className="shrink-0 text-[11px] font-medium text-blue-600">
                          Select →
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 gap-3">
              <div>
                <Label htmlFor="candidate-stage">Initial Stage</Label>
                <select
                  id="candidate-stage"
                  value={stage}
                  onChange={(e) => setStage(e.target.value)}
                  className="mt-1 w-full rounded-md border border-input bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
                >
                  {STAGES.map((s) => (
                    <option key={s} value={s}>
                      {getStageLabel(s)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <Label htmlFor="candidate-notes">Notes (Optional)</Label>
                <Input
                  id="candidate-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Talked comp, interested in hybrid..."
                  className="mt-1"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 border-t px-6 py-3.5 bg-slate-50 dark:bg-slate-900 shrink-0">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={linkCandidate.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!selectedCandidate || linkCandidate.isPending}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {linkCandidate.isPending ? 'Linking…' : 'Link Candidate'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
