"use client";

import { useEffect, useState } from "react";
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
import { Loader2, Building2 } from "lucide-react";
import { toast } from "sonner";

export function OrgSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [subdomain, setSubdomain] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#2563eb");
  const [tagline, setTagline] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/tenant", { credentials: "include" });
        const data = await res.json();
        if (!res.ok) {
          toast.error(data.error || "Failed to load organization");
          return;
        }
        const t = data.tenant;
        setName(t.name || "");
        setSubdomain(t.subdomain || "");
        setLogoUrl(t.logo_url || "");
        setPrimaryColor(t.primary_color || "#2563eb");
        setTagline(t.careers_tagline || "");
      } catch {
        toast.error("Failed to load organization");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/tenant", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          subdomain: subdomain.toLowerCase().replace(/\s+/g, "-"),
          logo_url: logoUrl || "",
          primary_color: primaryColor || "",
          careers_tagline: tagline,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Save failed");
        return;
      }
      toast.success("Organization updated");
      if (data.tenant) {
        setSubdomain(data.tenant.subdomain || subdomain);
      }
    } catch {
      toast.error("Save failed");
    } finally {
      setSaving(false);
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
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="h-5 w-5" />
          Organization
        </CardTitle>
        <CardDescription>
          Branding appears on your public careers page (
          <code className="text-xs">/careers/{subdomain || "slug"}</code>)
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={save} className="space-y-4 max-w-lg">
          <div>
            <Label htmlFor="org-name">Company name</Label>
            <Input
              id="org-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1"
              required
            />
          </div>
          <div>
            <Label htmlFor="org-slug">Careers slug</Label>
            <Input
              id="org-slug"
              value={subdomain}
              onChange={(e) =>
                setSubdomain(
                  e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "")
                )
              }
              className="mt-1"
              required
            />
          </div>
          <div>
            <Label htmlFor="org-logo">Logo URL</Label>
            <Input
              id="org-logo"
              type="url"
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              placeholder="https://..."
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="org-color">Primary color</Label>
            <div className="mt-1 flex gap-2 items-center">
              <Input
                id="org-color"
                type="color"
                value={primaryColor || "#2563eb"}
                onChange={(e) => setPrimaryColor(e.target.value)}
                className="w-14 h-10 p-1"
              />
              <Input
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                className="flex-1"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="org-tagline">Careers tagline</Label>
            <Input
              id="org-tagline"
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              maxLength={200}
              className="mt-1"
            />
          </div>
          <Button type="submit" disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving…
              </>
            ) : (
              "Save organization"
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
