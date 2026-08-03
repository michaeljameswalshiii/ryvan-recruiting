'use client';

import { X } from 'lucide-react';

type Props = {
  onDismiss: () => void;
  label?: string;
  className?: string;
  /** Always show (default true — never hide until hover) */
  alwaysVisible?: boolean;
};

/**
 * Compact per-row dismiss control for follow-up / attention lists.
 * Always visible by default so dark-mode remaps + hover-only opacity
 * don't leave rows looking incomplete.
 */
export function DismissRowButton({
  onDismiss,
  label = 'Dismiss',
  className = '',
  alwaysVisible = true,
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
        `shrink-0 rounded-lg p-1.5 focus:outline-none focus:ring-2 focus:ring-slate-300 ${
          alwaysVisible ? 'opacity-100' : 'opacity-70 sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100'
        }`
      }
      style={
        className
          ? undefined
          : { color: '#334155' } /* slate-700 — always readable on light rows */
      }
      title={`${label} — hide for 30 days`}
      aria-label={label}
    >
      <X className="h-4 w-4" style={{ color: 'inherit' }} />
    </button>
  );
}
