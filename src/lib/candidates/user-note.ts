/**
 * Last Note on candidate lists should be recruiter-typed activity text,
 * not imported CRM stamps or system-generated events.
 */

import { isMachineActorId } from "@/lib/ownership/machine-actor";
import { normalizeNoteTypeLabel } from "@/lib/candidates/note-type-stage";

/** Bullhorn-style import stamps: "Dormant 08/16/26 | Tools 08/03/26 | Outreach 12/16/25" */
const STAMP_PART =
  /^(Dormant|Tools|Outreach|[A-Za-z][A-Za-z .'-]{0,24})\s+\d{1,2}\/\d{1,2}\/\d{2,4}$/i;

const SYSTEM_NOTE_TYPES = new Set(["AI Review", "Attached"]);

export function isImportedStatusStamp(text: string): boolean {
  const t = String(text || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!t.includes("|")) return false;
  const parts = t.split("|").map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return false;
  return parts.every((p) => STAMP_PART.test(p));
}

export function isSystemGeneratedNoteText(text: string): boolean {
  const t = String(text || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!t) return true;
  if (isImportedStatusStamp(t)) return true;
  if (/^ai fit for\b/i.test(t) || /^ai review\b/i.test(t)) return true;
  if (/^attached to job:/i.test(t) || /^unlinked from job:/i.test(t)) return true;
  if (/^job stage on\b/i.test(t)) return true;
  return false;
}

/** Empty string if the text is not a recruiter-typed activity note. */
export function userEnteredNoteText(text: unknown): string {
  const t = String(text || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!t || isSystemGeneratedNoteText(t)) return "";
  return t;
}

type NoteLike = {
  eventType?: string;
  createdBy?: string;
  description?: string;
  metadata?: Record<string, unknown> | null;
};

function isSystemActor(createdBy?: string): boolean {
  const s = String(createdBy || "").trim();
  if (!s) return false;
  return isMachineActorId(s);
}

export function isUserEnteredActivityNote(note: NoteLike | null | undefined): boolean {
  if (!note) return false;
  if (String(note.eventType || "").toUpperCase() !== "NOTE") return false;
  if (isSystemActor(note.createdBy)) return false;
  const meta = (note.metadata || {}) as Record<string, unknown>;
  if (meta.systemKind) return false;
  const noteType = normalizeNoteTypeLabel(
    String(meta.noteType || meta.noteTypeLabel || "")
  );
  if (SYSTEM_NOTE_TYPES.has(noteType)) return false;
  const text = userEnteredNoteText(
    meta.noteText || note.description || ""
  );
  return Boolean(text);
}
