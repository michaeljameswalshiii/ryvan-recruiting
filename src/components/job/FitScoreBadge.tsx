"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

export type FitGrade = "A" | "B" | "C" | "D" | "F";

export interface FitSplitBadge {
  score?: number | null;
  grade?: FitGrade | string | null;
  /** When false, tools half is not applicable */
  applicable?: boolean;
}

export interface FitScoreBadgeProps {
  score?: number | null;
  grade?: FitGrade | string | null;
  /** Domain / functional fit (preferred split UI) */
  domainFit?: FitSplitBadge | null;
  /** Tool / product readiness (preferred split UI) */
  toolReadiness?: FitSplitBadge | null;
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

function MiniPill({
  label,
  score,
  grade,
  size,
}: {
  label: string;
  score: number;
  grade: string;
  size: "sm" | "md";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border font-semibold tabular-nums",
        gradeStyles(grade),
        size === "sm"
          ? "px-1.5 py-0.5 text-[10px] leading-tight"
          : "px-2 py-0.5 text-xs"
      )}
    >
      <span className="opacity-70 font-medium">{label}</span>
      <span>{score}</span>
      <span className="opacity-80">· {grade}</span>
    </span>
  );
}

/**
 * Compact fit score badge with hover tooltip.
 * Prefers split Domain + Tools when available; falls back to overall Fit.
 */
export function FitScoreBadge({
  score,
  grade,
  domainFit,
  toolReadiness,
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

  const domainScore =
    domainFit?.score != null && !Number.isNaN(Number(domainFit.score))
      ? Math.round(Number(domainFit.score))
      : null;
  const toolScore =
    toolReadiness?.score != null && !Number.isNaN(Number(toolReadiness.score))
      ? Math.round(Number(toolReadiness.score))
      : null;
  const toolsApplicable = toolReadiness?.applicable !== false;
  const hasSplit = domainScore != null && toolScore != null && toolScore > 0;

  if (!hasSplit && (score == null || Number.isNaN(Number(score)))) {
    return null;
  }

  const g = (grade || "").toUpperCase() || "?";
  const displayScore =
    score != null && !Number.isNaN(Number(score))
      ? Math.round(Number(score))
      : domainScore ?? 0;
  const domainGrade = (domainFit?.grade || g || "?").toString().toUpperCase();
  const toolGrade = (toolReadiness?.grade || "?").toString().toUpperCase();

  const lines = [
    hasSplit
      ? `Domain ${domainScore}/100 (${domainGrade})`
      : null,
    hasSplit
      ? toolsApplicable && toolScore != null
        ? `Tools ${toolScore}/100 (${toolGrade})`
        : "Tools n/a (no stack on JD)"
      : null,
    hasSplit ? `Overall ${displayScore}/100 (${g})` : null,
    ...reasons.slice(0, 4),
    ...(strengths.length
      ? [`Strengths: ${strengths.slice(0, 2).join("; ")}`]
      : []),
    ...(gaps.length ? [`Gaps: ${gaps.slice(0, 2).join("; ")}`] : []),
  ].filter(Boolean) as string[];

  return (
    <span
      className={cn("relative inline-flex", className)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {hasSplit ? (
        <span
          tabIndex={0}
          className="inline-flex flex-wrap items-center gap-1 cursor-default select-none"
          aria-label={
            toolsApplicable && toolScore != null
              ? `Domain fit ${domainScore} grade ${domainGrade}, tool readiness ${toolScore} grade ${toolGrade}, overall ${displayScore} grade ${g}`
              : `Domain fit ${domainScore} grade ${domainGrade}, overall ${displayScore} grade ${g}`
          }
          title={lines.join(" · ")}
        >
          <MiniPill
            label="Domain"
            score={domainScore!}
            grade={domainGrade}
            size={size}
          />
          {toolsApplicable && toolScore != null ? (
            <MiniPill
              label="Tools"
              score={toolScore}
              grade={toolGrade}
              size={size}
            />
          ) : (
            <span
              className={cn(
                "inline-flex items-center rounded-full border border-slate-200 bg-slate-50 text-slate-600 font-semibold",
                size === "sm"
                  ? "px-1.5 py-0.5 text-[10px]"
                  : "px-2 py-0.5 text-xs"
              )}
            >
              Tools n/a
            </span>
          )}
        </span>
      ) : (
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
      )}

      {open && lines.length > 0 && (
        <span
          role="tooltip"
          data-ink-on-light
          data-popover-surface
          className="surface-light absolute z-50 left-0 top-full mt-1 w-64 rounded-lg border border-gray-200 bg-white p-2.5 text-[11px] text-slate-800 shadow-lg"
        >
          <span className="mb-1 block font-semibold text-slate-900">
            {hasSplit
              ? `Domain ${domainScore} · Tools ${
                  toolsApplicable && toolScore != null ? toolScore : "n/a"
                } · Overall ${displayScore}`
              : `Fit ${displayScore}/100 (${g})`}
          </span>
          <ul className="list-disc space-y-0.5 pl-3.5">
            {lines.slice(0, 8).map((line, i) => (
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
