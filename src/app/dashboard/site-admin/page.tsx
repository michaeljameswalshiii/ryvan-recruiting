"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Building2, RefreshCw, Save } from "lucide-react";
import { toast } from "sonner";
import { PLAN_IDS, TENANT_STATUSES } from "@/lib/plans";

type TenantRow = {
  id: string;
  name: string;
  subdomain: string;
  plan: string;
  plan_label: string;
  status: string;
  seat_limit: number;
  seats_used: number;
  member_count: number;
  created_at?: string;
};

type Member = {
  id: string;
  email: string;
  full_name: string;
  role: string;
  status: string;
};

export default function SiteAdminPage() {
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editPlan, setEditPlan] = useState("free");
  const [editSeats, setEditSeats] = useState(3);
  const [editStatus, setEditStatus] = useState("active");
  const [editName, setEditName] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/site-admin/tenants", {
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to load tenants");
        return;
      }
      setTenants(data.tenants || []);
    } catch {
      toast.error("Failed to load tenants");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openDetail = async (id: string) => {
    setSelectedId(id);
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/site-admin/tenants/${id}`, {
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to load tenant");
        return;
      }
      const t = data.tenant;
      setEditPlan(t.plan || "free");
      setEditSeats(t.seat_limit ?? 3);
      setEditStatus(t.status || "active");
      setEditName(t.name || "");
      setMembers(data.members || []);
    } catch {
      toast.error("Failed to load tenant");
    } finally {
      setDetailLoading(false);
    }
  };

  const saveTenant = async () => {
    if (!selectedId) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/site-admin/tenants/${selectedId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName,
          plan: editPlan,
          seat_limit: Number(editSeats),
          status: editStatus,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Save failed");
        return;
      }
      toast.success("Tenant updated");
      await load();
      await openDetail(selectedId);
    } catch {
      toast.error("Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Building2 className="h-8 w-8" />
            Site Admin
          </h1>
          <p className="text-muted-foreground mt-2">
            Multi-tenant console — plans, seats, and status
          </p>
        </div>
        <Button variant="outline" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Tenants</CardTitle>
            <CardDescription>{tenants.length} organizations</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {loading ? (
              <div className="flex justify-center py-10">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 pr-2">Name</th>
                    <th className="pb-2 pr-2">Slug</th>
                    <th className="pb-2 pr-2">Plan</th>
                    <th className="pb-2 pr-2">Seats</th>
                    <th className="pb-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {tenants.map((t) => (
                    <tr
                      key={t.id}
                      className={`border-b cursor-pointer hover:bg-muted/50 ${
                        selectedId === t.id ? "bg-blue-50" : ""
                      }`}
                      onClick={() => openDetail(t.id)}
                    >
                      <td className="py-2.5 pr-2 font-medium">{t.name}</td>
                      <td className="py-2.5 pr-2 text-xs">{t.subdomain}</td>
                      <td className="py-2.5 pr-2">{t.plan_label}</td>
                      <td className="py-2.5 pr-2">
                        {t.seats_used}/{t.seat_limit}
                      </td>
                      <td className="py-2.5">
                        <Badge
                          variant={
                            t.status === "active" || t.status === "trial"
                              ? "default"
                              : "outline"
                          }
                        >
                          {t.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Tenant detail</CardTitle>
            <CardDescription>
              {selectedId ? "Edit plan packaging" : "Select a tenant"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!selectedId ? (
              <p className="text-sm text-muted-foreground">
                Click a row to manage plan, seats, and status.
              </p>
            ) : detailLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <Label>Name</Label>
                  <Input
                    className="mt-1"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Plan</Label>
                  <select
                    className="mt-1 w-full h-10 rounded-md border px-3 text-sm"
                    value={editPlan}
                    onChange={(e) => setEditPlan(e.target.value)}
                  >
                    {PLAN_IDS.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label>Seat limit</Label>
                  <Input
                    type="number"
                    min={1}
                    max={1000}
                    className="mt-1"
                    value={editSeats}
                    onChange={(e) => setEditSeats(Number(e.target.value))}
                  />
                </div>
                <div>
                  <Label>Status</Label>
                  <select
                    className="mt-1 w-full h-10 rounded-md border px-3 text-sm"
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value)}
                  >
                    {TENANT_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                <Button onClick={saveTenant} disabled={saving} className="w-full">
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  Save changes
                </Button>

                <div className="border-t pt-4">
                  <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">
                    Members ({members.length})
                  </p>
                  <ul className="space-y-1 max-h-48 overflow-y-auto text-sm">
                    {members.map((m) => (
                      <li key={m.id} className="flex justify-between gap-2">
                        <span className="truncate">
                          {m.full_name || m.email}
                        </span>
                        <span className="text-xs text-muted-foreground shrink-0">
                          {m.role} · {m.status}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
