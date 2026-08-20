'use client';

import { useEffect, useState } from 'react';
import { Expand, Minimize2, Pencil, FileText, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { JobDescription } from '@/components/careers/JobDescription';

type Props = {
  description?: string | null;
  jobTitle?: string;
  onEdit?: () => void;
  className?: string;
};

/**
 * Compact job-description panel for the job detail sidebar.
 * Preview scrolls in a short window; Expand opens a large modal (resume-style).
 */
export function JobDescriptionPreview({
  description,
  jobTitle,
  onEdit,
  className = '',
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const hasBody = !!(description && String(description).trim());

  // Escape closes expand modal
  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpanded(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [expanded]);

  // Lock body scroll while expanded
  useEffect(() => {
    if (!expanded) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [expanded]);

  return (
    <>
      <section
        data-ink-on-light
        className={`bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden text-slate-900 ${className}`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-gray-100 bg-slate-50/80">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-600">
            <FileText className="h-3.5 w-3.5 text-slate-500" />
            Job Description
          </span>
          <div className="flex flex-wrap items-center gap-1">
            {onEdit && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-xs border-slate-300 bg-white text-slate-900 hover:bg-slate-50"
                onClick={onEdit}
              >
                <Pencil className="h-3.5 w-3.5 mr-1" />
                Edit
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-xs border-slate-300 bg-white text-slate-900 hover:bg-slate-50"
              onClick={() => setExpanded(true)}
              disabled={!hasBody}
              title={hasBody ? 'Expand full description' : 'No description yet'}
            >
              <Expand className="h-3.5 w-3.5 mr-1" />
              Expand
            </Button>
          </div>
        </div>

        <div
          className="relative max-h-[min(64vh,640px)] min-h-[200px] overflow-y-auto px-4 py-3 cursor-pointer"
          onClick={() => hasBody && setExpanded(true)}
          role={hasBody ? 'button' : undefined}
          tabIndex={hasBody ? 0 : undefined}
          onKeyDown={(e) => {
            if (hasBody && (e.key === 'Enter' || e.key === ' ')) {
              e.preventDefault();
              setExpanded(true);
            }
          }}
          title={hasBody ? 'Click to expand' : undefined}
        >
          {hasBody ? (
            <JobDescription
              description={description || ''}
              className="text-[13px] leading-relaxed [&_h3]:text-[10px]"
            />
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <FileText className="h-8 w-8 text-slate-300 mb-2" />
              <p className="text-sm text-slate-500">No description yet</p>
              {onEdit && (
                <Button
                  type="button"
                  size="sm"
                  className="mt-3 bg-blue-600 hover:bg-blue-700 text-white"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit();
                  }}
                >
                  <Pencil className="h-3.5 w-3.5 mr-1" />
                  Add description
                </Button>
              )}
            </div>
          )}
          {hasBody && (
            <div
              className="pointer-events-none sticky bottom-0 left-0 right-0 h-10 -mb-3 bg-gradient-to-t from-white to-transparent"
              aria-hidden
            />
          )}
        </div>
      </section>

      {/* Full-screen pop-out (resume-style) */}
      {expanded && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-6">
          <div
            className="absolute inset-0 bg-black/55 backdrop-blur-[2px]"
            onClick={() => setExpanded(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Job description"
            data-ink-on-light
            className="relative z-10 flex flex-col w-full max-w-3xl max-h-[min(92vh,900px)] bg-white border border-gray-200 rounded-2xl shadow-2xl overflow-hidden text-slate-900"
          >
            <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-gray-200 bg-slate-50 shrink-0">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Job Description
                </p>
                {jobTitle && (
                  <h2 className="text-lg font-semibold text-slate-900 truncate mt-0.5">
                    {jobTitle}
                  </h2>
                )}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {onEdit && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 border-slate-300 bg-white text-slate-900"
                    onClick={() => {
                      setExpanded(false);
                      onEdit();
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5 mr-1.5" />
                    Edit
                  </Button>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 border-slate-300 bg-white text-slate-900"
                  onClick={() => setExpanded(false)}
                >
                  <Minimize2 className="h-3.5 w-3.5 mr-1.5" />
                  Close
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 text-slate-600 hover:bg-slate-100"
                  onClick={() => setExpanded(false)}
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto px-5 sm:px-8 py-6">
              <JobDescription
                description={description || ''}
                className="max-w-none"
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
