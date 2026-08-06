'use client';

import type { ReactNode } from 'react';
import { useState } from 'react';
import { ChevronDown, Maximize2, Minimize2 } from 'lucide-react';

type DashboardCardProps = {
  title: string;
  children: ReactNode;
  expandedChildren?: ReactNode;
  className?: string;
  defaultCollapsed?: boolean;
};

/** Shared collapse/full-screen chrome for dashboard panels. */
export function DashboardCard({
  title,
  children,
  expandedChildren,
  className = '',
  defaultCollapsed = false,
}: DashboardCardProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [expanded, setExpanded] = useState(false);

  const controls = (fullScreen = false) => (
    <div className="ml-auto flex items-center gap-1">
      <button
        type="button"
        onClick={() => setCollapsed((value) => !value)}
        aria-expanded={!collapsed}
        aria-label={collapsed ? `Show ${title}` : `Hide ${title}`}
        className="rounded-md p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
      >
        <ChevronDown
          className={`h-4 w-4 transition-transform ${collapsed ? '-rotate-90' : ''}`}
          aria-hidden
        />
      </button>
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        aria-label={fullScreen ? `Close full-screen ${title}` : `Open ${title} full-screen`}
        className="rounded-md p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
      >
        {fullScreen ? (
          <Minimize2 className="h-4 w-4" aria-hidden />
        ) : (
          <Maximize2 className="h-4 w-4" aria-hidden />
        )}
      </button>
    </div>
  );

  return (
    <>
      <section className={`self-start rounded-2xl border border-gray-200 bg-white shadow-sm ${className}`}>
        <header
          className={`flex items-center gap-2 border-b border-gray-100 ${
            collapsed ? 'px-3 py-2' : 'px-5 py-3'
          }`}
        >
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          {controls()}
        </header>
        {!collapsed && <div className="p-5">{children}</div>}
      </section>

      {expanded && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/40 p-3 sm:p-6" role="dialog" aria-modal="true" aria-label={title}>
          <section className="mx-auto min-h-[calc(100vh-1.5rem)] max-w-7xl rounded-2xl border border-gray-200 bg-white shadow-2xl sm:min-h-[calc(100vh-3rem)]">
            <header className="sticky top-0 z-10 flex items-center gap-2 rounded-t-2xl border-b border-gray-100 bg-white px-5 py-3">
              <h2 className="text-base font-semibold text-gray-900">{title}</h2>
              {controls(true)}
            </header>
            <div className="p-5 sm:p-8 [&_.recharts-responsive-container]:!h-[420px]">
              {expandedChildren ?? children}
            </div>
          </section>
        </div>
      )}
    </>
  );
}
