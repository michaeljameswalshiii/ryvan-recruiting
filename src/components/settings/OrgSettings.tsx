"use client";

import { useEffect, useRef, useState } from "react";
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
import { Loader2, Building2, Upload, ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { OwnershipSettings } from "@/components/settings/OwnershipSettings";

export function OrgSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [name, setName] = useState("");
  const [subdomain, setSubdomain] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#2563eb");
  const [tagline, setTagline] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

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

  const uploadLogo = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/tenant/branding", {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Upload failed");
        return;
      }
      setLogoUrl(data.logo_url || "");
      toast.success("Logo uploaded — lives on your careers page");
    } catch {
      toast.error("Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

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
        if (data.tenant.logo_url) setLogoUrl(data.tenant.logo_url);
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
    <div className="space-y-6">
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

          <div className="rounded-xl border border-dashed border-slate-300 p-4 space-y-3">
            <Label className="flex items-center gap-2">
              <ImageIcon className="h-4 w-4" />
              Careers logo
            </Label>
            {logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logoUrl}
                alt="Logo preview"
                className="h-16 w-auto max-w-[220px] object-contain"
              />
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif,.png,.jpg,.jpeg,.webp,.svg"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void uploadLogo(f);
              }}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={uploading}
                onClick={() => fileRef.current?.click()}
              >
                {uploading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Uploading…
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" />
                    Upload logo
                  </>
                )}
              </Button>
            </div>
            <div>
              <Label htmlFor="org-logo" className="text-xs text-muted-foreground">
                Or paste image URL
              </Label>
              <Input
                id="org-logo"
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                placeholder="https://… or /branding/…"
                className="mt-1"
              />
            </div>
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

    <OwnershipSettings />
    </div>
  );
}
