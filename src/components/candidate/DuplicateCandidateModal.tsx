"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DuplicateMatch } from "@/lib/candidates/duplicates";

type PrimaryChoice = "existing" | "incoming";

type Props = {
  open: boolean;
  matches: DuplicateMatch[];
  resolving?: boolean;
  onClose: () => void;
  onAddAnyway: () => void;
  onMerge: (primary: PrimaryChoice, match: DuplicateMatch) => void;
};

const PEACH = "#F8E4D8";
const PEACH_TEXT = "#8A4B32";
const PEACH_BORDER = "#E8C4B0";
const ORANGE = "#E8590C";

function FieldRow({
  label,
  value,
  highlight,
  emptyHint,
  suffix,
}: {
  label: string;
  value?: string;
  highlight?: boolean;
  emptyHint?: string;
  suffix?: React.ReactNode;
}) {
  const hasValue = Boolean(value && value !== "—");
  const display = hasValue ? value : emptyHint || "—";
  return (
    <div className="grid grid-cols-[72px_minmax(0,1fr)] items-start gap-2 text-[13px] leading-snug">
      <span className="pt-0.5 text-slate-400">{label}</span>
      <span
        className={`min-w-0 rounded px-1.5 py-0.5 ${
          highlight && hasValue ? "" : ""
        } ${!hasValue ? "text-slate-400 italic" : "text-slate-800"}`}
        style={
          highlight && hasValue
            ? { backgroundColor: PEACH, color: PEACH_TEXT }
            : undefined
        }
      >
        {display}
        {suffix}
      </span>
    </div>
  );
}

function ProfileColumn({
  match,
  side,
}: {
  match: DuplicateMatch;
  side: "existing" | "incoming";
}) {
  const card = side === "existing" ? match.existing : match.incoming;
  const other = side === "existing" ? match.incoming : match.existing;
  const emailChanged =
    Boolean(card.email) &&
    Boolean(other.email) &&
    card.email!.trim().toLowerCase() !== other.email!.trim().toLowerCase();
  const isIncoming = side === "incoming";

  return (
    <div
      className={`min-w-0 rounded-xl border p-3.5 ${
        isIncoming ? "border-blue-200 bg-blue-50/70" : "border-slate-200 bg-white"
      }`}
    >
      <span
        className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
          isIncoming
            ? "bg-blue-600 text-white"
            : "bg-slate-100 text-slate-500"
        }`}
      >
        {isIncoming ? "New upload" : "Existing record"}
      </span>
      <div className="mt-2 text-[15px] font-semibold text-slate-900">
        {card.name}
      </div>
      <div className="text-xs text-slate-500">{card.subtitle}</div>
      <div className="mt-3 space-y-1.5">
        <FieldRow
          label="History"
          value={card.historyLine}
          highlight={card.highlightHistory}
        />
        <FieldRow
          label="Education"
          value={card.educationLine}
          highlight={card.highlightEducation}
        />
        <FieldRow
          label="Email"
          value={card.email}
          emptyHint="— not on file"
          suffix={
            emailChanged && isIncoming ? (
              <span className="ml-1.5 text-[11px] italic text-slate-400">
                changed
              </span>
            ) : null
          }
        />
        <FieldRow
          label="Phone"
          value={card.phone}
          emptyHint="— not on file"
        />
        <FieldRow label="Résumé" value={card.resumeFileName} />
      </div>
      {side === "existing" && card.id && (
        <Link
          href={`/dashboard/candidates/${card.id}`}
          target="_blank"
          className="mt-3 inline-block text-xs font-medium text-blue-700 hover:underline"
        >
          View existing profile
        </Link>
      )}
    </div>
  );
}

export function DuplicateCandidateModal({
  open,
  matches,
  resolving = false,
  onClose,
  onAddAnyway,
  onMerge,
}: Props) {
  const [index, setIndex] = useState(0);
  const [primary, setPrimary] = useState<PrimaryChoice>("existing");

  useEffect(() => {
    if (open) {
      setIndex(0);
      setPrimary("existing");
    }
  }, [open, matches]);

  if (!open || matches.length === 0) return null;

  const match = matches[Math.min(index, matches.length - 1)];
  const bannerParts = [
    match.headline.replace(/^Matched on /i, "Matched on "),
    match.subhead,
    match.contentMatchPercent
      ? `content match ${match.contentMatchPercent}%`
      : "",
  ].filter(Boolean);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-slate-900/45"
        onClick={() => !resolving && onClose()}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="dup-candidate-title"
        data-ink-on-light
        className="relative w-full max-w-[720px] max-h-[92vh] overflow-y-auto rounded-2xl bg-white text-slate-900 shadow-2xl"
        style={{ color: "#0f172a" }}
      >
        <div
          className="h-1 w-full rounded-t-2xl"
          style={{ backgroundColor: "#E07A4A" }}
        />

        <button
          type="button"
          className="absolute right-3 top-4 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          onClick={() => !resolving && onClose()}
          aria-label="Close"
          disabled={resolving}
        >
          <X className="h-4 w-4" />
        </button>

        <div className="space-y-4 px-5 pb-2 pt-5 sm:px-6">
          <div className="flex items-start gap-3 pr-6">
            <span
              className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
              style={{ backgroundColor: PEACH }}
            >
              <AlertTriangle className="h-4 w-4" style={{ color: ORANGE }} />
            </span>
            <div>
              <h2
                id="dup-candidate-title"
                className="text-[17px] font-semibold tracking-tight text-slate-900"
              >
                Possible duplicate candidate found
              </h2>
              <p className="mt-1 text-sm leading-relaxed text-slate-600">
                {match.explanation}
              </p>
            </div>
          </div>

          {matches.length > 1 && (
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>
                Showing match {index + 1} of {matches.length}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="underline disabled:no-underline disabled:opacity-40"
                  disabled={index === 0 || resolving}
                  onClick={() => setIndex((i) => Math.max(0, i - 1))}
                >
                  Previous
                </button>
                <button
                  type="button"
                  className="underline disabled:no-underline disabled:opacity-40"
                  disabled={index >= matches.length - 1 || resolving}
                  onClick={() =>
                    setIndex((i) => Math.min(matches.length - 1, i + 1))
                  }
                >
                  Next
                </button>
              </div>
            </div>
          )}

          <div
            className="rounded-lg px-3 py-2 text-[13px] leading-snug"
            style={{ backgroundColor: PEACH, color: PEACH_TEXT }}
          >
            <span className="font-medium">
              {bannerParts[0]}
            </span>
            {bannerParts.slice(1).map((part) => (
              <span key={part}>
                {" · "}
                {part}
              </span>
            ))}
          </div>

          <div className="relative grid gap-3 sm:grid-cols-2">
            <ProfileColumn match={match} side="existing" />
            <span className="absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 text-[11px] font-medium uppercase tracking-wide text-slate-400 sm:block">
              vs
            </span>
            <ProfileColumn match={match} side="incoming" />
          </div>

          <div
            className="rounded-lg border bg-slate-50 px-3 py-2.5 text-sm text-slate-600"
            style={{ borderColor: "#E7E5E4" }}
          >
            <div className="flex items-start gap-2">
              <span
                aria-hidden
                className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded-[3px] border bg-white"
                style={{ borderColor: PEACH_BORDER }}
              />
              <div>
                <div>{match.signalLabel}</div>
                {match.contactDiffers && (
                  <div className="mt-0.5 text-[13px] text-slate-500">
                    Email &amp; phone differ (people change jobs) — not used to
                    trigger a match.
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2.5">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
              <span className="text-slate-700">Keep as primary record:</span>
              <label className="inline-flex cursor-pointer items-center gap-1.5 text-slate-800">
                <input
                  type="radio"
                  name="dup-primary"
                  className="accent-blue-600"
                  checked={primary === "existing"}
                  disabled={resolving}
                  onChange={() => setPrimary("existing")}
                />
                Existing profile
              </label>
              <label className="inline-flex cursor-pointer items-center gap-1.5 text-slate-800">
                <input
                  type="radio"
                  name="dup-primary"
                  className="accent-blue-600"
                  checked={primary === "incoming"}
                  disabled={resolving}
                  onChange={() => setPrimary("incoming")}
                />
                New upload
              </label>
            </div>
            <p className="mt-1.5 text-xs text-slate-500">
              Empty fields (e.g. phone) fill from the other record. The primary
              record&apos;s résumé is kept — the other is discarded.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p className="text-xs text-slate-400">
            Merging combines both records into one. This can&apos;t be undone.
          </p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
            <Button
              type="button"
              variant="outline"
              disabled={resolving}
              onClick={onClose}
              className="border-slate-300 bg-white text-slate-700"
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={resolving}
              onClick={onAddAnyway}
              className="border-slate-300 bg-white font-medium hover:bg-orange-50"
              style={{ color: ORANGE }}
            >
              Add as new anyway
            </Button>
            <Button
              type="button"
              disabled={resolving}
              onClick={() => onMerge(primary, match)}
              className="bg-blue-600 text-white hover:bg-blue-700"
            >
              {resolving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving…
                </>
              ) : (
                "Merge into one profile"
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
