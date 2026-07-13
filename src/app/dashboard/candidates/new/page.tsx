'use client';

import { useState } from 'react';
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
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { APPLICATION_STAGES } from '@/lib/schemas/lead';
import { ResumeUpload } from '@/components/candidate/ResumeUpload';

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

function skillsToNotes(skills: unknown): string {
  if (!skills) return '';
  if (Array.isArray(skills)) return skills.filter(Boolean).join(', ');
  if (typeof skills === 'string') return skills;
  return '';
}

export default function NewCandidatePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [parsedFromResume, setParsedFromResume] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [resumeFileName, setResumeFileName] = useState('');

  const [formData, setFormData] = useState({
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
    skills: '' as string,
  });

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const applyParsedResume = (parsed: any, file?: File | null, resumeUrl?: string) => {
    if (!parsed) return;

    const skillsText = skillsToNotes(parsed.skills);
    const summary = typeof parsed.summary === 'string' ? parsed.summary : '';
    const notesParts = [
      summary ? `Summary:\n${summary}` : '',
      skillsText ? `Skills: ${skillsText}` : '',
    ].filter(Boolean);

    setFormData((prev) => ({
      ...prev,
      name: parsed.name || prev.name,
      title: parsed.title || prev.title,
      email: parsed.email || prev.email,
      phone: parsed.phone || prev.phone,
      location: parsed.location || parsed.fullAddress || prev.location,
      linkedin_url: parsed.linkedin || parsed.linkedin_url || prev.linkedin_url,
      summary: summary || prev.summary,
      skills: skillsText || prev.skills,
      notes: notesParts.length ? notesParts.join('\n\n') : prev.notes,
      resume_url: resumeUrl || prev.resume_url,
      source: prev.source === 'manual' ? 'resume' : prev.source,
    }));

    if (file) {
      setUploadedFile(file);
      setResumeFileName(file.name);
    } else if (parsed._file instanceof File) {
      setUploadedFile(parsed._file);
      setResumeFileName(parsed._file.name);
    } else if (typeof resumeUrl === 'string' && resumeUrl) {
      setResumeFileName(resumeUrl);
    }

    setParsedFromResume(true);
  };

  const handleResumeParsed = (resumeUrl: string, parsedData?: any) => {
    const file = parsedData?._file instanceof File ? parsedData._file : null;
    applyParsedResume(parsedData, file, resumeUrl || parsedData?._resumeUrl || parsedData?._fileKey);
  };

  const uploadResumeToS3 = async (candidateId: string): Promise<string | null> => {
    if (!uploadedFile) return null;

    const formDataObj = new FormData();
    formDataObj.append('resume', uploadedFile);
    formDataObj.append('candidateId', candidateId);

    try {
      // Prefer parse-resume which can also store to S3 when candidateId is set
      const res = await fetch('/api/parse-resume', {
        method: 'POST',
        body: formDataObj,
      });
      const data = await res.json();
      if (data.fileKey || data.resumeUrl) {
        return data.fileKey || data.resumeUrl;
      }

      // Fallback dedicated upload endpoint
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
          toast.success('Resume uploaded successfully!');
        }
      }

      toast.success('Candidate created successfully');
      if (candidateId) {
        router.push(`/dashboard/candidates/${candidateId}`);
      } else {
        router.push('/dashboard/candidates');
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
            Upload a resume to auto-fill, or enter details manually
          </p>
        </div>
      </div>

      {/* Resume Upload — primary create path */}
      <Card className="mb-8 border-blue-200 bg-blue-50/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Upload Resume to Auto-Fill
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Drop a PDF/DOCX (or paste a Google Doc link). We&apos;ll parse name, title, email,
            phone, location, LinkedIn, skills, and summary into the form below.
          </p>

          <ResumeUpload
            buttonText="Parse Resume & Fill Form"
            onSuccess={handleResumeParsed}
            onError={(msg) => toast.error(msg)}
          />

          {parsedFromResume && (
            <div className="flex items-start gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
              <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">Resume parsed — review the fields below, then create.</p>
                {resumeFileName && (
                  <p className="text-xs mt-1 opacity-80">File: {resumeFileName}</p>
                )}
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
                    placeholder="Full name"
                    value={formData.name}
                    onChange={(e) => handleChange('name', e.target.value)}
                    required
                    className="mt-1"
                  />
                </div>

                <div>
                  <Label htmlFor="title">Title</Label>
                  <Input
                    id="title"
                    placeholder="e.g., Software Engineer"
                    value={formData.title}
                    onChange={(e) => handleChange('title', e.target.value)}
                    className="mt-1"
                  />
                </div>

                <div>
                  <Label htmlFor="location">Location</Label>
                  <Input
                    id="location"
                    placeholder="e.g., San Francisco, CA"
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
                    placeholder="email@example.com"
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
                    placeholder="(555) 123-4567"
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
              <div className="grid gap-4 md:grid-cols-2">
                <div className="md:col-span-2">
                  <Label htmlFor="linkedin_url">LinkedIn URL</Label>
                  <Input
                    id="linkedin_url"
                    placeholder="https://linkedin.com/in/..."
                    value={formData.linkedin_url}
                    onChange={(e) => handleChange('linkedin_url', e.target.value)}
                    className="mt-1"
                  />
                </div>

                <div className="md:col-span-2">
                  <Label htmlFor="skills">Skills</Label>
                  <Input
                    id="skills"
                    placeholder="Comma-separated skills from resume"
                    value={formData.skills}
                    onChange={(e) => handleChange('skills', e.target.value)}
                    className="mt-1"
                  />
                </div>

                <div className="md:col-span-2">
                  <Label htmlFor="summary">Summary</Label>
                  <textarea
                    id="summary"
                    placeholder="Professional summary from resume"
                    value={formData.summary}
                    onChange={(e) => handleChange('summary', e.target.value)}
                    className="mt-1 min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                </div>

                <div className="md:col-span-2">
                  <Label htmlFor="resume_url">Resume URL / S3 key</Label>
                  <Input
                    id="resume_url"
                    placeholder="Filled after parse/upload, or paste a URL"
                    value={formData.resume_url}
                    onChange={(e) => handleChange('resume_url', e.target.value)}
                    className="mt-1"
                  />
                </div>

                <div className="md:col-span-2">
                  <Label htmlFor="notes">Notes</Label>
                  <textarea
                    id="notes"
                    placeholder="Add any notes about this candidate..."
                    value={formData.notes}
                    onChange={(e) => handleChange('notes', e.target.value)}
                    className="mt-1 min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end gap-3">
            <Link href="/dashboard/candidates">
              <Button variant="outline" type="button">
                Cancel
              </Button>
            </Link>
            <Button type="submit" disabled={loading}>
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
