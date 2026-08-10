'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileText, Loader2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import {
  mapParsedResumeToForm,
  parseResumeFile,
  saveResumeDraft,
} from '@/lib/candidates/resume-parse-client';
import { validateResumeFileClient } from '@/lib/candidates/resume-upload-limits';

/**
 * Always-visible resume upload used from the Candidates list.
 * Parses the file, stores draft fields, then routes to create page.
 */
export function ResumeCreateCard() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [parsing, setParsing] = useState(false);
  const [fileName, setFileName] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const dragDepthRef = useRef(0);

  const onFile = async (file: File | null | undefined) => {
    if (!file) return;

    const validation = validateResumeFileClient(file);
    if (!validation.ok) {
      toast.error(validation.error);
      return;
    }

    setFileName(file.name);
    setParsing(true);

    try {
      const { resume, resumeUrl, fileKey } = await parseResumeFile(file);
      const form = mapParsedResumeToForm(resume, {
        resumeUrl: fileKey || resumeUrl || '',
        fileName: file.name,
      });

      // Keep file bytes only in memory via create page re-select if needed;
      // we store parsed fields for autofill.
      saveResumeDraft({
        form: {
          ...form,
          // stash raw file metadata for create page messaging
          resume_file_name: file.name,
        },
        fileName: file.name,
        savedAt: new Date().toISOString(),
      });

      // Also stash the File in a global so create page can upload after save
      if (typeof window !== 'undefined') {
        (window as any).__turnkeyPendingResumeFile = file;
      }

      toast.success('Resume parsed — review details on the next screen');
      router.push('/dashboard/candidates/new?fromResume=1');
    } catch (err: any) {
      console.error('[ResumeCreateCard]', err);
      toast.error(err?.message || 'Failed to parse resume');
    } finally {
      setParsing(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div
      data-ink-on-light
      className={`mb-8 rounded-xl border-2 border-dashed p-6 transition-colors ${
        dragActive
          ? 'border-blue-500 bg-blue-100 ring-2 ring-blue-200'
          : 'border-blue-300 bg-blue-50'
      } ${parsing ? 'opacity-80' : ''}`}
      style={{
        backgroundColor: dragActive ? '#dbeafe' : '#eff6ff',
        color: '#0f172a',
        WebkitTextFillColor: '#0f172a',
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
        if (file) void onFile(file);
      }}
    >
      <div className="flex flex-col md:flex-row md:items-center gap-4 justify-between">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-blue-100 p-3">
            <FileText className="h-6 w-6 text-blue-700" />
          </div>
          <div>
            <h2
              className="text-lg font-semibold"
              style={{ color: '#0f172a', WebkitTextFillColor: '#0f172a' }}
            >
              Create candidate from resume
            </h2>
            <p
              className="text-sm mt-1"
              style={{ color: '#334155', WebkitTextFillColor: '#334155' }}
            >
              {dragActive
                ? 'Drop your resume to parse and continue…'
                : 'Drag & drop a PDF or Word resume, or upload. We extract name, contact, title, skills, summary, experience, and education.'}
            </p>
            {fileName && (
              <p
                className="text-xs mt-2"
                style={{ color: '#1e40af', WebkitTextFillColor: '#1e40af' }}
              >
                Selected: {fileName}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 shrink-0">
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="hidden"
            disabled={parsing}
            onChange={(e) => onFile(e.target.files?.[0])}
          />
          <Button
            type="button"
            disabled={parsing}
            onClick={() => inputRef.current?.click()}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {parsing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Parsing resume...
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                Upload Resume
              </>
            )}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={parsing}
            onClick={() => router.push('/dashboard/candidates/new')}
          >
            Manual entry
          </Button>
        </div>
      </div>
    </div>
  );
}
