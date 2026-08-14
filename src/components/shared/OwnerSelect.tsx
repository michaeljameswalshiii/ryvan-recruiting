"use client";

import { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Label } from "@/components/ui/label";

export type TeamMemberOption = {
  id: string;
  full_name: string;
  email: string;
};

type ObjectType = "candidate" | "company" | "job" | "contact";

/**
 * Team-member picker for Owner / account rep.
 * Create forms: controlled only (value + onChange).
 * Existing records: pass objectType + objectId to load and persist immediately.
 */
export function OwnerSelect({
  value,
  onChange,
  objectType,
  objectId,
  persist = false,
  label = "Owner / account rep",
  hint,
  id,
  className = "",
  compact = false,
}: {
  value?: string;
  onChange?: (userId: string) => void;
  objectType?: ObjectType;
  objectId?: string;
  persist?: boolean;
  label?: string;
  hint?: string;
  id?: string;
  className?: string;
  compact?: boolean;
}) {
  const queryClient = useQueryClient();
  const [members, setMembers] = useState<TeamMemberOption[]>([]);
  const [selected, setSelected] = useState(value || "");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const canPersist = Boolean(persist && objectType && objectId);
  const endpoint =
    objectType && objectId
      ? `/api/object-assignments/${objectType}/${encodeURIComponent(objectId)}`
      : "";

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [membersRes, assignmentRes] = await Promise.all([
        fetch("/api/object-assignments/members", { credentials: "include" }),
        endpoint
          ? fetch(endpoint, { credentials: "include" })
          : Promise.resolve(null),
      ]);
      const membersBody = await membersRes.json().catch(() => ({}));
      let nextMembers: TeamMemberOption[] = Array.isArray(membersBody.members)
        ? membersBody.members
        : [];

      if (assignmentRes) {
        const body = await assignmentRes.json().catch(() => ({}));
        if (!nextMembers.length && Array.isArray(body.members)) {
          nextMembers = body.members;
        }
        const assignments = Array.isArray(body.assignments)
          ? body.assignments
          : [];
        const owner =
          assignments.find(
            (row: { role?: string }) =>
              row.role === "owner" || row.role === "account_manager"
          ) || assignments[0];
        const ownerId = String(owner?.userId || "");
        if (ownerId) setSelected(ownerId);
      }
      setMembers(nextMembers);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load team");
    } finally {
      setLoading(false);
    }
  }, [endpoint]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (value !== undefined) setSelected(value);
  }, [value]);

  const persistOwner = async (userId: string) => {
    if (!canPersist || !endpoint) return;
    setSaving(true);
    setError("");
    try {
      const currentRes = await fetch(endpoint, { credentials: "include" });
      const currentBody = await currentRes.json().catch(() => ({}));
      const assignments: Array<{ userId: string; role?: string }> =
        Array.isArray(currentBody.assignments) ? currentBody.assignments : [];
      const primary = assignments.filter(
        (row) => row.role === "owner" || row.role === "account_manager"
      );
      for (const row of primary) {
        if (row.userId === userId) continue;
        await fetch(
          `${endpoint}?userId=${encodeURIComponent(row.userId)}`,
          { method: "DELETE", credentials: "include" }
        );
      }
      if (userId && !primary.some((row) => row.userId === userId)) {
        const post = await fetch(endpoint, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, role: "owner" }),
        });
        const body = await post.json().catch(() => ({}));
        if (!post.ok) throw new Error(body?.error || "Unable to assign owner");
      }
      if (objectType) {
        await queryClient.invalidateQueries({
          queryKey: ["object-assignment-owners", objectType],
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to assign owner");
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (userId: string) => {
    setSelected(userId);
    onChange?.(userId);
    if (canPersist) void persistOwner(userId);
  };

  return (
    <div className={className}>
      {label ? (
        <Label htmlFor={id || "ownerUserId"}>{label}</Label>
      ) : null}
      <div className={label ? "mt-1.5 relative" : "relative"}>
        <select
          id={id || "ownerUserId"}
          value={selected}
          onChange={(event) => handleChange(event.target.value)}
          disabled={loading || saving}
          className={
            compact
              ? "flex h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs disabled:opacity-60"
              : "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-60"
          }
        >
          <option value="">
            {canPersist
              ? "Assign owner…"
              : "Team default (you, unless a company default is set)"}
          </option>
          {members.map((member) => (
            <option key={member.id} value={member.id}>
              {member.full_name || member.email}
              {member.full_name && member.email ? ` (${member.email})` : ""}
            </option>
          ))}
        </select>
        {(loading || saving) && (
          <Loader2 className="absolute right-8 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-400" />
        )}
      </div>
      {hint ? (
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      ) : null}
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
