"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

export type FitGrade = "A" | "B" | "C" | "D" | "F";

export interface FitScoreBadgeProps {
  score?: number | null;
  grade?: FitGrade | string | null;
  reasons?: string[];
  strengths?: string[];
  gaps?: string[];
  loading?: boolean;
  className?: string;
  size?: "sm" | "md";
}

function gradeStyles(grade?: string | null): string {
  switch ((grade || "").toUpperCase()) {
    case "A":
      return "bg-emerald-50 text-emerald-800 border-emerald-200";
    case "B":
      return "bg-sky-50 text-sky-800 border-sky-200";
    case "C":
      return "bg-amber-50 text-amber-900 border-amber-200";
    case "D":
      return "bg-orange-50 text-orange-900 border-orange-200";
    case "F":
      return "bg-rose-50 text-rose-800 border-rose-200";
    default:
      return "bg-slate-50 text-slate-600 border-slate-200";
  }
}

/**
 * Compact fit score badge with hover tooltip for reasons.
 */
export function FitScoreBadge({
  score,
  grade,
  reasons = [],
  strengths = [],
  gaps = [],
  loading,
  className,
  size = "sm",
}: FitScoreBadgeProps) {
  const [open, setOpen] = useState(false);

  if (loading) {
    return (
      <span
        className={cn(
          "inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] text-slate-400 animate-pulse",
          className
        )}
      >
        …
      </span>
    );
  }

  if (score == null || Number.isNaN(Number(score))) {
    return null;
  }

  const g = (grade || "").toUpperCase() || "?";
  const displayScore = Math.round(Number(score));
  const lines = [
    ...reasons.slice(0, 5),
    ...(strengths.length
      ? [`Strengths: ${strengths.slice(0, 2).join("; ")}`]
      : []),
    ...(gaps.length ? [`Gaps: ${gaps.slice(0, 2).join("; ")}`] : []),
  ];

  return (
    <span
      className={cn("relative inline-flex", className)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      <span
        tabIndex={0}
        title={
          lines.length
            ? lines.join(" · ")
            : `Fit ${displayScore}/100 (grade ${g})`
        }
        className={cn(
          "inline-flex items-center gap-1 rounded-full border font-semibold tabular-nums cursor-default select-none",
          gradeStyles(g),
          size === "sm"
            ? "px-1.5 py-0.5 text-[10px] leading-tight"
            : "px-2 py-0.5 text-xs"
        )}
        aria-label={`Fit score ${displayScore} out of 100, grade ${g}`}
      >
        <span className="opacity-70 font-medium">Fit</span>
        <span>{displayScore}</span>
        <span className="opacity-80">· {g}</span>
      </span>

      {open && lines.length > 0 && (
        <span
          role="tooltip"
          className="absolute z-50 left-0 top-full mt-1 w-56 rounded-lg border border-gray-200 bg-white p-2.5 text-[11px] text-gray-700 shadow-lg"
        >
          <span className="block font-semibold text-gray-900 mb-1">
            Fit {displayScore}/100 ({g})
          </span>
          <ul className="space-y-0.5 list-disc pl-3.5">
            {lines.slice(0, 6).map((line, i) => (
              <li key={i} className="leading-snug">
                {line}
              </li>
            ))}
          </ul>
        </span>
      )}
    </span>
  );
}

export default FitScoreBadge;
