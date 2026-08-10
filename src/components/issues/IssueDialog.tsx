'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { SimpleDialog } from '@/components/ui/simple-dialog';
import { toast } from 'sonner';
import { CreateIssueInput } from '@/lib/schemas/issue';
import { Upload, X, FileText } from 'lucide-react';

interface IssueDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: CreateIssueInput) => Promise<void>;
  initialData?: Partial<CreateIssueInput>;
  mode?: 'create' | 'edit';
}

function buildForm(initialData: Partial<CreateIssueInput> = {}) {
  const type = initialData.issueType || 'Bug';
  // Map legacy on load
  const issueType =
    type === 'Defect' ? 'Bug' : type === 'Enhancement' ? 'Improvement' : type;
  return {
    title: initialData.title || '',
    description: initialData.description || '',
    issueType: issueType as CreateIssueInput['issueType'],
    priority: (initialData.priority || 3) as 1 | 2 | 3 | 4,
    severity: initialData.severity || '',
    mvp: initialData.mvp || false,
    featureArea: initialData.featureArea || '',
    status: initialData.status || ('Open' as const),
    reportedBy: initialData.reportedBy || '',
    assignedTo: initialData.assignedTo || [],
    assigneeName:
      initialData.assigneeName ||
      (initialData.assignedTo && initialData.assignedTo[0]) ||
      '',
    environment: initialData.environment || ('Dev' as const),
    tags: initialData.tags || [],
    linkedType: initialData.linkedEntity?.type || "",
    linkedId: initialData.linkedEntity?.id || "",
    linkedLabel: initialData.linkedEntity?.label || "",
    attachments: (initialData.attachments || []) as Array<{
      id?: string;
      url: string;
      name: string;
      type?: string;
      size?: number;
    }>,
  };
}

export default function IssueDialog({ 
  open, 
  onOpenChange, 
  onSubmit, 
  initialData = {},
  mode = 'create' 
}: IssueDialogProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  
  const [form, setForm] = useState(() => buildForm(initialData));

  // Sync form when dialog opens or initialData changes (edit mode)
  useEffect(() => {
    if (open) {
      setForm(buildForm(initialData));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, initialData?.title, initialData?.status, initialData?.description]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    try {
      // For now, we'll store base64 URLs directly (for small files)
      // In production, you'd upload to S3 and get back a URL
      const newAttachments = [...form.attachments];
      
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        // Create a blob URL for the file (client-side preview)
        const url = URL.createObjectURL(file);
        newAttachments.push({
          url,
          name: file.name,
          type: file.type,
          size: file.size,
        });
      }
      
      setForm({ ...form, attachments: newAttachments });
      toast.success(`${files.length} file(s) attached`);
    } catch (error) {
      toast.error('Failed to attach files');
    } finally {
      setUploading(false);
    }
  };

  const removeAttachment = (index: number) => {
    const newAttachments = [...form.attachments];
    // Revoke the URL to free memory
    if (newAttachments[index].url.startsWith('blob:')) {
      URL.revokeObjectURL(newAttachments[index].url);
    }
    newAttachments.splice(index, 1);
    setForm({ ...form, attachments: newAttachments });
  };

  const handleSubmit = async () => {
    if (!form.title.trim()) {
      toast.error("Title is required");
      return;
    }

    try {
      // Omit empty optional strings so DynamoDB update stays valid
      const assigneeName = (form as any).assigneeName?.trim() || undefined;
      const linkedType = (form as any).linkedType as string;
      const linkedId = String((form as any).linkedId || "").trim();
      const linkedLabel = String((form as any).linkedLabel || "").trim();
      const linkedEntity =
        linkedType && linkedId
          ? {
              type: linkedType as "candidate" | "job" | "company" | "contact",
              id: linkedId,
              label: linkedLabel || undefined,
            }
          : undefined;
      const payload = {
        ...form,
        title: form.title.trim(),
        description: form.description?.trim() || undefined,
        severity: form.severity?.trim() || undefined,
        featureArea: form.featureArea?.trim() || undefined,
        reportedBy: form.reportedBy?.trim() || undefined,
        assigneeName,
        assignedTo: assigneeName ? [assigneeName] : form.assignedTo,
        linkedEntity,
      } as CreateIssueInput;
      // strip UI-only fields
      delete (payload as any).linkedType;
      delete (payload as any).linkedId;
      delete (payload as any).linkedLabel;

      await onSubmit(payload);
      // Success toast is handled by mutation hooks when used from list/detail
      if (mode === 'create') {
        // create from list also toasts in the hook; keep a fallback for direct onSubmit
      }
      onOpenChange(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save issue';
      toast.error(message);
    }
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  return (
    <SimpleDialog
      open={open}
      onOpenChange={onOpenChange}
      title={mode === 'create' ? "New work item" : "Edit work item"}
      description="Bugs, stories, tasks — tracked like ADO / Jira"
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit}>
            {mode === 'create' ? 'Create Issue' : 'Save Changes'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto">
        <div>
          <label className="text-sm font-medium">Title *</label>
          <input
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            className="w-full border rounded-md px-3 py-2"
            placeholder="e.g. Login button not responding"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium">Issue Type</label>
            <select
              value={form.issueType}
              onChange={(e) =>
                setForm({
                  ...form,
                  issueType: e.target.value as CreateIssueInput['issueType'],
                })
              }
              className="w-full border rounded-md px-3 py-2"
            >
              <option value="Bug">Bug</option>
              <option value="Story">Story</option>
              <option value="Task">Task</option>
              <option value="Improvement">Improvement</option>
            </select>
          </div>

          <div>
            <label className="text-sm font-medium">Priority</label>
            <select
              value={form.priority}
              onChange={(e) => setForm({ ...form, priority: parseInt(e.target.value) as 1|2|3|4 })}
              className="w-full border rounded-md px-3 py-2"
            >
              <option value={1}>1 - Critical</option>
              <option value={2}>2 - High</option>
              <option value={3}>3 - Medium</option>
              <option value={4}>4 - Low</option>
            </select>
          </div>
        </div>

        <div>
          <label className="text-sm font-medium">Assignee</label>
          <input
            value={(form as any).assigneeName || ''}
            onChange={(e) =>
              setForm({ ...form, assigneeName: e.target.value } as any)
            }
            className="w-full border rounded-md px-3 py-2"
            placeholder="Name or email"
          />
        </div>

        {mode === 'edit' && (
          <div>
            <label className="text-sm font-medium">Status</label>
            <select
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value as any })}
              className="w-full border rounded-md px-3 py-2"
            >
              <option value="Open">Open</option>
              <option value="In Progress">In Progress</option>
              <option value="Blocked">Blocked</option>
              <option value="Resolved">Resolved</option>
              <option value="Closed">Closed</option>
            </select>
          </div>
        )}

        <div>
          <label className="text-sm font-medium">Description</label>
          <textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            className="w-full border rounded-md px-3 py-2 h-24"
            placeholder="Detailed description..."
          />
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
          <label className="text-sm font-medium text-slate-800">
            Link CRM record (optional)
          </label>
          <div className="grid grid-cols-3 gap-2">
            <select
              value={(form as any).linkedType || ""}
              onChange={(e) =>
                setForm({ ...form, linkedType: e.target.value } as any)
              }
              className="border rounded-md px-2 py-2 text-sm"
            >
              <option value="">None</option>
              <option value="candidate">Candidate</option>
              <option value="job">Job</option>
              <option value="company">Company</option>
              <option value="contact">Contact</option>
            </select>
            <input
              value={(form as any).linkedId || ""}
              onChange={(e) =>
                setForm({ ...form, linkedId: e.target.value } as any)
              }
              className="border rounded-md px-2 py-2 text-sm col-span-1"
              placeholder="Record id"
              disabled={!(form as any).linkedType}
            />
            <input
              value={(form as any).linkedLabel || ""}
              onChange={(e) =>
                setForm({ ...form, linkedLabel: e.target.value } as any)
              }
              className="border rounded-md px-2 py-2 text-sm"
              placeholder="Label (name)"
              disabled={!(form as any).linkedType}
            />
          </div>
          <p className="text-[11px] text-slate-500">
            Paste candidate/job/company id from the URL and an optional display
            name.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium">Environment</label>
            <select
              value={form.environment}
              onChange={(e) => setForm({ ...form, environment: e.target.value as any })}
              className="w-full border rounded-md px-3 py-2"
            >
              <option value="Dev">Dev</option>
              <option value="QA">QA</option>
              <option value="Prod">Prod</option>
            </select>
          </div>

          <div>
            <label className="text-sm font-medium">Feature Area</label>
            <input
              value={form.featureArea}
              onChange={(e) => setForm({ ...form, featureArea: e.target.value })}
              className="w-full border rounded-md px-3 py-2"
              placeholder="Authentication, Dashboard, etc."
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={form.mvp}
            id="mvp-checkbox"
            onChange={(e) => setForm({ ...form, mvp: e.target.checked })}
          />
          <label htmlFor="mvp-checkbox" className="text-sm">MVP Feature</label>
        </div>

        {/* Attachments Section */}
        <div>
          <label className="text-sm font-medium">Attachments</label>
          <div className="border-2 border-dashed rounded-lg p-4 mt-1">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={handleFileSelect}
              accept="image/*,.pdf,.doc,.docx,.txt"
            />
            
            {form.attachments.length > 0 && (
              <div className="space-y-2 mb-3">
                {form.attachments.map((attachment, index) => (
                  <div key={index} className="flex items-center justify-between bg-gray-50 rounded px-3 py-2">
                    <div className="flex items-center gap-2 overflow-hidden">
                      <FileText className="h-4 w-4 flex-shrink-0" />
                      <span className="text-sm truncate">{attachment.name}</span>
                      <span className="text-xs text-gray-500">
                        ({formatFileSize(attachment.size)})
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeAttachment(index)}
                      className="ml-2 text-red-500 hover:text-red-700 flex-shrink-0"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="w-full py-2 text-sm text-gray-600 hover:text-gray-900 flex items-center justify-center gap-2"
            >
              <Upload className="h-4 w-4" />
              {uploading ? 'Uploading...' : 'Add files'}
            </button>
          </div>
        </div>
      </div>
    </SimpleDialog>
  );
}
