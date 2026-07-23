'use client';

import { X } from 'lucide-react';

type Props = {
  onDismiss: () => void;
  label?: string;
  className?: string;
  /** Always show (default: hover-reveal on sm+) */
  alwaysVisible?: boolean;
};

/**
 * Compact per-row dismiss control for follow-up / attention lists.
 */
export function DismissRowButton({
  onDismiss,
  label = 'Dismiss',
  className = '',
  alwaysVisible = false,
}: Props) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onDismiss();
      }}
      className={
        className ||
        `shrink-0 rounded-lg p-1.5 text-gray-400 hover:bg-gray-200/80 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-slate-300 ${
          alwaysVisible
            ? 'opacity-100'
            : 'opacity-70 sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100'
        }`
      }
      title={`${label} — hide for 30 days`}
      aria-label={label}
    >
      <X className="h-4 w-4" />
    </button>
  );
}
