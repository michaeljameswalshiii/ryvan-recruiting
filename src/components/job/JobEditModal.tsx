'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useUpdateJob } from '@/lib/hooks/query-job';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';
import {
  HiringManagerSelect,
  type HiringManagerFields,
} from '@/components/job/JobHiringManagerCard';

interface JobEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  job: any;
  onSuccess?: () => void;
}

type PreScreenDraft = {
  id: string;
  prompt: string;
  type: 'text' | 'yes_no' | 'number' | 'choice';
  required: boolean;
};

function makeQuestionId(): string {
  return `psq_${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeQuestionsFromJob(job: any): PreScreenDraft[] {
  const raw = job?.preScreenQuestions;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((q: any) => q && (q.prompt || q.id))
    .map((q: any) => ({
      id: String(q.id || makeQuestionId()),
      prompt: String(q.prompt || ''),
      type: (['text', 'yes_no', 'number', 'choice'].includes(q.type)
        ? q.type
        : 'text') as PreScreenDraft['type'],
      required: q.required !== false,
    }));
}

export default function JobEditModal({ isOpen, onClose, job, onSuccess }: JobEditModalProps) {
  const updateJob = useUpdateJob();

  const [formData, setFormData] = useState({
    title: job.title || '',
    description: job.description || '',
    location: job.location || '',
    salaryRange: job.salaryRange || '',
    employmentType: job.employmentType || 'Full-time',
    companyName: job.companyName || '',
    status: job.status || 'Open',
    showOnWebsite: job.showOnWebsite !== false,
  });

  const [hiringManager, setHiringManager] = useState<HiringManagerFields>({
    hiringManagerContactId: job.hiringManagerContactId || '',
    hiringManagerName: job.hiringManagerName || '',
    hiringManagerTitle: job.hiringManagerTitle || '',
    hiringManagerEmail: job.hiringManagerEmail || '',
    hiringManagerPhone: job.hiringManagerPhone || '',
  });

  const [preScreenQuestions, setPreScreenQuestions] = useState<PreScreenDraft[]>(
    () => normalizeQuestionsFromJob(job)
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const jobData: Record<string, unknown> = {};

    if (formData.title?.trim() && formData.title !== job.title) {
      jobData.title = formData.title.trim();
    }
    if (formData.description?.trim() !== (job.description || '')) {
      jobData.description = formData.description.trim();
    }
    if (formData.location?.trim() !== (job.location || '')) {
      jobData.location = formData.location.trim();
    }
    if (formData.salaryRange?.trim() !== (job.salaryRange || '')) {
      jobData.salaryRange = formData.salaryRange.trim();
    }
    if (formData.employmentType !== job.employmentType) {
      jobData.employmentType = formData.employmentType;
    }
    if (formData.companyName?.trim() !== (job.companyName || '')) {
      jobData.companyName = formData.companyName.trim();
    }
    if (formData.status !== job.status) {
      jobData.status = formData.status;
    }
    const wasShown = job.showOnWebsite !== false;
    if (formData.showOnWebsite !== wasShown) {
      jobData.showOnWebsite = formData.showOnWebsite;
    }

    // Pre-screen questions: always send if changed vs original
    const cleaned = preScreenQuestions
      .map((q) => ({
        id: q.id || makeQuestionId(),
        prompt: q.prompt.trim().slice(0, 500),
        type: q.type || 'text',
        required: q.required !== false,
      }))
      .filter((q) => q.prompt.length > 0);

    const original = normalizeQuestionsFromJob(job).map((q) => ({
      id: q.id,
      prompt: q.prompt.trim(),
      type: q.type || 'text',
      required: q.required !== false,
    }));
    const questionsChanged =
      JSON.stringify(cleaned) !== JSON.stringify(original);
    if (questionsChanged) {
      jobData.preScreenQuestions = cleaned;
    }

    // Hiring manager — always patch when any field differs
    const hmKeys: (keyof HiringManagerFields)[] = [
      'hiringManagerContactId',
      'hiringManagerName',
      'hiringManagerTitle',
      'hiringManagerEmail',
      'hiringManagerPhone',
    ];
    let hmChanged = false;
    for (const k of hmKeys) {
      const next = String(hiringManager[k] || '');
      const prev = String((job as any)[k] || '');
      if (next !== prev) {
        hmChanged = true;
        break;
      }
    }
    if (hmChanged) {
      for (const k of hmKeys) {
        jobData[k] = String(hiringManager[k] || '');
      }
    }

    // Extra safety: remove empty strings for non-HM fields (keep booleans / arrays / HM clears)
    Object.keys(jobData).forEach((key) => {
      if (hmKeys.includes(key as keyof HiringManagerFields)) return;
      if (jobData[key] === '') delete jobData[key];
    });

    console.log('🚀 Final payload to useUpdateJob:', { jobId: job.id, jobData });

    if (Object.keys(jobData).length === 0) {
      toast.info("No changes detected");
      onClose();
      return;
    }

    try {
      const result = await updateJob.mutateAsync({
        jobId: job.id,
        jobData: jobData as any,
      });
      
      if (result && result.error) {
        throw new Error(result.error);
      }

      toast.success('Job updated successfully!');
      onSuccess?.();
      onClose();
    } catch (error: any) {
      console.error('❌ Update error details:', error);
      toast.error('Failed to update job', {
        description: error?.message || 'Please try again',
      });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Job</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <Label>Job Title</Label>
            <Input value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} required />
          </div>

          <div>
            <Label>Company Name</Label>
            <Input value={formData.companyName} onChange={(e) => setFormData({ ...formData, companyName: e.target.value })} />
          </div>

          <div>
            <Label>Hiring manager / contact</Label>
            <HiringManagerSelect
              companyId={job.companyId}
              valueContactId={hiringManager.hiringManagerContactId}
              onChange={setHiringManager}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Primary client contact for this req (from company contacts).
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Location</Label>
              <Input value={formData.location} onChange={(e) => setFormData({ ...formData, location: e.target.value })} />
            </div>
            <div>
              <Label>Salary Range</Label>
              <Input value={formData.salaryRange} onChange={(e) => setFormData({ ...formData, salaryRange: e.target.value })} />
            </div>
          </div>

          <div>
            <Label>Description</Label>
            <Textarea value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} rows={6} />
          </div>

          <label className="flex items-start gap-2 rounded-md border p-3 text-sm cursor-pointer">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4"
              checked={formData.showOnWebsite}
              onChange={(e) =>
                setFormData({ ...formData, showOnWebsite: e.target.checked })
              }
            />
            <span>
              <span className="font-medium">Show on website</span>
              <span className="block text-xs text-muted-foreground mt-0.5">
                Public careers page and embeds (only while status is Open).
              </span>
            </span>
          </label>

          {/* Pre-screen questions */}
          <div className="space-y-3 rounded-md border p-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <Label className="text-sm font-medium">
                  Careers pre-screen questions
                </Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Shown on the public apply form. Keep prompts short.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1 shrink-0"
                onClick={() =>
                  setPreScreenQuestions((prev) => [
                    ...prev,
                    {
                      id: makeQuestionId(),
                      prompt: '',
                      type: 'text',
                      required: true,
                    },
                  ])
                }
              >
                <Plus className="h-3.5 w-3.5" />
                Add
              </Button>
            </div>

            {preScreenQuestions.length === 0 ? (
              <p className="text-xs text-muted-foreground py-1">
                No screening questions yet.
              </p>
            ) : (
              <ul className="space-y-2">
                {preScreenQuestions.map((q, idx) => (
                  <li key={q.id} className="flex items-start gap-2">
                    <span className="text-xs text-muted-foreground mt-2.5 w-5 shrink-0">
                      {idx + 1}.
                    </span>
                    <Input
                      value={q.prompt}
                      placeholder="e.g. Are you authorized to work in the US?"
                      onChange={(e) =>
                        setPreScreenQuestions((prev) =>
                          prev.map((item) =>
                            item.id === q.id
                              ? { ...item, prompt: e.target.value }
                              : item
                          )
                        )
                      }
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="shrink-0 text-slate-500 hover:text-red-600"
                      onClick={() =>
                        setPreScreenQuestions((prev) =>
                          prev.filter((item) => item.id !== q.id)
                        )
                      }
                      aria-label="Remove question"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={updateJob.isPending}>
              {updateJob.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
