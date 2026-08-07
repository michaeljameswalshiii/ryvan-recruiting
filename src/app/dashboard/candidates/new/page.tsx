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
} from '@/lib/candidates/resume-parse-client';

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
  const [parsedFromResume, setParsedFromResume] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [resumeFileName, setResumeFileName] = useState('');
  const [formData, setFormData] = useState(emptyForm);
  const [dragActive, setDragActive] = useState(false);
  const dragDepthRef = useRef(0);

  // Load draft from Candidates list resume upload
  useEffect(() => {
    const draft = loadResumeDraft();
    if (draft?.form) {
      setFormData((prev) => ({
        ...prev,
        ...draft.form,
        status: prev.status,
        source: draft.form.source || 'resume',
        tags: prev.tags,
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
    }
  }, []);

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleResumeFile = async (file: File | null | undefined) => {
    if (!file) return;

    const lower = file.name.toLowerCase();
    const ok =
      lower.endsWith('.pdf') ||
      lower.endsWith('.doc') ||
      lower.endsWith('.docx') ||
      file.type.includes('pdf') ||
      file.type.includes('word') ||
      file.type.includes('officedocument');

    if (!ok) {
      toast.error('Please upload a PDF or Word file (.pdf, .doc, .docx)');
      return;
    }

    setParsing(true);
    setResumeFileName(file.name);

    try {
      const { resume, resumeUrl, fileKey } = await parseResumeFile(file);
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
        mapped.skills && 'skills',
        mapped.summary && 'summary',
        (mapped.experience?.length ?? 0) > 0 && 'experience',
      ].filter(Boolean);
      toast.success(
        filled.length
          ? `Resume parsed — filled ${filled.join(', ')}`
          : 'Resume parsed — review fields and edit as needed'
      );
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || 'Failed to parse resume');
    } finally {
      setParsing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const uploadResumeToS3 = async (candidateId: string): Promise<string | null> => {
    if (!uploadedFile) return null;

    const formDataObj = new FormData();
    formDataObj.append('resume', uploadedFile);
    formDataObj.append('candidateId', candidateId);

    try {
      const res = await fetch('/api/parse-resume', {
        method: 'POST',
        body: formDataObj,
      });
      const data = await res.json();
      if (data.fileKey || data.resumeUrl) return data.fileKey || data.resumeUrl;

      const uploadRes = await fetch('/api/upload-resume', {
        method: 'POST',
        body: formDataObj,
      });
      const uploadData = await uploadRes.json();
      return uploadData.resumeUrl || uploadData.fileKey || null;
    } catch (err) {
      console.error('Failed to upload resume:', err);
      return null;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name?.trim()) {
      toast.error('Name is required');
      return;
    }

    setLoading(true);

    try {
      const structured =
        (typeof window !== 'undefined' &&
          (window as any).__turnkeyParsedResumeStructured) ||
        {};

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
        summary: formData.summary || undefined,
        salary_requirements: formData.salary_requirements || undefined,
      };

      if (formData.skills) {
        payload.skills = formData.skills
          .split(',')
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

      const response = await fetch('/api/candidate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create candidate');
      }

      const candidateId = data.candidate?.id || data.id || data.lead?.id;

      if (uploadedFile && candidateId) {
        const resumeUrl = await uploadResumeToS3(candidateId);
        if (resumeUrl) {
          await fetch(`/api/data/leads/${candidateId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              resume_url: resumeUrl,
              resume_file_name: resumeFileName || uploadedFile.name,
            }),
          }).catch(() => null);
          toast.success('Resume saved to candidate');
        }
      }

      if (typeof window !== 'undefined') {
        delete (window as any).__turnkeyPendingResumeFile;
      }

      toast.success('Candidate created successfully');
      // Hard navigation so the list page always reloads (avoids stale React Query cache)
      if (typeof window !== 'undefined') {
        window.location.href = candidateId
          ? `/dashboard/candidates/${candidateId}`
          : '/dashboard/candidates';
      } else {
        router.push(
          candidateId ? `/dashboard/candidates/${candidateId}` : '/dashboard/candidates'
        );
      }
    } catch (error: any) {
      console.error('Failed to create candidate:', error);
      toast.error(error.message || 'Failed to create candidate');
    } finally {
      setLoading(false);
    }
  };

  // Dark form panels: ThemeProvider [data-dark-form-panel] forces white copy last
  const darkFormCard =
    "border-border bg-card text-card-foreground " +
    "dark:border-slate-600 dark:bg-slate-900";

  const fieldInputClass = "mt-1";
  const fieldSelectClass =
    "mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm";

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <Link href="/dashboard/candidates">
          <Button
            variant="ghost"
            size="icon"
            className="text-foreground"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            Add New Candidate
          </h1>
          <p className="text-sm text-muted-foreground">
            Upload a resume to auto-fill fields, then create the candidate
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        {/*
          2×2 layout (desktop):
          [ Upload Resume ] [ Basic Information ]
          [ Pipeline      ] [ Additional         ]
        */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
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
            <CardHeader>
              <CardTitle
                className="flex items-center gap-2 !text-slate-900"
                style={{ color: '#0f172a', WebkitTextFillColor: '#0f172a' }}
              >
                <Upload className="h-5 w-5 text-blue-700" style={{ color: '#1d4ed8' }} />
                Upload Resume (auto-fills form)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p
                className="text-sm !text-slate-700"
                style={{ color: '#334155', WebkitTextFillColor: '#334155' }}
              >
                Drag and drop a PDF or Word document, or choose a file. Parsing
                fills name, email, phone, title, location, LinkedIn, skills, and
                summary.
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
                className={`rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors cursor-pointer ${
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
                    className="flex flex-col items-center gap-2"
                    style={{ color: '#0f172a' }}
                  >
                    <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
                    <p className="font-medium" style={{ color: '#0f172a' }}>
                      Parsing resume…
                    </p>
                    {resumeFileName && (
                      <p className="text-sm" style={{ color: '#475569' }}>
                        {resumeFileName}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3">
                    <div
                      className={`rounded-full p-3 ${
                        dragActive ? 'bg-blue-200' : 'bg-blue-100'
                      }`}
                    >
                      <Upload className="h-7 w-7 text-blue-700" />
                    </div>
                    <div>
                      <p
                        className="font-medium"
                        style={{ color: '#0f172a', WebkitTextFillColor: '#0f172a' }}
                      >
                        {dragActive
                          ? 'Drop resume to upload'
                          : 'Drag & drop resume here'}
                      </p>
                      <p
                        className="mt-1 text-sm"
                        style={{ color: '#475569', WebkitTextFillColor: '#475569' }}
                      >
                        PDF, DOC, or DOCX — or click to browse
                      </p>
                    </div>
                    <Button
                      type="button"
                      disabled={parsing}
                      data-ink-keep
                      onClick={(e) => {
                        e.stopPropagation();
                        fileInputRef.current?.click();
                      }}
                      className="mt-1 bg-blue-600 hover:bg-blue-700 text-white"
                    >
                      <Upload className="mr-2 h-4 w-4" />
                      Choose Resume File
                    </Button>
                    {resumeFileName && (
                      <p className="text-sm" style={{ color: '#475569' }}>
                        File: {resumeFileName}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {parsedFromResume && (
                <div className="flex items-start gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
                  <p className="font-medium">
                    Resume data applied — review the form and click Create.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Top-right: Basic Information */}
          <Card data-dark-form-panel data-dark-panel className={darkFormCard}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-inherit">
                <User className="h-5 w-5" />
                Basic Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Label htmlFor="name">
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
                  <Label htmlFor="title">Title</Label>
                  <Input
                    id="title"
                    value={formData.title}
                    onChange={(e) => handleChange('title', e.target.value)}
                    className={fieldInputClass}
                    placeholder="e.g., Software Engineer"
                  />
                </div>
                <div>
                  <Label htmlFor="location">Location</Label>
                  <Input
                    id="location"
                    value={formData.location}
                    onChange={(e) => handleChange('location', e.target.value)}
                    className={fieldInputClass}
                    placeholder="Boca Raton, FL"
                  />
                </div>
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => handleChange('email', e.target.value)}
                    className={fieldInputClass}
                  />
                </div>
                <div>
                  <Label htmlFor="phone">Phone</Label>
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
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-inherit">
                <Briefcase className="h-5 w-5" />
                Pipeline Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="status">Status</Label>
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
                  <Label htmlFor="source">Source</Label>
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
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-inherit">
                <FileText className="h-5 w-5" />
                Additional Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="linkedin_url">LinkedIn URL</Label>
                <Input
                  id="linkedin_url"
                  value={formData.linkedin_url}
                  onChange={(e) => handleChange('linkedin_url', e.target.value)}
                  className={fieldInputClass}
                />
              </div>
              <div>
                <Label htmlFor="skills">Skills</Label>
                <Input
                  id="skills"
                  value={formData.skills}
                  onChange={(e) => handleChange('skills', e.target.value)}
                  className={fieldInputClass}
                  placeholder="Comma-separated"
                />
              </div>
              <div>
                <Label htmlFor="tags">Candidate Tags</Label>
                <Input
                  id="tags"
                  value={formData.tags}
                  onChange={(e) => handleChange('tags', e.target.value)}
                  className={fieldInputClass}
                  placeholder="e.g., Industrial, Local, Top prospect"
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Separate tags with commas. Tags appear on the candidate profile.
                </p>
              </div>
              <div>
                <Label htmlFor="summary">Summary</Label>
                <textarea
                  id="summary"
                  value={formData.summary}
                  onChange={(e) => handleChange('summary', e.target.value)}
                  className="mt-1 min-h-[72px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  placeholder="Short ATS-friendly blurb (~20 words). Filled from resume when uploaded."
                  rows={3}
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Keep it under ~20 words for ATS (role + strengths + keywords).
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <Link href="/dashboard/candidates">
            <Button variant="outline" type="button">
              Cancel
            </Button>
          </Link>
          <Button type="submit" disabled={loading || parsing}>
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Plus className="mr-2 h-4 w-4" />
                Create Candidate
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
