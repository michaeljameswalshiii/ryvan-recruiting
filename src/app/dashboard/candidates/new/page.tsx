'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Plus,
  Loader2,
  User,
  Briefcase,
  FileText,
  CheckCircle2,
  Upload,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { APPLICATION_STAGES } from '@/lib/schemas/lead';
import {
  clearResumeDraft,
  loadResumeDraft,
  mapParsedResumeToForm,
  mergeFormWithParsed,
  parseResumeFile,
  uploadResumeToS3 as directUploadResumeToS3,
} from '@/lib/candidates/resume-parse-client';
import { validateResumeFileClient } from '@/lib/candidates/resume-upload-limits';
import { TagEditor } from '@/components/shared/TagEditor';
import { DuplicateCandidateModal } from '@/components/candidate/DuplicateCandidateModal';
import {
  checkCandidateDuplicates,
  matchesFromCreateError,
  resolveDuplicateCandidate,
} from '@/lib/candidates/duplicate-client';
import type { DuplicateMatch } from '@/lib/candidates/duplicates';

const sourceOptions = [
  { value: 'manual', label: 'Manual Entry' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'referral', label: 'Referral' },
  { value: 'website', label: 'Website' },
  { value: 'indeed', label: 'Indeed' },
  { value: 'zip', label: 'Zip' },
  { value: 'job_board', label: 'Job Board' },
  { value: 'resume', label: 'Resume Upload' },
  { value: 'other', label: 'Other' },
];

const statusOptions = APPLICATION_STAGES.map((stage) => ({
  value: stage.value,
  label: stage.label,
}));

const emptyForm = {
  name: '',
  email: '',
  phone: '',
  location: '',
  title: '',
  status: 'sourced',
  source: 'manual',
  linkedin_url: '',
  resume_url: '',
  summary: '',
  skills: '',
  tags: '',
  salary_requirements: '',
};

export default function NewCandidatePage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [parseStatus, setParseStatus] = useState('');
  const [parsedFromResume, setParsedFromResume] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [resumeFileName, setResumeFileName] = useState('');
  const [formData, setFormData] = useState(emptyForm);
  const [dragActive, setDragActive] = useState(false);
  const dragDepthRef = useRef(0);
  const [dupMatches, setDupMatches] = useState<DuplicateMatch[]>([]);
  const [dupOpen, setDupOpen] = useState(false);
  const [dupResolving, setDupResolving] = useState(false);
  const allowDuplicateRef = useRef(false);
  const dismissedDupKey = useRef('');

  // Load draft from Candidates list resume upload
  useEffect(() => {
    const draft = loadResumeDraft();
    if (draft?.form) {
      const draftSkills = Array.isArray(draft.form.skills)
        ? draft.form.skills.join(', ')
        : draft.form.skills || '';
      const draftTags = Array.isArray(draft.form.tags)
        ? draft.form.tags.join(', ')
        : draft.form.tags || '';
      setFormData((prev) => ({
        ...prev,
        ...draft.form,
        skills: draftSkills,
        status: prev.status,
        source: draft.form.source || 'resume',
        tags: draftTags || prev.tags,
      }));
      setResumeFileName(draft.fileName || draft.form.resume_file_name || '');
      setParsedFromResume(true);

      if (typeof window !== 'undefined') {
        (window as any).__turnkeyParsedResumeStructured = {
          experience: draft.form.experience || [],
          education: draft.form.education || [],
          certifications: draft.form.certifications || [],
        };
        const pending = (window as any).__turnkeyPendingResumeFile;
        if (pending instanceof File) {
          setUploadedFile(pending);
        }
      }

      clearResumeDraft();
      toast.success('Resume data loaded — review and create the candidate');

      void checkForDuplicates({
        name: draft.form.name || '',
        email: draft.form.email || '',
        phone: draft.form.phone || '',
        title: draft.form.title || '',
        location: draft.form.location || '',
        linkedin_url: draft.form.linkedin_url || '',
        resume_file_name: draft.fileName || draft.form.resume_file_name || '',
        source: draft.form.source || 'resume',
        experience: draft.form.experience || [],
        education: draft.form.education || [],
      });
    }
  }, []);

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const structuredResume = () =>
    (typeof window !== 'undefined' &&
      (window as any).__turnkeyParsedResumeStructured) ||
    {};

  const buildCreatePayload = (opts?: { allowDuplicate?: boolean }) => {
    const structured = structuredResume();
    const payload: Record<string, unknown> = {
      name: formData.name.trim(),
      email: formData.email || undefined,
      phone: formData.phone || undefined,
      location: formData.location || undefined,
      title: formData.title || undefined,
      status: formData.status,
      source: formData.source,
      linkedin_url: formData.linkedin_url || undefined,
      resume_url: formData.resume_url || undefined,
      resume_file_name: resumeFileName || undefined,
      summary: formData.summary || undefined,
      salary_requirements: formData.salary_requirements || undefined,
      allowDuplicate: opts?.allowDuplicate === true || allowDuplicateRef.current,
    };

    if (formData.skills) {
      payload.skills = formData.skills
        .split(/[,;\n]/)
        .map((s) => s.trim())
        .filter(Boolean);
    }

    payload.tags = formData.tags
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);

    if (Array.isArray(structured.experience) && structured.experience.length) {
      payload.experience = structured.experience;
    }
    if (Array.isArray(structured.education) && structured.education.length) {
      payload.education = structured.education;
    }
    if (
      Array.isArray(structured.certifications) &&
      structured.certifications.length
    ) {
      payload.certifications = structured.certifications;
    }

    return payload;
  };

  const checkForDuplicates = async (
    incoming?: Record<string, unknown>,
    opts?: { forceOpen?: boolean }
  ) => {
    const payload = incoming || buildCreatePayload();
    const name = String(payload.name || '').trim();
    const email = String(payload.email || '').trim();
    const phone = String(payload.phone || '').trim();
    if (!name && !email && !phone) return [];
    const key = [name, email, phone].join('|').toLowerCase();
    try {
      const matches = await checkCandidateDuplicates({
        name,
        email,
        phone,
        title: String(payload.title || ''),
        location: String(payload.location || ''),
        linkedin_url: String(payload.linkedin_url || ''),
        resume_file_name: String(payload.resume_file_name || resumeFileName || ''),
        source: String(payload.source || formData.source || ''),
        experience: Array.isArray(payload.experience) ? payload.experience : [],
        education: Array.isArray(payload.education) ? payload.education : [],
      });
      setDupMatches(matches);
      if (
        matches.length &&
        (opts?.forceOpen || dismissedDupKey.current !== key)
      ) {
        setDupOpen(true);
      }
      return matches;
    } catch (err) {
      console.warn('[new candidate] duplicate check failed', err);
      return [];
    }
  };

  const finishOnCandidate = (candidateId?: string) => {
    if (typeof window !== 'undefined') {
      delete (window as any).__turnkeyPendingResumeFile;
      window.location.href = candidateId
        ? `/dashboard/candidates/${candidateId}`
        : '/dashboard/candidates';
    } else {
      router.push(
        candidateId ? `/dashboard/candidates/${candidateId}` : '/dashboard/candidates'
      );
    }
  };

  const attachResumeIfNeeded = async (candidateId: string) => {
    if (!uploadedFile || !candidateId) return;
    const resumeUrl = await uploadResumeToS3(candidateId);
    if (!resumeUrl) return;
    await fetch(`/api/data/leads/${candidateId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        resume_url: resumeUrl,
        resume_file_name: resumeFileName || uploadedFile.name,
      }),
    }).catch(() => null);
  };

  const handleResumeFile = async (file: File | null | undefined) => {
    if (!file) return;

    const validation = validateResumeFileClient(file);
    if (!validation.ok) {
      toast.error(validation.error);
      return;
    }

    setParsing(true);
    setParseStatus('Uploading resume…');
    setResumeFileName(file.name);

    try {
      const { resume, resumeUrl, fileKey } = await parseResumeFile(file, {
        onProgress: setParseStatus,
      });
      const mapped = mapParsedResumeToForm(resume, {
        resumeUrl: fileKey || resumeUrl || '',
        fileName: file.name,
      });

      setFormData((prev) =>
        mergeFormWithParsed(prev, {
          ...mapped,
          status: prev.status,
          source: 'resume',
        }) as typeof emptyForm
      );

      // Stash structured arrays for create payload
      (window as any).__turnkeyParsedResumeStructured = {
        experience: mapped.experience || [],
        education: mapped.education || [],
        certifications: mapped.certifications || [],
      };

      setUploadedFile(file);
      setParsedFromResume(true);
      const filled = [
        mapped.name && 'name',
        mapped.email && 'email',
        mapped.phone && 'phone',
        mapped.title && 'title',
        mapped.location && 'location',
        mapped.skills && 'skills',
        mapped.summary && 'summary',
        (mapped.experience?.length ?? 0) > 0 && 'experience',
      ].filter(Boolean);
      toast.success(
        filled.length
          ? `Resume parsed — filled ${filled.join(', ')}`
          : 'Resume parsed — review fields and edit as needed'
      );

      void checkForDuplicates({
        name: mapped.name || '',
        email: mapped.email || '',
        phone: mapped.phone || '',
        title: mapped.title || '',
        location: mapped.location || '',
        linkedin_url: mapped.linkedin_url || '',
        resume_file_name: file.name,
        source: 'resume',
        experience: mapped.experience || [],
        education: mapped.education || [],
      });
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || 'Failed to parse resume');
    } finally {
      setParsing(false);
      setParseStatus('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const uploadResumeToS3 = async (candidateId: string): Promise<string | null> => {
    if (!uploadedFile) return null;
    // If parse already stored a key on the form, reuse it
    if (formData.resume_url && !String(formData.resume_url).startsWith('http')) {
      return formData.resume_url;
    }
    try {
      const { s3Key } = await directUploadResumeToS3(uploadedFile, {
        candidateId,
      });
      return s3Key;
    } catch (err) {
      console.error('Failed to upload resume:', err);
      return null;
    }
  };

  const createCandidate = async (opts?: { allowDuplicate?: boolean }) => {
    if (!formData.name?.trim()) {
      toast.error('Name is required');
      return;
    }

    setLoading(true);

    try {
      const payload = buildCreatePayload(opts);

      if (!payload.allowDuplicate) {
        const matches = await checkForDuplicates(payload, { forceOpen: true });
        if (matches.length) {
          setLoading(false);
          return;
        }
      }

      const response = await fetch('/api/candidate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (response.status === 409) {
        const matches = matchesFromCreateError(data);
        if (matches?.length) {
          setDupMatches(matches);
          setDupOpen(true);
          setLoading(false);
          return;
        }
      }

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create candidate');
      }

      const candidateId = data.candidate?.id || data.id || data.lead?.id;

      if (uploadedFile && candidateId) {
        await attachResumeIfNeeded(candidateId);
        toast.success('Resume saved to candidate');
      }

      toast.success('Candidate created successfully');
      finishOnCandidate(candidateId);
    } catch (error: any) {
      console.error('Failed to create candidate:', error);
      toast.error(error.message || 'Failed to create candidate');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await createCandidate();
  };

  const handleAddAnyway = async () => {
    allowDuplicateRef.current = true;
    setDupOpen(false);
    await createCandidate({ allowDuplicate: true });
  };

  const handleMergeDuplicate = async (
    primary: 'existing' | 'incoming',
    match: DuplicateMatch
  ) => {
    if (!match?.candidateId) return;
    if (
      primary === 'incoming' &&
      !confirm(
        'The existing profile will be merged into this new record and then removed. Continue?'
      )
    ) {
      return;
    }
    setDupResolving(true);
    try {
      const incoming = buildCreatePayload({ allowDuplicate: true });
      const result = await resolveDuplicateCandidate({
        action: 'merge',
        primary,
        existingId: match.candidateId,
        incoming,
      });
      const candidateId = result.primaryId || result.candidate?.id;
      if (uploadedFile && candidateId) {
        await attachResumeIfNeeded(candidateId);
      }
      toast.success(
        primary === 'existing'
          ? 'Merged into the existing profile'
          : 'Merged into the new profile'
      );
      finishOnCandidate(candidateId);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to merge candidates');
    } finally {
      setDupResolving(false);
    }
  };

  // Dark form panels: ThemeProvider [data-dark-form-panel] forces white copy last
  const darkFormCard =
    "border-border bg-card text-card-foreground " +
    "dark:border-slate-600 dark:bg-slate-900";

  // Compact fields so Basic + Additional + Create fit without scrolling
  const fieldInputClass = "mt-0.5 h-9";
  const fieldSelectClass =
    "mt-0.5 flex h-9 w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm";
  const fieldLabelClass = "text-xs font-medium";

  return (
    <div className="mx-auto max-w-6xl p-3 sm:p-4">
      <div className="mb-3 flex items-center gap-3">
        <Link href="/dashboard/candidates">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="min-w-0">
          <h1 className="text-xl font-bold leading-tight text-foreground">
            Add New Candidate
          </h1>
          <p className="text-xs text-muted-foreground">
            Upload a resume to auto-fill fields, then create the candidate
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        {/*
          2×2 layout (desktop), compact cards:
          [ Upload Resume ] [ Basic Information ]
          [ Pipeline      ] [ Additional         ]
        */}
        <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-2">
          {/* Top-left: Resume upload first — always light surface + dark ink */}
          <Card
            data-ink-on-light
            className="border-2 border-blue-300 !bg-blue-50 text-slate-900 shadow-sm"
            style={{
              backgroundColor: '#eff6ff',
              color: '#0f172a',
              WebkitTextFillColor: '#0f172a',
            }}
          >
            <CardHeader className="space-y-0 p-3 pb-1.5">
              <CardTitle
                className="flex items-center gap-1.5 text-sm !text-slate-900"
                style={{ color: '#0f172a', WebkitTextFillColor: '#0f172a' }}
              >
                <Upload className="h-4 w-4 text-blue-700" style={{ color: '#1d4ed8' }} />
                Upload Resume (auto-fills form)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 p-3 pt-1.5">
              <p
                className="text-xs !text-slate-700"
                style={{ color: '#334155', WebkitTextFillColor: '#334155' }}
              >
                PDF or Word — fills name, email, phone, title, location, LinkedIn, skills &amp; summary. Scanned or image-based PDFs are read with OCR.
              </p>

              <input
                ref={fileInputRef}
                id="resume-file-input"
                type="file"
                accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                className="hidden"
                disabled={parsing}
                onChange={(e) => handleResumeFile(e.target.files?.[0])}
              />

              <div
                role="button"
                tabIndex={0}
                aria-label="Upload resume by clicking or dragging a file"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    if (!parsing) fileInputRef.current?.click();
                  }
                }}
                onClick={() => {
                  if (!parsing) fileInputRef.current?.click();
                }}
                onDragEnter={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  dragDepthRef.current += 1;
                  setDragActive(true);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
                  setDragActive(true);
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
                  if (dragDepthRef.current === 0) setDragActive(false);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  dragDepthRef.current = 0;
                  setDragActive(false);
                  if (parsing) return;
                  const file = e.dataTransfer.files?.[0];
                  if (file) void handleResumeFile(file);
                }}
                className={`rounded-lg border-2 border-dashed px-3 py-4 text-center transition-colors cursor-pointer ${
                  dragActive
                    ? 'border-blue-500 bg-blue-100 ring-2 ring-blue-200'
                    : 'border-blue-300 bg-white hover:border-blue-400 hover:bg-blue-50'
                } ${parsing ? 'pointer-events-none opacity-70' : ''}`}
                style={{
                  backgroundColor: dragActive ? '#dbeafe' : '#ffffff',
                  color: '#0f172a',
                }}
              >
                {parsing ? (
                  <div
                    className="flex flex-col items-center gap-1.5"
                    style={{ color: '#0f172a' }}
                  >
                    <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
                    <p className="text-sm font-medium" style={{ color: '#0f172a' }}>
                      {parseStatus || 'Parsing resume…'}
                    </p>
                    {resumeFileName && (
                      <p className="text-xs" style={{ color: '#475569' }}>
                        {resumeFileName}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <div
                      className={`rounded-full p-2 ${
                        dragActive ? 'bg-blue-200' : 'bg-blue-100'
                      }`}
                    >
                      <Upload className="h-5 w-5 text-blue-700" />
                    </div>
                    <div>
                      <p
                        className="text-sm font-medium"
                        style={{ color: '#0f172a', WebkitTextFillColor: '#0f172a' }}
                      >
                        {dragActive
                          ? 'Drop resume to upload'
                          : 'Drag & drop resume here'}
                      </p>
                      <p
                        className="mt-0.5 text-xs"
                        style={{ color: '#475569', WebkitTextFillColor: '#475569' }}
                      >
                        PDF, DOC, or DOCX — or click to browse
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      disabled={parsing}
                      data-ink-keep
                      onClick={(e) => {
                        e.stopPropagation();
                        fileInputRef.current?.click();
                      }}
                      className="h-8 bg-blue-600 text-xs hover:bg-blue-700 text-white"
                    >
                      <Upload className="mr-1.5 h-3.5 w-3.5" />
                      Choose Resume File
                    </Button>
                    {resumeFileName && (
                      <p className="text-xs" style={{ color: '#475569' }}>
                        File: {resumeFileName}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {parsedFromResume && (
                <div className="flex items-start gap-1.5 rounded-md border border-green-200 bg-green-50 px-2.5 py-1.5 text-xs text-green-800">
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <p className="font-medium">
                    Resume data applied — review fields and click Create.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Top-right: Basic Information — tight, no dead space */}
          <Card data-dark-form-panel data-dark-panel className={darkFormCard}>
            <CardHeader className="space-y-0 p-3 pb-1.5">
              <CardTitle className="flex items-center gap-1.5 text-sm text-inherit">
                <User className="h-4 w-4" />
                Basic Information
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-1.5">
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Label htmlFor="name" className={fieldLabelClass}>
                    Name <span className="text-red-400">*</span>
                  </Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => handleChange('name', e.target.value)}
                    required
                    className={fieldInputClass}
                    placeholder="Full name"
                  />
                </div>
                <div>
                  <Label htmlFor="title" className={fieldLabelClass}>Title</Label>
                  <Input
                    id="title"
                    value={formData.title}
                    onChange={(e) => handleChange('title', e.target.value)}
                    className={fieldInputClass}
                    placeholder="From resume or type title"
                  />
                </div>
                <div>
                  <Label htmlFor="location" className={fieldLabelClass}>Location</Label>
                  <Input
                    id="location"
                    value={formData.location}
                    onChange={(e) => handleChange('location', e.target.value)}
                    className={fieldInputClass}
                    placeholder="City, ST"
                  />
                </div>
                <div>
                  <Label htmlFor="email" className={fieldLabelClass}>Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => handleChange('email', e.target.value)}
                    className={fieldInputClass}
                  />
                </div>
                <div>
                  <Label htmlFor="phone" className={fieldLabelClass}>Phone</Label>
                  <Input
                    id="phone"
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => handleChange('phone', e.target.value)}
                    className={fieldInputClass}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Bottom-left: Pipeline */}
          <Card data-dark-form-panel data-dark-panel className={darkFormCard}>
            <CardHeader className="space-y-0 p-3 pb-1.5">
              <CardTitle className="flex items-center gap-1.5 text-sm text-inherit">
                <Briefcase className="h-4 w-4" />
                Pipeline Information
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-1.5">
              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <Label htmlFor="status" className={fieldLabelClass}>Status</Label>
                  <select
                    id="status"
                    value={formData.status}
                    onChange={(e) => handleChange('status', e.target.value)}
                    className={fieldSelectClass}
                  >
                    {statusOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label htmlFor="source" className={fieldLabelClass}>Source</Label>
                  <select
                    id="source"
                    value={formData.source}
                    onChange={(e) => handleChange('source', e.target.value)}
                    className={fieldSelectClass}
                  >
                    {sourceOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Bottom-right: Additional */}
          <Card data-dark-form-panel data-dark-panel className={darkFormCard}>
            <CardHeader className="space-y-0 p-3 pb-1.5">
              <CardTitle className="flex items-center gap-1.5 text-sm text-inherit">
                <FileText className="h-4 w-4" />
                Additional Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 p-3 pt-1.5">
              <div>
                <Label htmlFor="linkedin_url" className={fieldLabelClass}>LinkedIn URL</Label>
                <Input
                  id="linkedin_url"
                  value={formData.linkedin_url}
                  onChange={(e) => handleChange('linkedin_url', e.target.value)}
                  className={fieldInputClass}
                />
              </div>
              <div>
                <Label htmlFor="skills" className={fieldLabelClass}>Skills</Label>
                <textarea
                  id="skills"
                  value={formData.skills}
                  onChange={(e) => handleChange('skills', e.target.value)}
                  className="mt-0.5 min-h-[72px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  placeholder="Comma-separated or one skill per line"
                  rows={3}
                />
                <p className="mt-1 text-xs text-slate-500">
                  Pulled from the resume skills section plus role tools (not a generic tech keyword scan).
                </p>
              </div>
              <div>
                <Label className={fieldLabelClass}>Candidate Tags</Label>
                <div className="mt-0.5">
                  <TagEditor
                    value={formData.tags
                      .split(',')
                      .map((tag) => tag.trim())
                      .filter(Boolean)}
                    onChange={(next) => handleChange('tags', next.join(', '))}
                    objectType="candidate"
                    placeholder="e.g., Construction, Project Manager"
                  />
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  From the controlled taxonomy (title, industry, and skills) — not random keywords. Edit before creating.
                </p>
              </div>
              <div>
                <Label htmlFor="summary" className={fieldLabelClass}>Summary</Label>
                <textarea
                  id="summary"
                  value={formData.summary}
                  onChange={(e) => handleChange('summary', e.target.value)}
                  className="mt-0.5 min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  placeholder="Candidate summary from the resume"
                  rows={5}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="mt-3 flex justify-end gap-2 border-t border-border/60 pt-3">
          <Link href="/dashboard/candidates">
            <Button variant="outline" type="button" size="sm">
              Cancel
            </Button>
          </Link>
          <Button type="submit" size="sm" disabled={loading || parsing}>
            {loading ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Create Candidate
              </>
            )}
          </Button>
        </div>
      </form>

      <DuplicateCandidateModal
        open={dupOpen}
        matches={dupMatches}
        resolving={dupResolving}
        onClose={() => {
          const payload = buildCreatePayload();
          dismissedDupKey.current = [
            String(payload.name || ''),
            String(payload.email || ''),
            String(payload.phone || ''),
          ]
            .join('|')
            .toLowerCase();
          setDupOpen(false);
        }}
        onAddAnyway={() => void handleAddAnyway()}
        onMerge={(primary, match) => void handleMergeDuplicate(primary, match)}
      />
    </div>
  );
}
