'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useUpdateJob } from '@/lib/hooks/query-job';
import { useClients } from '@/lib/hooks/query-client';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';
import {
  HiringManagerSelect,
  type HiringManagerFields,
} from '@/components/job/JobHiringManagerCard';
import { JobDescriptionEditor } from '@/components/job/JobDescriptionEditor';
import {
  looksLikeHtml,
  sanitizeJobHtml,
} from '@/lib/careers/sanitize-job-html';
import { normalizeJobDescriptionPaste } from '@/lib/careers/format-description';
import {
  SearchableSelect,
  companyOptionsFromList,
} from '@/components/ui/searchable-select';
import { OwnerSelect } from '@/components/shared/OwnerSelect';
import { TagEditor } from '@/components/shared/TagEditor';
import { mergeManualAndGenerated, tagsFromRecord } from '@/lib/tags';
import { SalaryRangeFields } from '@/components/job/SalaryRangeFields';

interface JobEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  job: any;
  onSuccess?: () => void;
  /** When true, scroll/focus the description field on open */
  focusDescription?: boolean;
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

export default function JobEditModal({
  isOpen,
  onClose,
  job,
  onSuccess,
  focusDescription = false,
}: JobEditModalProps) {
  const updateJob = useUpdateJob();
  const { data: companiesData = [] } = useClients();
  const companies = useMemo(() => {
    if (Array.isArray(companiesData)) return companiesData;
    if (companiesData && Array.isArray((companiesData as any).clients)) {
      return (companiesData as any).clients;
    }
    return [];
  }, [companiesData]);

  const [formData, setFormData] = useState({
    title: job.title || '',
    description: job.description || '',
    location: job.location || '',
    salaryRange: job.salaryRange || '',
    employmentType: job.employmentType || 'Full-time',
    companyId: job.companyId || '',
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
  const [formTags, setFormTags] = useState<string[]>(
    Array.isArray(job?.tags) ? job.tags.map(String) : []
  );

  // Reset form when opening for a job (keeps description in sync after refetch)
  useEffect(() => {
    if (!isOpen) return;
    setFormData({
      title: job.title || '',
      description: job.description || '',
      location: job.location || '',
      salaryRange: job.salaryRange || '',
      employmentType: job.employmentType || 'Full-time',
      companyId: job.companyId || '',
      companyName: job.companyName || '',
      status: job.status || 'Open',
      showOnWebsite: job.showOnWebsite !== false,
    });
    setHiringManager({
      hiringManagerContactId: job.hiringManagerContactId || '',
      hiringManagerName: job.hiringManagerName || '',
      hiringManagerTitle: job.hiringManagerTitle || '',
      hiringManagerEmail: job.hiringManagerEmail || '',
      hiringManagerPhone: job.hiringManagerPhone || '',
    });
    setPreScreenQuestions(normalizeQuestionsFromJob(job));
    setFormTags(Array.isArray(job?.tags) ? job.tags.map(String) : []);
  }, [isOpen, job?.id]);

  useEffect(() => {
    if (!isOpen || !focusDescription) return;
    const t = window.setTimeout(() => {
      document
        .getElementById('edit-description')
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const editable = document.querySelector(
        '#edit-description .job-desc-editor'
      ) as HTMLElement | null;
      editable?.focus();
    }, 80);
    return () => window.clearTimeout(t);
  }, [isOpen, focusDescription]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const jobData: Record<string, unknown> = {};

    if (formData.title?.trim() && formData.title !== job.title) {
      jobData.title = formData.title.trim();
    }
    if (formData.description?.trim() !== (job.description || '')) {
      const desc = formData.description.trim();
      // Preserve rich HTML; only plain-text pastes get structure-normalized
      jobData.description = looksLikeHtml(desc)
        ? sanitizeJobHtml(desc)
        : normalizeJobDescriptionPaste(desc);
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
    if (formData.companyId && formData.companyId !== (job.companyId || '')) {
      jobData.companyId = formData.companyId;
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

    const generated = tagsFromRecord({
      objectType: 'job',
      title: formData.title,
      description: [formData.description.replace(/<[^>]+>/g, ' '), formData.location]
        .filter(Boolean)
        .join('\n'),
    }).tags;
    const nextTags = mergeManualAndGenerated(formTags, generated);
    const prevTags = Array.isArray(job.tags) ? job.tags.map(String) : [];
    const tagsChanged =
      JSON.stringify(nextTags) !== JSON.stringify(prevTags);
    if (
      tagsChanged ||
      jobData.title !== undefined ||
      jobData.description !== undefined ||
      jobData.location !== undefined
    ) {
      jobData.tags = nextTags;
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
      <DialogContent className="max-w-2xl max-h-[min(92vh,900px)] flex flex-col gap-0 p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-3 pr-12 shrink-0 border-b">
          <DialogTitle>Edit Job</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain px-6 py-4">
            <div>
              <Label>Job Title</Label>
              <Input value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} required />
            </div>

            <div>
              <Label htmlFor="edit-companyId">Company</Label>
              {companies.length > 0 ? (
                <SearchableSelect
                  id="edit-companyId"
                  value={formData.companyId}
                  onValueChange={(companyId) => {
                    const company = companies.find(
                      (c: any) =>
                        String(c.id) === String(companyId) ||
                        String(c.PK) === String(companyId)
                    );
                    setFormData({
                      ...formData,
                      companyId,
                      companyName:
                        company?.name ||
                        company?.companyName ||
                        formData.companyName,
                    });
                    setHiringManager({});
                  }}
                  options={companyOptionsFromList(companies)}
                  placeholder="Select company…"
                  searchPlaceholder="Search companies…"
                />
              ) : (
                <p className="text-sm text-muted-foreground py-2">
                  {formData.companyName || 'No company linked'}
                </p>
              )}
            </div>

            <div>
              <Label>Contact / hiring manager</Label>
              <HiringManagerSelect
                companyId={formData.companyId || job.companyId}
                valueContactId={hiringManager.hiringManagerContactId}
                onChange={setHiringManager}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Primary client contact for this req (from company contacts).
              </p>
            </div>

            {job?.id ? (
              <OwnerSelect
                objectType="job"
                objectId={String(job.id)}
                persist
                hint="Trio teammate who owns this req — not the hiring manager."
              />
            ) : null}

            <div>
              <Label>Location</Label>
              <Input value={formData.location} onChange={(e) => setFormData({ ...formData, location: e.target.value })} />
            </div>

            <SalaryRangeFields
              value={formData.salaryRange}
              onChange={(salaryRange) => setFormData({ ...formData, salaryRange })}
            />

            <div id="edit-description">
              <Label className="mb-1.5 block">Description</Label>
              <JobDescriptionEditor
                value={formData.description}
                onChange={(description) =>
                  setFormData((prev) => ({ ...prev, description }))
                }
                autoFocus={focusDescription}
                minHeight={240}
              />
            </div>

            <div>
              <Label className="mb-1.5 block">Tags</Label>
              <p className="text-xs text-muted-foreground mb-1.5">
                Controlled tags. Auto-filled from title, description, and location on save.
              </p>
              <TagEditor
                value={formTags}
                onChange={setFormTags}
                objectType="job"
              />
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
          </div>

          <div className="flex shrink-0 justify-end gap-3 border-t bg-background px-6 py-4">
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
