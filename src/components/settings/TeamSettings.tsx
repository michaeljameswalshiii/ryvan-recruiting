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
import { Loader2, Copy, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { ROLE_LABELS, type AppRole } from "@/lib/roles";

type Member = {
  id: string;
  email: string;
  full_name: string;
  role: AppRole;
  status: string;
  created_at?: string;
};

export function TeamSettings() {
  const [members, setMembers] = useState<Member[]>([]);
  const [seatsUsed, setSeatsUsed] = useState(0);
  const [seatLimit, setSeatLimit] = useState(3);
  const [loading, setLoading] = useState(true);
  const [inviting, setInviting] = useState(false);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<"user" | "customer_admin">("user");
  const [lastInviteUrl, setLastInviteUrl] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/tenant/members", { credentials: "include" });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to load team");
        return;
      }
      setMembers(data.members || []);
      setSeatsUsed(data.seats_used ?? 0);
      setSeatLimit(data.seat_limit ?? 3);
    } catch {
      toast.error("Failed to load team");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviting(true);
    setLastInviteUrl(null);
    try {
      const res = await fetch("/api/tenant/invites", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          full_name: fullName || undefined,
          role,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Invite failed");
        return;
      }
      if (data.invite_url) {
        setLastInviteUrl(data.invite_url);
      }
      if (data.email_sent) {
        toast.success("Invite sent by email");
      } else {
        toast.success("Invite created — copy the link below");
      }
      setEmail("");
      setFullName("");
      await load();
    } catch {
      toast.error("Invite failed");
    } finally {
      setInviting(false);
    }
  };

  const changeRole = async (id: string, newRole: "user" | "customer_admin") => {
    try {
      const res = await fetch(`/api/tenant/members/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Update failed");
        return;
      }
      toast.success("Role updated");
      await load();
    } catch {
      toast.error("Update failed");
    }
  };

  const disable = async (id: string) => {
    if (!confirm("Disable this team member?")) return;
    try {
      const res = await fetch(`/api/tenant/members/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Could not disable");
        return;
      }
      toast.success("Member disabled");
      await load();
    } catch {
      toast.error("Could not disable");
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Invite teammate
          </CardTitle>
          <CardDescription>
            Seats used: {seatsUsed} / {seatLimit}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={invite} className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="invite-email">Email</Label>
              <Input
                id="invite-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="invite-name">Name (optional)</Label>
              <Input
                id="invite-name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="invite-role">Role</Label>
              <select
                id="invite-role"
                className="mt-1 w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={role}
                onChange={(e) =>
                  setRole(e.target.value as "user" | "customer_admin")
                }
              >
                <option value="user">User</option>
                <option value="customer_admin">Customer Admin</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" disabled={inviting || seatsUsed >= seatLimit}>
                {inviting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Inviting…
                  </>
                ) : (
                  "Send invite"
                )}
              </Button>
            </div>
          </form>
          {lastInviteUrl && (
            <div className="mt-4 rounded-lg border bg-muted/40 p-3 text-sm">
              <p className="mb-2 font-medium">Invite link (share securely)</p>
              <div className="flex gap-2">
                <Input readOnly value={lastInviteUrl} className="text-xs" />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    navigator.clipboard.writeText(lastInviteUrl);
                    toast.success("Copied");
                  }}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Team members</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="pb-2 pr-4">Name</th>
                <th className="pb-2 pr-4">Email</th>
                <th className="pb-2 pr-4">Role</th>
                <th className="pb-2 pr-4">Status</th>
                <th className="pb-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id} className="border-b last:border-0">
                  <td className="py-3 pr-4 font-medium">{m.full_name}</td>
                  <td className="py-3 pr-4">{m.email}</td>
                  <td className="py-3 pr-4">
                    {m.role === "site_admin" ? (
                      <Badge variant="secondary">
                        {ROLE_LABELS.site_admin}
                      </Badge>
                    ) : (
                      <select
                        className="h-8 rounded border px-2 text-xs"
                        value={
                          m.role === "customer_admin"
                            ? "customer_admin"
                            : "user"
                        }
                        disabled={m.status === "disabled"}
                        onChange={(e) =>
                          changeRole(
                            m.id,
                            e.target.value as "user" | "customer_admin"
                          )
                        }
                      >
                        <option value="user">User</option>
                        <option value="customer_admin">Customer Admin</option>
                      </select>
                    )}
                  </td>
                  <td className="py-3 pr-4">
                    <Badge
                      variant={
                        m.status === "active"
                          ? "default"
                          : m.status === "invited"
                            ? "secondary"
                            : "outline"
                      }
                    >
                      {m.status}
                    </Badge>
                  </td>
                  <td className="py-3">
                    {m.status !== "disabled" && m.role !== "site_admin" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-600"
                        onClick={() => disable(m.id)}
                      >
                        Disable
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
