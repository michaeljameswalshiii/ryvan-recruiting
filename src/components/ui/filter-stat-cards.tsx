'use client';

/**
 * Shared pipeline/filter stat cards for Candidates, Companies, Jobs, Contacts.
 *
 * Design (light AND dark):
 * - Soft pastel fills (same scheme as original Candidates cards)
 * - Dark ink for count / label / subtitle — always readable
 * - Never rely on Tailwind dark: remaps (global CSS was fighting dual classes)
 *
 * On a dark page canvas these cards stay light so black text remains WCAG-friendly.
 */

export type FilterStatTone =
  | 'neutral'
  | 'sky'
  | 'violet'
  | 'amber'
  | 'emerald'
  | 'forest'
  | 'rose'
  | 'indigo'
  | 'slate';

export type FilterStatCardItem = {
  key: string;
  label: string;
  sub: string;
  count: number;
  tone: FilterStatTone;
};

/** Pastel fills + dark count colors (Candidates production look) */
const TONE_STYLES: Record<
  FilterStatTone,
  { bg: string; border: string; count: string; ring: string }
> = {
  neutral: {
    bg: '#ffffff',
    border: '#e2e8f0',
    count: '#0f172a',
    ring: '#93c5fd',
  },
  sky: {
    bg: '#f0f9ff',
    border: '#e0f2fe',
    count: '#0c4a6e',
    ring: '#bae6fd',
  },
  violet: {
    bg: '#f5f3ff',
    border: '#ede9fe',
    count: '#4c1d95',
    ring: '#ddd6fe',
  },
  amber: {
    bg: '#fffbeb',
    border: '#fef3c7',
    count: '#78350f',
    ring: '#fde68a',
  },
  emerald: {
    bg: '#ecfdf5',
    border: '#d1fae5',
    count: '#064e3b',
    ring: '#a7f3d0',
  },
  // Darker green than emerald — same family, still pastel (Placed / Closed Won)
  forest: {
    bg: '#d1fae5',
    border: '#a7f3d0',
    count: '#065f46',
    ring: '#6ee7b7',
  },
  rose: {
    bg: '#fff1f2',
    border: '#ffe4e6',
    count: '#881337',
    ring: '#fecdd3',
  },
  indigo: {
    bg: '#eef2ff',
    border: '#e0e7ff',
    count: '#312e81',
    ring: '#c7d2fe',
  },
  slate: {
    bg: '#f8fafc',
    border: '#e2e8f0',
    count: '#0f172a',
    ring: '#cbd5e1',
  },
};

const LABEL_COLOR = '#1e293b'; // slate-800
const SUB_COLOR = '#475569'; // slate-600

type Props = {
  cards: FilterStatCardItem[];
  activeKey: string;
  onSelect: (key: string) => void;
  /** Tailwind grid classes */
  className?: string;
};

export function FilterStatCards({
  cards,
  activeKey,
  onSelect,
  className = 'grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-8 gap-3',
}: Props) {
  return (
    <div className={className}>
      {cards.map((card) => {
        const tone = TONE_STYLES[card.tone] || TONE_STYLES.neutral;
        const active = activeKey === card.key;
        return (
          <button
            key={card.key}
            type="button"
            onClick={() => onSelect(card.key)}
            aria-pressed={active}
            style={{
              backgroundColor: tone.bg,
              borderColor: active ? '#60a5fa' : tone.border,
              boxShadow: active
                ? `0 0 0 2px ${tone.ring}, 0 4px 6px -1px rgb(0 0 0 / 0.08)`
                : '0 1px 2px 0 rgb(0 0 0 / 0.05)',
            }}
            className="text-left rounded-2xl border px-4 py-3.5 transition-all hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <div
              className="text-2xl font-semibold tabular-nums"
              style={{ color: tone.count }}
            >
              {card.count}
            </div>
            <div
              className="mt-1 text-[11px] font-bold uppercase tracking-wide"
              style={{ color: LABEL_COLOR }}
            >
              {card.label}
            </div>
            <div
              className="mt-0.5 text-[11px] font-medium"
              style={{ color: SUB_COLOR }}
            >
              {card.sub}
            </div>
          </button>
        );
      })}
    </div>
  );
}
