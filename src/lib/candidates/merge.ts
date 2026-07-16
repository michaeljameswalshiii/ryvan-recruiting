/**
 * Merge two candidate (lead) records into one primary record.
 * Secondary is deleted after jobs, events, and field data are folded in.
 *
 * @serverOnly
 */

import {
  getLeadById,
  deleteLead,
} from "@/lib/db/repositories/lead-repository";
import { getAllJobs } from "@/lib/db/repositories/job-repository";
import {
  putItem,
  deleteItem,
  queryItems,
  updateItem,
  leadsTable,
  jobsTable,
  eventsTable,
} from "@/lib/db/dynamodb";
import { invalidateTenantCache, makeCacheKey, invalidateCache } from "@/lib/cache";
import { addNoteToCandidate } from "@/lib/events/candidate-events";
import { stageIndex } from "@/lib/candidates/pipeline-rank";

export type MergeCandidateSummary = {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  title?: string;
  status?: string;
  source?: string;
  createdAt?: string;
  resumeUrl?: string;
  linkedJobCount: number;
};

export type MergeResult = {
  success: boolean;
  primaryId: string;
  secondaryId: string;
  candidate?: any;
  error?: string;
  stats?: {
    fieldsFilled: number;
    jobsMerged: number;
    eventsMoved: number;
  };
};

function createdTs(c: any): number {
  const raw = c?.created_at || c?.createdAt || 0;
  const t = new Date(raw).getTime();
  return Number.isFinite(t) ? t : 0;
}

function nonEmpty(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

function unionStrings(a?: string[], b?: string[]): string[] | undefined {
  const out = new Set<string>();
  for (const x of a || []) if (x?.trim()) out.add(x.trim());
  for (const x of b || []) if (x?.trim()) out.add(x.trim());
  return out.size ? Array.from(out) : undefined;
}

function mergeNotes(primaryNotes?: string, secondaryNotes?: string): string {
  const p = (primaryNotes || "").trim();
  const s = (secondaryNotes || "").trim();
  if (p && s) {
    if (p.includes(s.slice(0, 40))) return p.slice(0, 2000);
    return `${p}\n\n--- Merged from duplicate ---\n${s}`.slice(0, 2000);
  }
  return (p || s).slice(0, 2000);
}

function mergeLinkedJobs(primaryJobs: any[], secondaryJobs: any[]): any[] {
  const byId = new Map<string, any>();
  for (const j of [...primaryJobs, ...secondaryJobs]) {
    const id = j?.jobId || j?.id;
    if (!id) continue;
    const existing = byId.get(id);
    if (!existing) {
      byId.set(id, { ...j, jobId: id });
      continue;
    }
    // Keep further-along stage; union notes arrays if present
    const eIdx = stageIndex(existing.stage);
    const nIdx = stageIndex(j.stage);
    const keep = nIdx > eIdx ? { ...existing, ...j, jobId: id } : existing;
    if (Array.isArray(existing.notes) || Array.isArray(j.notes)) {
      keep.notes = [...(existing.notes || []), ...(j.notes || [])];
    }
    byId.set(id, keep);
  }
  return Array.from(byId.values());
}

function preferFurtherStatus(a?: string, b?: string): string {
  if (!a) return b || "identification";
  if (!b) return a;
  return stageIndex(b) > stageIndex(a) ? b : a;
}

export function toMergeSummary(lead: any): MergeCandidateSummary {
  const linked = Array.isArray(lead?.linkedJobs) ? lead.linkedJobs : [];
  return {
    id: lead.id,
    name: lead.name || "Unknown",
    email: lead.email || "",
    phone: lead.phone || "",
    title: lead.title || "",
    status: lead.status || "",
    source: lead.source || "",
    createdAt: lead.created_at || lead.createdAt || "",
    resumeUrl: lead.resume_url || lead.resumeUrl || "",
    linkedJobCount: linked.length,
  };
}

/**
 * Suggest primary = older record (first created), secondary = newer.
 * User can swap in the UI.
 */
export function suggestPrimaryByCreatedDate(
  a: any,
  b: any
): { primaryId: string; secondaryId: string } {
  const ta = createdTs(a);
  const tb = createdTs(b);
  if (ta <= tb) return { primaryId: a.id, secondaryId: b.id };
  return { primaryId: b.id, secondaryId: a.id };
}

async function moveEvents(
  secondaryId: string,
  primaryId: string
): Promise<number> {
  const raw = await queryItems<any>(
    eventsTable,
    "PK = :pk AND begins_with(SK, :sk)",
    {
      ":pk": `ENTITY#candidate#${secondaryId}`,
      ":sk": "EVENT#",
    }
  );
  const items = Array.isArray(raw) ? raw : raw?.items || [];
  let moved = 0;

  for (const ev of items) {
    try {
      let sk = ev.SK as string;
      // Avoid SK collision on primary
      const existing = await queryItems<any>(
        eventsTable,
        "PK = :pk AND SK = :sk",
        { ":pk": `ENTITY#candidate#${primaryId}`, ":sk": sk }
      );
      const exists = (Array.isArray(existing) ? existing : existing?.items || [])
        .length;
      if (exists) {
        sk = `EVENT#${ev.createdAt || Date.now()}-merged-${secondaryId.slice(0, 8)}`;
      }

      const copy = {
        ...ev,
        PK: `ENTITY#candidate#${primaryId}`,
        SK: sk,
        entityId: primaryId,
        metadata: {
          ...(ev.metadata || {}),
          mergedFromCandidateId: secondaryId,
        },
      };
      await putItem(eventsTable, copy);
      await deleteItem(eventsTable, { PK: ev.PK, SK: ev.SK });
      moved++;
    } catch (e) {
      console.warn("[merge] event move failed:", e);
    }
  }
  return moved;
}

async function reassignJobs(
  tenantId: string,
  primary: any,
  secondary: any
): Promise<number> {
  const jobs = await getAllJobs(tenantId);
  let touched = 0;
  const primaryId = primary.id as string;
  const secondaryId = secondary.id as string;

  for (const job of jobs) {
    const candidates: any[] =
      (Array.isArray(job.candidates) && job.candidates) ||
      (Array.isArray((job as any).linkedCandidates) &&
        (job as any).linkedCandidates) ||
      [];
    if (!candidates.some((c) => c.candidateId === secondaryId)) continue;

    const hasPrimary = candidates.some((c) => c.candidateId === primaryId);
    let next: any[];

    if (hasPrimary) {
      // Drop secondary; keep primary, absorb notes if useful
      const primaryEntry = candidates.find((c) => c.candidateId === primaryId);
      const secondaryEntry = candidates.find(
        (c) => c.candidateId === secondaryId
      );
      next = candidates
        .filter((c) => c.candidateId !== secondaryId)
        .map((c) => {
          if (c.candidateId !== primaryId) return c;
          return {
            ...c,
            stage: preferFurtherStatus(c.stage, secondaryEntry?.stage),
            notes:
              [c.notes, secondaryEntry?.notes].filter(Boolean).join("\n") ||
              c.notes,
            candidateName: primary.name || c.candidateName,
            candidateEmail: primary.email || c.candidateEmail,
          };
        });
      void primaryEntry;
    } else {
      next = candidates.map((c) =>
        c.candidateId === secondaryId
          ? {
              ...c,
              candidateId: primaryId,
              candidateName: primary.name || c.candidateName,
              candidateEmail: primary.email || c.candidateEmail || "",
            }
          : c
      );
    }

    await updateItem(
      jobsTable,
      { tenant_id: tenantId, id: job.id },
      "SET #candidates = :candidates, #modified_at = :m",
      {
        ":candidates": next,
        ":m": new Date().toISOString(),
      },
      { "#candidates": "candidates", "#modified_at": "modified_at" }
    );
    touched++;
  }
  return touched;
}

/**
 * Merge secondary into primary. Primary id/URL is kept; secondary is deleted.
 */
export async function mergeCandidates(
  tenantId: string,
  primaryId: string,
  secondaryId: string,
  options?: { mergedBy?: string }
): Promise<MergeResult> {
  if (!tenantId || !primaryId || !secondaryId) {
    return {
      success: false,
      primaryId,
      secondaryId,
      error: "tenantId, primaryId, and secondaryId are required",
    };
  }
  if (primaryId === secondaryId) {
    return {
      success: false,
      primaryId,
      secondaryId,
      error: "Cannot merge a candidate with itself",
    };
  }

  const primary = await getLeadById(tenantId, primaryId);
  const secondary = await getLeadById(tenantId, secondaryId);
  if (!primary) {
    return {
      success: false,
      primaryId,
      secondaryId,
      error: "Primary candidate not found",
    };
  }
  if (!secondary) {
    return {
      success: false,
      primaryId,
      secondaryId,
      error: "Secondary candidate not found",
    };
  }

  let fieldsFilled = 0;
  const fillKeys = [
    "email",
    "phone",
    "location",
    "title",
    "full_address",
    "salary_requirements",
    "summary",
    "linkedin_url",
    "resume_url",
    "resume_key",
    "resume_s3_key",
    "resume_file_name",
  ] as const;

  const merged: any = { ...primary };

  for (const key of fillKeys) {
    const pVal = (primary as any)[key];
    const sVal = (secondary as any)[key];
    if (!nonEmpty(pVal) && nonEmpty(sVal)) {
      merged[key] = sVal;
      fieldsFilled++;
    }
  }

  // name: keep primary unless empty
  if (!nonEmpty(merged.name) && nonEmpty((secondary as any).name)) {
    merged.name = (secondary as any).name;
    fieldsFilled++;
  }

  merged.notes = mergeNotes(
    (primary as any).notes,
    (secondary as any).notes
  );

  const pSkills = (primary as any).skills;
  const sSkills = (secondary as any).skills;
  const skills = unionStrings(
    Array.isArray(pSkills) ? pSkills : undefined,
    Array.isArray(sSkills) ? sSkills : undefined
  );
  if (skills) merged.skills = skills;

  const pCerts = (primary as any).certifications;
  const sCerts = (secondary as any).certifications;
  const certs = unionStrings(
    Array.isArray(pCerts) ? pCerts : undefined,
    Array.isArray(sCerts) ? sCerts : undefined
  );
  if (certs) merged.certifications = certs;

  // Prefer non-empty arrays from primary, else secondary; if both, keep primary + append unique experience rows
  if (!nonEmpty((primary as any).experience) && nonEmpty((secondary as any).experience)) {
    merged.experience = (secondary as any).experience;
    fieldsFilled++;
  }
  if (!nonEmpty((primary as any).education) && nonEmpty((secondary as any).education)) {
    merged.education = (secondary as any).education;
    fieldsFilled++;
  }

  merged.status = preferFurtherStatus(
    (primary as any).status,
    (secondary as any).status
  );

  // Keep primary source; note secondary in merge log
  const pJobs = Array.isArray((primary as any).linkedJobs)
    ? (primary as any).linkedJobs
    : [];
  const sJobs = Array.isArray((secondary as any).linkedJobs)
    ? (secondary as any).linkedJobs
    : [];
  merged.linkedJobs = mergeLinkedJobs(pJobs, sJobs);
  const pIds = Array.isArray((primary as any).linkedJobIds)
    ? (primary as any).linkedJobIds
    : [];
  const sIds = Array.isArray((secondary as any).linkedJobIds)
    ? (secondary as any).linkedJobIds
    : [];
  merged.linkedJobIds = Array.from(new Set([...pIds, ...sIds]));

  merged.modified_at = new Date().toISOString();
  merged.merged_from_ids = Array.from(
    new Set([
      ...((primary as any).merged_from_ids || []),
      secondaryId,
    ])
  );

  // Ensure resume_key mirrors resume_url when key-like
  if (
    merged.resume_url &&
    !String(merged.resume_url).startsWith("http") &&
    !merged.resume_key
  ) {
    merged.resume_key = merged.resume_url;
    merged.resume_s3_key = merged.resume_url;
  }

  // Persist merged primary
  await putItem(leadsTable, {
    ...merged,
    tenant_id: tenantId,
    id: primaryId,
  });

  // Bust lead cache
  try {
    await invalidateCache(makeCacheKey(tenantId, "leads", primaryId));
    await invalidateCache(makeCacheKey(tenantId, "leads", secondaryId));
  } catch {
    /* optional */
  }

  const jobsMerged = await reassignJobs(tenantId, merged, secondary);
  const eventsMoved = await moveEvents(secondaryId, primaryId);

  // Activity note on survivor
  try {
    const by = options?.mergedBy || "system";
    await addNoteToCandidate(
      primaryId,
      [
        `Merged duplicate candidate into this record.`,
        `Removed: ${secondary.name || secondaryId} (${secondaryId})`,
        `Secondary created: ${
          (secondary as any).created_at ||
          (secondary as any).createdAt ||
          "unknown"
        }`,
        (secondary as any).email
          ? `Secondary email: ${(secondary as any).email}`
          : "",
        (secondary as any).source
          ? `Secondary source: ${(secondary as any).source}`
          : "",
        `Merged by: ${by}`,
      ]
        .filter(Boolean)
        .join("\n"),
      by,
      {
        noteType: "profile_updated",
        merge: true,
        secondaryId,
      }
    );
  } catch (e) {
    console.warn("[merge] activity note failed:", e);
  }

  await deleteLead(tenantId, secondaryId);
  await invalidateTenantCache(tenantId);

  const fresh = await getLeadById(tenantId, primaryId);

  return {
    success: true,
    primaryId,
    secondaryId,
    candidate: fresh || merged,
    stats: {
      fieldsFilled,
      jobsMerged,
      eventsMoved,
    },
  };
}
