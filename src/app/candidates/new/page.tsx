'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Upload, UserPlus, Loader2 } from 'lucide-react';

export default function NewCandidatePage() {
  const router = useRouter();
  const [isUploading, setIsUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    title: '',
    email: '',
    phone: '',
    location: '',
    linkedin_url: '',
    notes: '',
    skills: '',
    summary: '',
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleResumeUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const { parseResumeFile } = await import(
        '@/lib/candidates/resume-parse-client'
      );
      const { resume: parsed } = await parseResumeFile(file);
      setFormData({
        name: parsed.name || '',
        title: parsed.title || '',
        email: parsed.email || '',
        phone: parsed.phone || '',
        location: parsed.location || '',
        linkedin_url: parsed.linkedin || parsed.linkedin_url || '',
        notes: '',
        skills: Array.isArray(parsed.skills)
          ? parsed.skills.join(', ')
          : typeof parsed.skills === 'string'
            ? parsed.skills
            : '',
        summary: parsed.summary || '',
      });
      toast.success('Resume parsed successfully! Fields pre-filled.');
    } catch (err: any) {
      toast.error(err?.message || 'Upload failed');
    } finally {
      setIsUploading(false);
    }
  };

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name || !formData.email) {
      toast.error('Name and email are required');
      return;
    }

    setIsSubmitting(true);

    try {
      // Prepare payload for API
      const payload = {
        name: formData.name,
        email: formData.email,
        title: formData.title,
        phone: formData.phone,
        location: formData.location,
        linkedin_url: formData.linkedin_url,
        notes: formData.notes,
        skills: formData.skills,
        summary: formData.summary,
        status: 'identification',
        source: 'direct',
      };

      const res = await fetch('/api/candidate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (data.success || data.id) {
        toast.success('Candidate created successfully!');
        router.push('/dashboard/candidates');
      } else {
        toast.error(data.error || 'Failed to create candidate');
      }
    } catch (err) {
      toast.error('Failed to create candidate');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Add New Candidate</h1>

        {/* Resume Upload */}
        <div className="border-2 border-dashed border-muted-foreground/30 rounded-xl p-8 text-center mb-8 bg-white">
          {isUploading ? (
            <div className="flex items-center justify-center gap-2">
              <Loader2 className="h-6 w-6 animate-spin" />
              <span>Parsing resume...</span>
            </div>
          ) : (
            <>
              <Upload className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <Label htmlFor="resume" className="cursor-pointer block">
                <span className="text-lg font-medium">Upload Resume (PDF or DOCX)</span>
                <p className="text-sm text-muted-foreground mt-1">It will auto-fill the form below</p>
              </Label>
              <input
                ref={fileInputRef}
                id="resume"
                type="file"
                accept=".pdf,.docx"
                onChange={handleResumeUpload}
                className="hidden"
              />
            </>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-6 bg-white p-6 rounded-xl border">
          {/* Form fields pre-populated from resume */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Name *</Label>
              <Input 
                value={formData.name} 
                onChange={(e) => handleChange('name', e.target.value)} 
                placeholder="Full name"
                required 
              />
            </div>
            <div>
              <Label>Title</Label>
              <Input 
                value={formData.title} 
                onChange={(e) => handleChange('title', e.target.value)} 
                placeholder="Job title"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Email *</Label>
              <Input 
                type="email"
                value={formData.email} 
                onChange={(e) => handleChange('email', e.target.value)} 
                placeholder="email@example.com"
                required 
              />
            </div>
            <div>
              <Label>Phone</Label>
              <Input 
                value={formData.phone} 
                onChange={(e) => handleChange('phone', e.target.value)} 
                placeholder="(555) 123-4567"
              />
            </div>
          </div>

          <div>
            <Label>Location</Label>
            <Input 
              value={formData.location} 
              onChange={(e) => handleChange('location', e.target.value)} 
              placeholder="City, State"
            />
          </div>

          <div>
            <Label>LinkedIn</Label>
            <Input 
              value={formData.linkedin_url} 
              onChange={(e) => handleChange('linkedin_url', e.target.value)} 
              placeholder="https://linkedin.com/in/..."
            />
          </div>

          <div>
            <Label>Skills (comma-separated)</Label>
            <Input 
              value={formData.skills} 
              onChange={(e) => handleChange('skills', e.target.value)} 
              placeholder="React, TypeScript, Node.js, AWS"
            />
          </div>

          <div>
            <Label>Summary</Label>
            <Textarea 
              value={formData.summary} 
              onChange={(e) => handleChange('summary', e.target.value)} 
              placeholder="Brief summary..."
              rows={3}
            />
          </div>

          <div>
            <Label>Notes</Label>
            <Textarea 
              value={formData.notes} 
              onChange={(e) => handleChange('notes', e.target.value)} 
              placeholder="Additional notes..."
              rows={4}
            />
          </div>

          <Button type="submit" className="w-full" size="lg" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating...
              </>
            ) : (
              <>
                <UserPlus className="mr-2 h-4 w-4" /> Create Candidate
              </>
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}
