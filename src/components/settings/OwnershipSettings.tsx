"use client";

/**
 * Company admin: default owner for new CRM records.
 * Off → creator is always the owner.
 * On → a fixed team member is assigned on create.
 */

import { useCallback, useEffect, useState } from "react";
import { Loader2, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

type Member = { id: string; full_name: string; email: string; status?: string };

type OwnershipState = {
  useFixedDefaultOwner: boolean;
  defaultOwnerUserId?: string;
};

export function OwnershipSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [ownership, setOwnership] = useState<OwnershipState>({
    useFixedDefaultOwner: false,
  });
  const [members, setMembers] = useState<Member[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/tenant/ownership", {
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load");
      setOwnership({
        useFixedDefaultOwner: data.ownership?.useFixedDefaultOwner === true,
        defaultOwnerUserId: data.ownership?.defaultOwnerUserId || "",
      });
      setMembers(Array.isArray(data.members) ? data.members : []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load ownership");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (ownership.useFixedDefaultOwner && !ownership.defaultOwnerUserId) {
      toast.error("Select a team member to be the default owner");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/tenant/ownership", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          useFixedDefaultOwner: ownership.useFixedDefaultOwner,
          defaultOwnerUserId: ownership.defaultOwnerUserId || "",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      setOwnership({
        useFixedDefaultOwner: data.ownership?.useFixedDefaultOwner === true,
        defaultOwnerUserId: data.ownership?.defaultOwnerUserId || "",
      });
      toast.success(
        ownership.useFixedDefaultOwner
          ? "New records will use the fixed default owner"
          : "New records will be owned by whoever creates them",
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserCheck className="h-5 w-5" />
          Default record owner
        </CardTitle>
        <CardDescription>
          Controls who is assigned as owner when a candidate, company, job, or
          contact is created. By default, the person who adds the record becomes
          the owner.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5 max-w-lg">
        <div className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <input
            id="use-fixed-owner"
            type="checkbox"
            className="mt-1 h-4 w-4 rounded border-slate-300"
            checked={ownership.useFixedDefaultOwner}
            onChange={(e) =>
              setOwnership((prev) => ({
                ...prev,
                useFixedDefaultOwner: e.target.checked,
              }))
            }
          />
          <div className="space-y-1">
            <Label htmlFor="use-fixed-owner" className="cursor-pointer font-medium">
              Use a fixed default owner
            </Label>
            <p className="text-sm text-muted-foreground">
              When off, whoever creates the record is always the owner. When on,
              new records are assigned to the person you pick below (you can
              still reassign later).
            </p>
          </div>
        </div>

        <div
          className={
            ownership.useFixedDefaultOwner
              ? "space-y-2"
              : "space-y-2 opacity-50 pointer-events-none"
          }
        >
          <Label htmlFor="default-owner">Default owner</Label>
          <select
            id="default-owner"
            value={ownership.defaultOwnerUserId || ""}
            onChange={(e) =>
              setOwnership((prev) => ({
                ...prev,
                defaultOwnerUserId: e.target.value,
              }))
            }
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            disabled={!ownership.useFixedDefaultOwner}
          >
            <option value="">Select team member…</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.full_name || m.email}
                {m.email && m.full_name ? ` (${m.email})` : ""}
              </option>
            ))}
          </select>
          {ownership.useFixedDefaultOwner && members.length === 0 && (
            <p className="text-xs text-amber-700">
              No active team members found. Invite teammates under Team first.
            </p>
          )}
        </div>

        <Button type="button" onClick={() => void save()} disabled={saving}>
          {saving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…
            </>
          ) : (
            "Save ownership settings"
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
