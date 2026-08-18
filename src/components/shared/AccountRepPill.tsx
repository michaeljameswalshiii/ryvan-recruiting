"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { Check, ChevronDown, Loader2, Plus, UserRound } from "lucide-react";
import { displayOwnerName, isMachineActorId } from "@/lib/ownership/machine-actor";

type ObjectType = "candidate" | "company" | "job" | "contact";
type Member = { id: string; full_name: string; email: string };
type Assignment = {
  userId: string;
  userName: string;
  userEmail: string;
  role: string;
};

/**
 * Compact header control: a labeled pill that opens a teammate list.
 * Matches the product-owner mock — name in the pill, others + Add new in the menu.
 */
export function AccountRepPill({
  objectType,
  objectId,
  label = "Account Rep",
  assignmentRole = "owner",
  addNewHref = "/dashboard/settings/company?tab=team",
  className = "",
}: {
  objectType: ObjectType;
  objectId: string;
  label?: string;
  assignmentRole?: "owner" | "account_manager" | "recruiter" | "collaborator";
  addNewHref?: string;
  className?: string;
}) {
  const queryClient = useQueryClient();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [members, setMembers] = useState<Member[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);

  const endpoint = `/api/object-assignments/${objectType}/${encodeURIComponent(objectId)}`;

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [assignRes, membersRes] = await Promise.all([
        fetch(endpoint, { credentials: "include" }),
        fetch("/api/object-assignments/members", { credentials: "include" }),
      ]);
      const assignBody = await assignRes.json().catch(() => ({}));
      const membersBody = await membersRes.json().catch(() => ({}));
      if (!assignRes.ok) {
        throw new Error(assignBody?.error || "Unable to load account rep");
      }
      const nextAssignments: Assignment[] = Array.isArray(assignBody.assignments)
        ? assignBody.assignments
        : [];
      setAssignments(nextAssignments);
      const fromMembers = Array.isArray(membersBody.members)
        ? membersBody.members
        : Array.isArray(assignBody.members)
          ? assignBody.members
          : [];
      setMembers(fromMembers);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load account rep");
    } finally {
      setLoading(false);
    }
  }, [endpoint]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const current =
    assignments.find((row) => {
      if (isMachineActorId(row.userId) || isMachineActorId(row.userName)) {
        return false;
      }
      return (
        row.role === assignmentRole ||
        row.role === "owner" ||
        row.role === "account_manager"
      );
    }) ||
    assignments.find(
      (row) => !isMachineActorId(row.userId) && !isMachineActorId(row.userName)
    );
  const currentId = current?.userId || "";
  const currentName = displayOwnerName(
    current?.userName ||
      current?.userEmail ||
      members.find((m) => m.id === currentId)?.full_name ||
      ""
  );

  const assign = async (userId: string) => {
    if (!userId || userId === currentId) {
      setOpen(false);
      return;
    }
    setSaving(true);
    setError("");
    try {
      const primary = assignments.filter(
        (row) =>
          row.role === assignmentRole ||
          row.role === "owner" ||
          row.role === "account_manager"
      );
      for (const row of primary) {
        if (row.userId === userId) continue;
        await fetch(`${endpoint}?userId=${encodeURIComponent(row.userId)}`, {
          method: "DELETE",
          credentials: "include",
        });
      }
      const already = primary.some((row) => row.userId === userId);
      if (!already) {
        const post = await fetch(endpoint, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, role: assignmentRole }),
        });
        const body = await post.json().catch(() => ({}));
        if (!post.ok) throw new Error(body?.error || "Unable to assign");
      }
      await load();
      await queryClient.invalidateQueries({
        queryKey: ["object-assignment-owners", objectType],
      });
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to assign");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div ref={rootRef} className={`relative shrink-0 ${className}`}>
      <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">
        {label}
      </div>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        disabled={loading || saving}
        className="inline-flex h-8 max-w-[220px] items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-800 shadow-sm hover:border-blue-300 hover:bg-slate-50 disabled:opacity-60"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[9px] font-bold text-white">
          {loading ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : currentName ? (
            currentName
              .split(/\s+/)
              .map((part) => part[0])
              .join("")
              .slice(0, 2)
              .toUpperCase()
          ) : (
            <UserRound className="h-3 w-3" />
          )}
        </span>
        <span className="min-w-0 truncate">
          {loading ? "Loading…" : currentName || "Assign"}
        </span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
      </button>
      {open && (
        <div
          role="listbox"
          className="absolute right-0 z-40 mt-1 w-64 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg"
        >
          <div className="max-h-64 overflow-y-auto">
            {members.length ? (
              members.map((member) => {
                const selected = member.id === currentId;
                return (
                  <button
                    key={member.id}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    disabled={saving}
                    onClick={() => void assign(member.id)}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50 disabled:opacity-50 ${
                      selected ? "bg-blue-50 text-blue-800" : "text-slate-800"
                    }`}
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[10px] font-bold text-slate-700">
                      {(member.full_name || member.email || "?")
                        .split(/\s+/)
                        .map((part) => part[0])
                        .join("")
                        .slice(0, 2)
                        .toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">
                        {member.full_name || member.email}
                      </span>
                      {member.full_name && member.email ? (
                        <span className="block truncate text-[11px] text-slate-500">
                          {member.email}
                        </span>
                      ) : null}
                    </span>
                    {selected ? (
                      <Check className="h-3.5 w-3.5 shrink-0 text-blue-600" />
                    ) : null}
                  </button>
                );
              })
            ) : (
              <p className="px-3 py-3 text-xs text-slate-500">
                No teammates found.
              </p>
            )}
          </div>
          <div className="border-t border-slate-100">
            <Link
              href={addNewHref}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50"
              onClick={() => setOpen(false)}
            >
              <Plus className="h-3.5 w-3.5" />
              Add new teammate
            </Link>
          </div>
        </div>
      )}
      {error ? <p className="mt-1 max-w-[220px] text-[11px] text-red-600">{error}</p> : null}
    </div>
  );
}
