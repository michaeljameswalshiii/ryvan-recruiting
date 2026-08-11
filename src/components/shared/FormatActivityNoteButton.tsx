'use client';

import { useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

type FormatActivityNoteButtonProps = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
};

export function FormatActivityNoteButton({
  value,
  onChange,
  disabled = false,
}: FormatActivityNoteButtonProps) {
  const [formatting, setFormatting] = useState(false);
  const [preview, setPreview] = useState('');
  const [open, setOpen] = useState(false);

  async function formatNote() {
    const original = value.trim();
    if (original.length < 20) {
      toast.info('Add a little more detail before formatting the note.');
      return;
    }

    setFormatting(true);
    try {
      const response = await fetch('/api/ai/format-activity-note', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: original }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || typeof body?.formattedNote !== 'string') {
        throw new Error(body?.error || 'Unable to format the note.');
      }
      setPreview(body.formattedNote);
      setOpen(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to format the note.');
    } finally {
      setFormatting(false);
    }
  }

  function useFormattedNote() {
    onChange(preview);
    setOpen(false);
    toast.success('Formatted draft applied. Review it before logging.');
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled || formatting || value.trim().length < 20}
        onClick={() => void formatNote()}
        className="h-9 shrink-0 gap-1.5 border-blue-200 text-blue-700 hover:bg-blue-50 hover:text-blue-800"
        title="Preview a more readable version without changing the original"
      >
        {formatting ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Sparkles className="h-3.5 w-3.5" />
        )}
        {formatting ? 'Formatting' : 'Format note'}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Review formatted note</DialogTitle>
            <DialogDescription>
              The original note remains unchanged until you use this version.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[55vh] overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm leading-6 whitespace-pre-wrap">
            {preview}
          </div>
          <p className="text-xs text-slate-500">
            AI can make mistakes. Confirm names, dates, commitments, and other details before logging.
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Keep original
            </Button>
            <Button type="button" onClick={useFormattedNote} className="bg-blue-600 hover:bg-blue-700">
              Use formatted note
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
