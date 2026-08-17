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

function FieldRow({
  label,
  value,
  highlight,
  hideIfEmpty = true,
}: {
  label: string;
  value?: string;
  highlight?: boolean;
  hideIfEmpty?: boolean;
}) {
  const display = value && value !== "—" ? value : "—";
  if (hideIfEmpty && display === "—") return null;
  return (
    <div
      className={`rounded-md px-1.5 py-0.5 ${
        highlight && display !== "—" ? "bg-amber-100" : ""
      }`}
    >
      <span className="font-medium text-slate-500">{label}: </span>
      <span className="text-slate-800">{display}</span>
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
  return (
    <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-4">
      <div className="text-base font-semibold text-slate-900">{card.name}</div>
      <div className="mt-0.5 text-xs text-slate-500">{card.subtitle}</div>
      <div className="mt-3 space-y-1.5 text-sm leading-snug">
        <FieldRow
          label="History"
          value={card.historyLine}
          highlight={card.highlightHistory}
          hideIfEmpty={false}
        />
        <FieldRow
          label="Education"
          value={card.educationLine}
          highlight={card.highlightEducation}
          hideIfEmpty={false}
        />
        <FieldRow label="Email" value={card.email} />
        <FieldRow label="Phone" value={card.phone} />
        <FieldRow
          label="Resume"
          value={card.resumeFileName}
          hideIfEmpty={false}
        />
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
        className="relative w-full max-w-3xl max-h-[92vh] overflow-y-auto rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-2xl"
        style={{ color: "#0f172a" }}
      >
        <button
          type="button"
          className="absolute right-3 top-3 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          onClick={() => !resolving && onClose()}
          aria-label="Close"
          disabled={resolving}
        >
          <X className="h-4 w-4" />
        </button>

        <div className="space-y-4 p-5 sm:p-6">
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
              <div>
                <h2
                  id="dup-candidate-title"
                  className="text-base font-semibold text-slate-900"
                >
                  Possible duplicate candidate found
                </h2>
                <p className="mt-1 text-sm leading-relaxed text-slate-700">
                  {match.explanation}
                </p>
              </div>
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

          <div className="grid gap-3 sm:grid-cols-2">
            <p className="text-xs font-medium leading-snug text-slate-600">
              {match.headline}
            </p>
            <p className="text-xs font-medium leading-snug text-slate-600 sm:text-right">
              {match.subhead}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <ProfileColumn match={match} side="existing" />
            <ProfileColumn match={match} side="incoming" />
          </div>

          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
            <span
              aria-hidden
              className="h-3.5 w-3.5 shrink-0 rounded-full border-[5px] border-blue-600 bg-white"
            />
            <span>{match.signalLabel}</span>
          </div>

          <div>
            <div className="mb-2 text-sm font-medium text-slate-800">
              Keep as primary record
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={resolving}
                onClick={() => setPrimary("existing")}
                className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition ${
                  primary === "existing"
                    ? "border-blue-600 bg-blue-600 text-white"
                    : "border-slate-300 bg-white text-slate-700 hover:border-slate-400"
                }`}
              >
                Existing profile
              </button>
              <button
                type="button"
                disabled={resolving}
                onClick={() => setPrimary("incoming")}
                className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition ${
                  primary === "incoming"
                    ? "border-blue-600 bg-blue-600 text-white"
                    : "border-slate-300 bg-white text-slate-700 hover:border-slate-400"
                }`}
              >
                New upload
              </button>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              {primary === "existing"
                ? "The existing ATS record keeps its ID, jobs, and activity. Empty fields and the new resume are folded in."
                : "The new record becomes the profile. Jobs and activity from the existing candidate move over, and that older record is removed."}
            </p>
          </div>
        </div>

        <div className="sticky bottom-0 flex flex-col-reverse gap-2 border-t border-slate-100 bg-white px-5 py-4 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="ghost"
            disabled={resolving}
            onClick={onClose}
            className="text-slate-700"
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={resolving}
            onClick={onAddAnyway}
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
  );
}
