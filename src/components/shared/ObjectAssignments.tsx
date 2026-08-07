"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, UserPlus, Users, X } from "lucide-react";

type ObjectType = "candidate" | "company" | "job" | "contact";
type Member = { id: string; full_name: string; email: string };
type Assignment = {
  userId: string;
  userName: string;
  userEmail: string;
  role: string;
};

export function ObjectAssignments({
  objectType,
  objectId,
  className = "",
  compact = false,
  label = "Owners",
  assignmentRole = "owner",
}: {
  objectType: ObjectType;
  objectId: string;
  className?: string;
  compact?: boolean;
  label?: string;
  assignmentRole?: "owner" | "account_manager" | "recruiter" | "collaborator";
}) {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [busyUserId, setBusyUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const endpoint = `/api/object-assignments/${objectType}/${encodeURIComponent(objectId)}`;

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(endpoint, { credentials: "include" });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error || "Unable to load owners");
      setAssignments(Array.isArray(body.assignments) ? body.assignments : []);
      setMembers(Array.isArray(body.members) ? body.members : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load owners");
    } finally {
      setLoading(false);
    }
  }, [endpoint]);

  useEffect(() => {
    void load();
  }, [load]);

  const availableMembers = useMemo(() => {
    const assigned = new Set(assignments.map((item) => item.userId));
    return members.filter((member) => !assigned.has(member.id));
  }, [assignments, members]);

  const assign = async () => {
    if (!selectedUserId) return;
    setBusyUserId(selectedUserId);
    setError("");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: selectedUserId, role: assignmentRole }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error || "Unable to assign owner");
      setSelectedUserId("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to assign owner");
    } finally {
      setBusyUserId("");
    }
  };

  const remove = async (userId: string) => {
    setBusyUserId(userId);
    setError("");
    try {
      const response = await fetch(`${endpoint}?userId=${encodeURIComponent(userId)}`, {
        method: "DELETE",
        credentials: "include",
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error || "Unable to remove owner");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to remove owner");
    } finally {
      setBusyUserId("");
    }
  };

  return (
    <div
      className={`${compact ? "min-w-[210px] lg:max-w-[300px]" : "rounded-xl border border-slate-200 bg-white p-4 shadow-sm"} ${className}`}
    >
      <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">
        <Users className="h-3.5 w-3.5 text-blue-600" /> {label}
      </div>
      {loading ? (
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading {label.toLowerCase()}...
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5">
            {assignments.map((assignment) => (
              <span
                key={assignment.userId}
                className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-medium text-blue-800"
                title={assignment.userEmail}
              >
                {assignment.userName || assignment.userEmail}
                <button
                  type="button"
                  onClick={() => void remove(assignment.userId)}
                  disabled={busyUserId === assignment.userId}
                  className="rounded-full p-0.5 hover:bg-blue-100 disabled:opacity-50"
                  aria-label={`Remove ${assignment.userName || assignment.userEmail}`}
                >
                  {busyUserId === assignment.userId ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <X className="h-3 w-3" />
                  )}
                </button>
              </span>
            ))}
            {!assignments.length && (
              <span className="text-xs text-slate-500">No {label.toLowerCase()} assigned.</span>
            )}
          </div>
          {availableMembers.length > 0 && (
            <div className="mt-2 flex gap-1.5">
              <select
                value={selectedUserId}
                onChange={(event) => setSelectedUserId(event.target.value)}
                className="h-8 min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2 text-xs"
                aria-label="Select team member"
              >
                <option value="">Assign team member...</option>
                {availableMembers.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.full_name || member.email}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => void assign()}
                disabled={!selectedUserId || Boolean(busyUserId)}
                className="inline-flex h-8 items-center gap-1 rounded-md bg-blue-600 px-2.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                <UserPlus className="h-3.5 w-3.5" /> Assign
              </button>
            </div>
          )}
        </>
      )}
      {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
    </div>
  );
}
