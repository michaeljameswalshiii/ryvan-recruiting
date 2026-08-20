'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import {
  ChevronDown,
  ChevronUp,
  Columns3,
  ExternalLink,
  GripVertical,
  LayoutGrid,
  List as ListIcon,
  Loader2,
  Mail,
  Phone,
  Sparkles,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react';
import { FitScoreBadge } from '@/components/job/FitScoreBadge';
import { getStageLabel } from '@/lib/schemas/lead';
import {
  PIPELINE_BUCKETS,
  candidateMatchesBucket,
  pipelineHref,
  type PipelineBucketKey,
} from '@/lib/jobs/pipeline-buckets';
import {
  userEnteredNoteText,
  isSystemGeneratedNoteText,
} from '@/lib/candidates/user-note';
import { Button } from '@/components/ui/button';

export type PipelineViewMode = 'tracker' | 'list' | 'tiles';

const KANBAN_COLUMNS = PIPELINE_BUCKETS.filter((b) => b.key !== 'attached');

const DROP_STAGE: Record<string, string> = {
  sourced: 'sourced',
  contacted: 'contacted',
  submitted: 'submitted',
  interviewing: 'interviewing',
  offer_out: 'offer_out',
  placed: 'placed',
  rejected: 'rejected',
};

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function avatarColor(name: string) {
  const palette = [
    'bg-orange-600',
    'bg-blue-600',
    'bg-indigo-600',
    'bg-violet-600',
    'bg-emerald-600',
    'bg-teal-600',
    'bg-rose-600',
    'bg-cyan-600',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash + name.charCodeAt(i) * 17) % palette.length;
  }
  return palette[hash];
}

function formatNoteDate(dateVal?: string | number | Date | null): string {
  if (!dateVal) return '';
  try {
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return '';
    return d
      .toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      .toUpperCase();
  } catch {
    return '';
  }
}

function extractLastNote(full: any, lc: any) {
  const raw =
    full?.last_note ||
    full?.lastNote ||
    lc?.notes ||
    full?.notes ||
    '';

  const clean =
    userEnteredNoteText(raw) ||
    (typeof raw === 'string' && !isSystemGeneratedNoteText(raw)
      ? raw.trim()
      : '');

  if (!clean) return null;

  const dateVal =
    full?.last_note_at ||
    full?.lastNoteAt ||
    full?.updatedAt ||
    lc?.createdAt;

  const dateStr = formatNoteDate(dateVal);

  return {
    dateStr,
    text: clean,
  };
}

export function GradeScorePill({
  grade,
  score,
  className = '',
}: {
  grade?: string | null;
  score?: number | null;
  className?: string;
}) {
  if (score == null && !grade) return null;
  const g = (
    grade ||
    (score != null
      ? score >= 85
        ? 'A'
        : score >= 70
        ? 'B'
        : score >= 55
        ? 'C'
        : score >= 40
        ? 'D'
        : 'F'
      : 'C')
  ).toUpperCase();

  const s =
    score != null && !isNaN(Number(score)) ? Math.round(Number(score)) : null;

  const styleMap: Record<string, string> = {
    A: 'bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-950/70 dark:text-emerald-300 dark:border-emerald-700/60',
    B: 'bg-sky-50 text-sky-800 border-sky-300 dark:bg-sky-950/70 dark:text-sky-300 dark:border-sky-700/60',
    C: 'bg-amber-50 text-amber-900 border-amber-300 dark:bg-amber-950/70 dark:text-amber-300 dark:border-amber-700/60',
    D: 'bg-orange-50 text-orange-900 border-orange-300 dark:bg-orange-950/70 dark:text-orange-300 dark:border-orange-700/60',
    F: 'bg-rose-50 text-rose-800 border-rose-300 dark:bg-rose-950/70 dark:text-rose-300 dark:border-rose-700/60',
  };

  const badgeStyle = styleMap[g] || styleMap.C;

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border tabular-nums select-none ${badgeStyle} ${className}`}
    >
      <span>{g}</span>
      {s != null && <span>· {s}</span>}
    </span>
  );
}

export interface JobCandidateBoardProps {
  jobId: string;
  candidates: any[];
  allCandidates?: any[];
  stages: string[];
  fitByCandidate?: Record<string, any>;
  onStageChange: (candidateIds: string[], stage: string) => void;
  stagePending?: boolean;
  onFit?: (candidateId: string) => void;
  fitRescoringId?: string | null;
  onUnlink?: (candidateId: string) => void;
  unlinkPending?: boolean;
  onOpenAddCandidate?: () => void;
}
  const [view, setView] = useState<BoardView>('cards');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = (ids: string[], on: boolean) => {
    setSelected(on ? new Set(ids) : new Set());
  };

  const moveSelectedTo = (stage: string, extraId?: string) => {
    const ids = new Set(selected);
    if (extraId) ids.add(extraId);
    const list = Array.from(ids);
    if (list.length === 0) return;
    onStageChange(list, stage);
    setSelected(new Set());
  };

  const onDragEnd = (event: DragEndEvent) => {
    const overId = event.over?.id ? String(event.over.id) : '';
    const draggedId = event.active?.id ? String(event.active.id) : '';
    const nextStage = DROP_STAGE[overId];
    if (!nextStage || !draggedId) return;
    const ids = selected.has(draggedId)
      ? Array.from(selected)
      : [draggedId];
    onStageChange(ids, nextStage);
    setSelected(new Set());
  };

  const byColumn = useMemo(() => {
    const map: Record<string, any[]> = {};
    for (const col of KANBAN_COLUMNS) map[col.key] = [];
    for (const lc of candidates) {
      const key = columnForStage(lc.stage);
      (map[key] || map.submitted).push(lc);
    }
    return map;
  }, [candidates]);

  const allIds = candidates.map((c) => String(c.candidateId));

  return (
    <section
      data-ink-on-light
      className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-800">
            Candidates on this job
          </h2>
          <p className="mt-0.5 text-[11px] text-gray-400">
            {selected.size > 0
              ? `${selected.size} selected — drag to a stage or use Move to`
              : 'Card or kanban view. Select several, then drag to a stage.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {selected.size > 0 && (
            <select
              className="h-8 rounded-lg border border-gray-200 bg-white px-2 text-xs"
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) moveSelectedTo(e.target.value);
                e.target.value = '';
              }}
              disabled={stagePending}
            >
              <option value="">Move to…</option>
              {stages.map((s) => (
                <option key={s} value={s}>
                  {getStageLabel(s)}
                </option>
              ))}
            </select>
          )}
          <div className="inline-flex rounded-lg border border-gray-200 p-0.5">
            {(
              [
                ['cards', LayoutGrid, 'Cards'],
                ['kanban', Columns3, 'Kanban'],
                ['list', List, 'List'],
              ] as const
            ).map(([id, Icon, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setView(id)}
                className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium ${
                  view === id
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-500 hover:bg-gray-50'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {candidates.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-500">
          No candidates linked to this job yet.
        </p>
      ) : view === 'kanban' ? (
        <DndContext sensors={sensors} onDragEnd={onDragEnd}>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            {KANBAN_COLUMNS.map((col) => (
              <KanbanColumn
                key={col.key}
                columnId={col.key}
                label={col.label}
                tint={col.bg}
                items={byColumn[col.key] || []}
                selected={selected}
                onToggle={toggle}
                jobId={jobId}
                fitByCandidate={fitByCandidate}
                onFit={onFit}
                fitRescoringId={fitRescoringId}
              />
            ))}
          </div>
        </DndContext>
      ) : view === 'cards' ? (
        <DndContext sensors={sensors} onDragEnd={onDragEnd}>
          <div className="mb-3 flex items-center gap-2 text-xs text-gray-500">
            <label className="inline-flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={allIds.length > 0 && allIds.every((id) => selected.has(id))}
                onChange={(e) => toggleAll(allIds, e.target.checked)}
              />
              Select all
            </label>
            <span>Drop onto a stage chip below after selecting</span>
          </div>
          <div className="mb-3 flex flex-wrap gap-2">
            {KANBAN_COLUMNS.map((col) => (
              <StageDropChip
                key={col.key}
                id={col.key}
                label={col.label}
                disabled={stagePending}
              />
            ))}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {candidates.map((lc) => (
              <CandidateCard
                key={lc.candidateId}
                lc={lc}
                jobId={jobId}
                selected={selected.has(String(lc.candidateId))}
                onToggle={() => toggle(String(lc.candidateId))}
                fit={fitByCandidate[lc.candidateId]}
                onFit={onFit}
                fitting={fitRescoringId === lc.candidateId}
                stages={stages}
                onStage={(stage) => onStageChange([String(lc.candidateId)], stage)}
                stagePending={stagePending}
              />
            ))}
          </div>
        </DndContext>
      ) : (
        <ul className="divide-y divide-gray-100">
          {candidates.map((lc) => {
            const name = lc.candidateName || 'Unknown';
            const id = String(lc.candidateId);
            return (
              <li key={id} className="flex items-center gap-3 py-2.5">
                <input
                  type="checkbox"
                  checked={selected.has(id)}
                  onChange={() => toggle(id)}
                />
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white ${avatarColor(name)}`}
                >
                  {initials(name)}
                </div>
                <Link
                  href={`/dashboard/candidates/${id}?jobId=${encodeURIComponent(jobId)}`}
                  className="min-w-0 flex-1 truncate text-sm font-medium text-blue-600 hover:underline"
                >
                  {name}
                </Link>
                <select
                  className="h-8 max-w-[10rem] rounded-lg border border-gray-200 bg-white px-2 text-xs"
                  value={lc.stage || 'sourced'}
                  onChange={(e) => onStageChange([id], e.target.value)}
                  disabled={stagePending}
                >
                  {stages.map((s) => (
                    <option key={s} value={s}>
                      {getStageLabel(s)}
                    </option>
                  ))}
                </select>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function StageDropChip({
  id,
  label,
  disabled,
}: {
  id: string;
  label: string;
  disabled?: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id, disabled });
  return (
    <div
      ref={setNodeRef}
      className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${
        isOver
          ? 'border-blue-500 bg-blue-50 text-blue-800'
          : 'border-gray-200 bg-gray-50 text-gray-600'
      }`}
    >
      Drop → {label}
    </div>
  );
}

function KanbanColumn({
  columnId,
  label,
  tint,
  items,
  selected,
  onToggle,
  jobId,
  fitByCandidate,
  onFit,
  fitRescoringId,
}: {
  columnId: string;
  label: string;
  tint: string;
  items: any[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  jobId: string;
  fitByCandidate: Record<string, any>;
  onFit?: (id: string) => void;
  fitRescoringId?: string | null;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: columnId });
  return (
    <div
      ref={setNodeRef}
      className={`min-h-[12rem] rounded-xl border p-2 ${tint} ${
        isOver ? 'ring-2 ring-blue-400' : 'border-gray-200'
      }`}
    >
      <div className="mb-2 flex items-center justify-between px-1">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-700">
          {label}
        </h3>
        <span className="rounded-full bg-white/80 px-1.5 text-[10px] font-semibold text-gray-600">
          {items.length}
        </span>
      </div>
      <div className="space-y-2">
        {items.map((lc) => (
          <CandidateCard
            key={lc.candidateId}
            lc={lc}
            jobId={jobId}
            compact
            selected={selected.has(String(lc.candidateId))}
            onToggle={() => onToggle(String(lc.candidateId))}
            fit={fitByCandidate[lc.candidateId]}
            onFit={onFit}
            fitting={fitRescoringId === lc.candidateId}
          />
        ))}
      </div>
    </div>
  );
}

function CandidateCard({
  lc,
  jobId,
  selected,
  onToggle,
  fit,
  onFit,
  fitting,
  stages,
  onStage,
  stagePending,
  compact,
}: {
  lc: any;
  jobId: string;
  selected: boolean;
  onToggle: () => void;
  fit?: any;
  onFit?: (id: string) => void;
  fitting?: boolean;
  stages?: string[];
  onStage?: (stage: string) => void;
  stagePending?: boolean;
  compact?: boolean;
}) {
  const id = String(lc.candidateId);
  const name = lc.candidateName || 'Unknown';
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id });
  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.6 : 1,
  };

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={`rounded-xl border bg-white p-3 shadow-sm ${
        selected ? 'border-blue-400 ring-2 ring-blue-100' : 'border-gray-200'
      }`}
    >
      <div className="flex items-start gap-2">
        <input
          type="checkbox"
          className="mt-1"
          checked={selected}
          onChange={onToggle}
        />
        <div
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white ${avatarColor(name)}`}
          {...listeners}
          {...attributes}
        >
          {initials(name)}
        </div>
        <div className="min-w-0 flex-1">
          <Link
            href={`/dashboard/candidates/${id}?jobId=${encodeURIComponent(jobId)}`}
            className="block truncate text-sm font-semibold text-blue-700 hover:underline"
          >
            {name}
          </Link>
          <p className="text-[11px] text-gray-500">
            {getStageLabel(lc.stage || 'sourced')}
          </p>
        </div>
        {onFit ? (
          <button
            type="button"
            title="AI fit"
            onClick={() => onFit(id)}
            className="text-gray-300 hover:text-violet-600"
          >
            {fitting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
          </button>
        ) : null}
      </div>
      {!compact && (
        <div className="mt-2 flex items-center justify-between gap-2">
          <FitScoreBadge score={fit?.score} grade={fit?.grade} />
          {stages && onStage ? (
            <select
              className="h-7 max-w-[9rem] rounded border border-gray-200 bg-white px-1 text-[11px]"
              value={lc.stage || 'sourced'}
              onChange={(e) => onStage(e.target.value)}
              disabled={stagePending}
            >
              {stages.map((s) => (
                <option key={s} value={s}>
                  {getStageLabel(s)}
                </option>
              ))}
            </select>
          ) : null}
        </div>
      )}
    </article>
  );
}
