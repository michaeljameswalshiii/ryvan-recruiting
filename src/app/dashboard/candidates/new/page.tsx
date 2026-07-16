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
  parseResumeFile,
} from '@/lib/candidates/resume-parse-client';

const sourceOptions = [
  { value: 'manual', label: 'Manual Entry' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'referral', label: 'Referral' },
  { value: 'website', label: 'Website' },
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
  notes: '',
  linkedin_url: '',
  resume_url: '',
  summary: '',
  skills: '',
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
      }));
      setResumeFileName(draft.fileName || draft.form.resume_file_name || '');
      setParsedFromResume(true);

      const pending = (window as any).__turnkeyPendingResumeFile;
      if (pending instanceof File) {
        setUploadedFile(pending);
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

      setFormData((prev) => ({
        ...prev,
        ...mapped,
        status: prev.status,
        // keep user-edited fields only if parse left them empty
        name: mapped.name || prev.name,
        title: mapped.title || prev.title,
        email: mapped.email || prev.email,
        phone: mapped.phone || prev.phone,
        location: mapped.location || prev.location,
        linkedin_url: mapped.linkedin_url || prev.linkedin_url,
        summary: mapped.summary || prev.summary,
        skills: mapped.skills || prev.skills,
        notes: mapped.notes || prev.notes,
        resume_url: mapped.resume_url || prev.resume_url,
        source: 'resume',
      }));

      setUploadedFile(file);
      setParsedFromResume(true);
      toast.success('Resume parsed — form fields updated');
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
      const payload: Record<string, unknown> = {
        name: formData.name.trim(),
        email: formData.email || undefined,
        phone: formData.phone || undefined,
        location: formData.location || undefined,
        title: formData.title || undefined,
        status: formData.status,
        source: formData.source,
        notes: formData.notes || undefined,
        linkedin_url: formData.linkedin_url || undefined,
        resume_url: formData.resume_url || undefined,
        summary: formData.summary || undefined,
      };

      if (formData.skills) {
        payload.skills = formData.skills
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
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

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <Link href="/dashboard/candidates">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Add New Candidate</h1>
          <p className="text-sm text-muted-foreground">
            Upload a resume to auto-fill fields, then create the candidate
          </p>
        </div>
      </div>

      {/* Resume upload — click or drag-and-drop */}
      <Card className="mb-8 border-2 border-blue-200 bg-blue-50/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-blue-950">
            <Upload className="h-5 w-5" />
            Upload Resume (auto-fills form)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Drag and drop a PDF or Word document, or choose a file. Parsing fills name, email,
            phone, title, location, LinkedIn, skills, and summary below.
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
                ? 'border-blue-500 bg-blue-100/80 ring-2 ring-blue-200'
                : 'border-blue-300 bg-white/70 hover:border-blue-400 hover:bg-blue-50/80'
            } ${parsing ? 'pointer-events-none opacity-70' : ''}`}
          >
            {parsing ? (
              <div className="flex flex-col items-center gap-2 text-blue-900">
                <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
                <p className="font-medium">Parsing resume…</p>
                {resumeFileName && (
                  <p className="text-sm text-muted-foreground">{resumeFileName}</p>
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
                  <p className="font-medium text-blue-950">
                    {dragActive
                      ? 'Drop resume to upload'
                      : 'Drag & drop resume here'}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    PDF, DOC, or DOCX — or click to browse
                  </p>
                </div>
                <Button
                  type="button"
                  disabled={parsing}
                  onClick={(e) => {
                    e.stopPropagation();
                    fileInputRef.current?.click();
                  }}
                  className="bg-blue-600 hover:bg-blue-700 mt-1"
                >
                  <Upload className="mr-2 h-4 w-4" />
                  Choose Resume File
                </Button>
                {resumeFileName && (
                  <p className="text-sm text-muted-foreground">
                    File: {resumeFileName}
                  </p>
                )}
              </div>
            )}
          </div>

          {parsedFromResume && (
            <div className="flex items-start gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
              <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">Resume data applied — review the form and click Create.</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <form onSubmit={handleSubmit}>
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Basic Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="md:col-span-2">
                  <Label htmlFor="name">
                    Name <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => handleChange('name', e.target.value)}
                    required
                    className="mt-1"
                    placeholder="Full name"
                  />
                </div>
                <div>
                  <Label htmlFor="title">Title</Label>
                  <Input
                    id="title"
                    value={formData.title}
                    onChange={(e) => handleChange('title', e.target.value)}
                    className="mt-1"
                    placeholder="e.g., Software Engineer"
                  />
                </div>
                <div>
                  <Label htmlFor="location">Location</Label>
                  <Input
                    id="location"
                    value={formData.location}
                    onChange={(e) => handleChange('location', e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => handleChange('email', e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => handleChange('phone', e.target.value)}
                    className="mt-1"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Briefcase className="h-5 w-5" />
                Pipeline Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label htmlFor="status">Status</Label>
                  <select
                    id="status"
                    value={formData.status}
                    onChange={(e) => handleChange('status', e.target.value)}
                    className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
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
                    className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
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

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
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
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="skills">Skills</Label>
                <Input
                  id="skills"
                  value={formData.skills}
                  onChange={(e) => handleChange('skills', e.target.value)}
                  className="mt-1"
                  placeholder="Comma-separated"
                />
              </div>
              <div>
                <Label htmlFor="summary">Summary</Label>
                <textarea
                  id="summary"
                  value={formData.summary}
                  onChange={(e) => handleChange('summary', e.target.value)}
                  className="mt-1 min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
              <div>
                <Label htmlFor="notes">Notes</Label>
                <textarea
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => handleChange('notes', e.target.value)}
                  className="mt-1 min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end gap-3">
            <Link href="/dashboard/candidates">
              <Button variant="outline" type="button">
                Cancel
              </Button>
            </Link>
            <Button type="submit" disabled={loading || parsing}>
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Candidate
                </>
              )}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
