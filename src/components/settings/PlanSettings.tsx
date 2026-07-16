"use client";

import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, CreditCard } from "lucide-react";
import { toast } from "sonner";

type Billing = {
  plan: string;
  plan_label: string;
  description: string;
  status: string;
  seat_limit: number;
  seats_used: number;
  seats_remaining: number;
  trial_ends_at: string | null;
  stripe_connected: boolean;
  plans: { id: string; label: string; seat_limit: number; description: string }[];
};

export function PlanSettings() {
  const [data, setData] = useState<Billing | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/tenant/billing", {
          credentials: "include",
        });
        const json = await res.json();
        if (!res.ok) {
          toast.error(json.error || "Failed to load plan");
          return;
        }
        setData(json);
      } catch {
        toast.error("Failed to load plan");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) {
    return <p className="text-sm text-muted-foreground">Unable to load plan.</p>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Current plan
          </CardTitle>
          <CardDescription>{data.description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="text-sm px-3 py-1">{data.plan_label}</Badge>
            <Badge variant="outline">{data.status}</Badge>
          </div>
          <p className="text-sm">
            Seats: <strong>{data.seats_used}</strong> used of{" "}
            <strong>{data.seat_limit}</strong> ({data.seats_remaining} remaining)
          </p>
          {data.trial_ends_at && (
            <p className="text-sm text-muted-foreground">
              Trial ends {new Date(data.trial_ends_at).toLocaleDateString()}
            </p>
          )}
          <p className="text-sm text-muted-foreground border-t pt-3 mt-3">
            Self-serve billing (Stripe) is not enabled yet. Contact support or a
            Site Admin to change plans or seat limits.
            {data.stripe_connected ? " Stripe account linked." : ""}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Available packages</CardTitle>
          <CardDescription>
            Packaging preview — upgrade handled by platform admin for now
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2">
            {data.plans.map((p) => (
              <div
                key={p.id}
                className={`rounded-lg border p-4 ${
                  p.id === data.plan ? "border-blue-500 bg-blue-50/50" : ""
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{p.label}</span>
                  {p.id === data.plan && (
                    <Badge variant="secondary">Current</Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Up to {p.seat_limit} seats
                </p>
                <p className="text-sm mt-2">{p.description}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
