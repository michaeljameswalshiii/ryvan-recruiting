'use client';

/**
 * Shared Files tab for candidates, companies, contacts, and jobs.
 * Upload from desktop, list, download, delete.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Download,
  File,
  FileImage,
  FileSpreadsheet,
  FileText,
  Loader2,
  Paperclip,
  Trash2,
  Upload,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import type { EntityFileType, EntityFileView } from '@/lib/schemas/entity-file';

function formatBytes(n: number): string {
  if (!n || n < 0) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function fileIcon(contentType: string, fileName: string) {
  const t = (contentType || '').toLowerCase();
  const n = fileName.toLowerCase();
  if (t.startsWith('image/') || /\.(png|jpe?g|gif|webp)$/.test(n)) {
    return FileImage;
  }
  if (
    t.includes('sheet') ||
    t.includes('excel') ||
    n.endsWith('.xlsx') ||
    n.endsWith('.xls') ||
    n.endsWith('.csv')
  ) {
    return FileSpreadsheet;
  }
  if (t === 'application/pdf' || n.endsWith('.pdf')) {
    return FileText;
  }
  return File;
}

export type EntityFilesPanelProps = {
  entityType: EntityFileType;
  entityId: string;
  companyId?: string;
  /** Optional heading override */
  title?: string;
  className?: string;
};

export function EntityFilesPanel({
  entityType,
  entityId,
  companyId,
  title = 'Files',
  className = '',
}: EntityFilesPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<EntityFileView[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [dragOver, setDragOver] = useState(false);

  const load = useCallback(async () => {
    if (!entityId) return;
    setLoading(true);
    try {
      const qs = new URLSearchParams({
        entityType,
        entityId,
      });
      const res = await fetch(`/api/files?${qs}`, { credentials: 'include' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load files');
      setFiles(Array.isArray(data.files) ? data.files : []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load files');
    } finally {
      setLoading(false);
    }
  }, [entityType, entityId]);

  useEffect(() => {
    load();
  }, [load]);

  const uploadFile = async (file: File) => {
    if (!entityId) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('entityType', entityType);
      form.append('entityId', entityId);
      if (companyId) form.append('companyId', companyId);
      if (label.trim()) form.append('label', label.trim());

      const res = await fetch('/api/files', {
        method: 'POST',
        credentials: 'include',
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      toast.success(`Uploaded ${file.name}`);
      setLabel('');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const onPick = (list: FileList | null) => {
    if (!list?.length) return;
    // Upload sequentially to keep errors clear
    void (async () => {
      for (const f of Array.from(list)) {
        await uploadFile(f);
      }
    })();
  };

  const onDelete = async (f: EntityFileView) => {
    if (!confirm(`Delete “${f.fileName}”?`)) return;
    setDeletingId(f.id);
    try {
      const res = await fetch(`/api/files/${encodeURIComponent(f.id)}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Delete failed');
      toast.success('File deleted');
      setFiles((prev) => prev.filter((x) => x.id !== f.id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setDeletingId(null);
    }
  };

  const onDownload = async (f: EntityFileView) => {
    try {
      let url = f.downloadUrl;
      if (!url) {
        const res = await fetch(`/api/files/${encodeURIComponent(f.id)}`, {
          credentials: 'include',
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Could not get download link');
        url = data.file?.downloadUrl;
      }
      if (!url) throw new Error('No download URL');
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Download failed');
    }
  };

  return (
    <div
      data-ink-on-light
      className={`bg-white border border-gray-200 rounded-2xl shadow-sm p-5 text-slate-900 ${className}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
            <Paperclip className="h-4 w-4 text-blue-600" />
            {title}
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Store documents from your desktop — PDF, Office, images, ZIP (max 15MB).
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          className="bg-blue-600 hover:bg-blue-700"
          disabled={uploading || !entityId}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? (
            <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
          ) : (
            <Upload className="h-4 w-4 mr-1.5" />
          )}
          Upload file
        </Button>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          multiple
          onChange={(e) => onPick(e.target.files)}
        />
      </div>

      <div className="mb-4 max-w-md">
        <label className="text-xs font-medium text-gray-600 mb-1 block">
          Optional label (applies to next upload)
        </label>
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="e.g. Signed MSA, Rate card, JD draft…"
          className="bg-white"
          maxLength={200}
        />
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          onPick(e.dataTransfer.files);
        }}
        className={`rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors mb-5 ${
          dragOver
            ? 'border-blue-400 bg-blue-50'
            : 'border-gray-200 bg-slate-50/80'
        }`}
      >
        <Upload className="h-8 w-8 text-gray-400 mx-auto mb-2" />
        <p className="text-sm text-gray-700 font-medium">
          Drag & drop files here
        </p>
        <p className="text-xs text-gray-500 mt-1">
          or use Upload file. Multiple files supported.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-gray-500 py-8 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading files…
        </div>
      ) : files.length === 0 ? (
        <p className="text-sm text-gray-500 text-center py-6">
          No files yet. Upload from your desktop to keep them with this record.
        </p>
      ) : (
        <ul className="divide-y divide-gray-100 rounded-xl border border-gray-100 overflow-hidden">
          {files.map((f) => {
            const Icon = fileIcon(f.contentType, f.fileName);
            return (
              <li
                key={f.id}
                className="flex items-center gap-3 px-3 py-3 bg-white hover:bg-slate-50/80"
              >
                <div className="h-10 w-10 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                  <Icon className="h-5 w-5 text-slate-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-gray-900 truncate">
                    {f.fileName}
                  </div>
                  <div className="text-xs text-gray-500 flex flex-wrap gap-x-2">
                    {f.label ? (
                      <span className="text-blue-700 font-medium">{f.label}</span>
                    ) : null}
                    <span>{formatBytes(f.sizeBytes)}</span>
                    <span>
                      {new Date(f.createdAt).toLocaleString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </span>
                    {f.uploadedByEmail ? (
                      <span className="truncate max-w-[12rem]">
                        {f.uploadedByEmail}
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8"
                    onClick={() => onDownload(f)}
                    title="Download"
                  >
                    <Download className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 text-rose-600 border-rose-200 hover:bg-rose-50"
                    disabled={deletingId === f.id}
                    onClick={() => onDelete(f)}
                    title="Delete"
                  >
                    {deletingId === f.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
