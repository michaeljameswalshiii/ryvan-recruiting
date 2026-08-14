"use client";

/**
 * Company Settings → Tags
 * Enable/disable the master library and add custom tags for this org.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Tags, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  BASE_TAXONOMY,
  TAG_FACETS,
  TAG_OBJECT_TYPES,
  type TagFacet,
  type TagObjectType,
} from "@/lib/tags";
import type { TenantProductConfig } from "@/lib/tenant-config/types";
import { DEFAULT_TENANT_PRODUCT_CONFIG } from "@/lib/tenant-config/types";

const FACET_LABELS: Record<string, string> = {
  industry: "Industry",
  functional: "Function",
  skill: "Skills",
  software: "Software",
  certification: "Certifications",
  seniority: "Seniority",
  specialty: "Specialty",
  language: "Languages",
  employment_type: "Employment type",
  work_preference: "Work style",
  company_size: "Company size",
  decision_role: "Decision roles",
  other: "Other",
};

type ExtraTag = NonNullable<
  NonNullable<TenantProductConfig["tagTaxonomy"]>["extra"]
>[number];

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function facetLabel(facet: string): string {
  return FACET_LABELS[facet] || facet.replace(/_/g, " ");
}

export function TagTaxonomySettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<TenantProductConfig>(
    DEFAULT_TENANT_PRODUCT_CONFIG
  );
  const [idTouched, setIdTouched] = useState(false);
  const [draft, setDraft] = useState({
    id: "",
    label: "",
    facet: "skill" as TagFacet,
    synonyms: "",
    objects: [...TAG_OBJECT_TYPES] as TagObjectType[],
  });

  const disabledIds = config.tagTaxonomy?.disabledIds || [];
  const extra = config.tagTaxonomy?.extra || [];
  const disabledSet = useMemo(() => new Set(disabledIds), [disabledIds]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/tenant/product-config", {
        credentials: "include",
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to load");
      setConfig(data.config || DEFAULT_TENANT_PRODUCT_CONFIG);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load tags");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveTaxonomy(
    tagTaxonomy: NonNullable<TenantProductConfig["tagTaxonomy"]>
  ) {
    setSaving(true);
    try {
      const next = { ...config, tagTaxonomy };
      const res = await fetch("/api/tenant/product-config", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to save");
      setConfig(data.config || next);
      toast.success("Tag library saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  function toggleTag(id: string, enabled: boolean) {
    const nextDisabled = enabled
      ? disabledIds.filter((item) => item !== id)
      : [...new Set([...disabledIds, id])];
    void saveTaxonomy({
      disabledIds: nextDisabled,
      extra,
    });
  }

  function addCustomTag() {
    const label = draft.label.trim();
    const id = slugify(draft.id || label);
    if (!id || !label) {
      toast.error("Id and label are required");
      return;
    }
    if (BASE_TAXONOMY.some((row) => row.id === id) || extra.some((row) => row.id === id)) {
      toast.error("That tag id already exists");
      return;
    }
    const objects = draft.objects.length
      ? draft.objects
      : [...TAG_OBJECT_TYPES];
    const synonyms = draft.synonyms
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const row: ExtraTag = {
      id,
      label,
      facet: draft.facet,
      synonyms,
      objects,
    };
    setDraft({
      id: "",
      label: "",
      facet: "skill",
      synonyms: "",
      objects: [...TAG_OBJECT_TYPES],
    });
    setIdTouched(false);
    void saveTaxonomy({
      disabledIds,
      extra: [...extra, row],
    });
  }

  function removeCustomTag(id: string) {
    void saveTaxonomy({
      disabledIds: disabledIds.filter((item) => item !== id),
      extra: extra.filter((row) => row.id !== id),
    });
  }

  const groups = useMemo(() => {
    const map = new Map<
      string,
      Array<{ source: "base" | "custom"; row: ExtraTag }>
    >();
    for (const facet of TAG_FACETS) map.set(facet, []);
    for (const row of BASE_TAXONOMY) {
      map.get(row.facet)?.push({ source: "base", row });
    }
    for (const row of extra) {
      const facet = TAG_FACETS.includes(row.facet as TagFacet)
        ? row.facet
        : "other";
      if (!map.has(facet)) map.set(facet, []);
      map.get(facet)!.push({ source: "custom", row });
    }
    return [...map.entries()].filter(([, rows]) => rows.length > 0);
  }, [extra]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card data-ink-on-light className="border-slate-200 bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-slate-900">
            <Tags className="h-5 w-5 text-blue-600" />
            Tag library
          </CardTitle>
          <CardDescription className="text-slate-600">
            Turn tags on or off for this organization, or add your own. Search
            and matching use only the tags you keep enabled.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-8 text-slate-900">
          <section>
            <h3 className="text-sm font-semibold text-slate-900">
              Add a custom tag
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              Use a short id (slug), a recruiter-facing label, and where it
              applies.
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <Label className="text-xs">Label</Label>
                <Input
                  value={draft.label}
                  onChange={(e) => {
                    const label = e.target.value;
                    setDraft((d) => ({
                      ...d,
                      label,
                      id: idTouched ? d.id : slugify(label),
                    }));
                  }}
                  placeholder="Injection Molding"
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">Id (slug)</Label>
                <Input
                  value={draft.id}
                  onChange={(e) => {
                    setIdTouched(true);
                    setDraft((d) => ({ ...d, id: slugify(e.target.value) }));
                  }}
                  placeholder="injection-molding"
                  className="mt-1 font-mono text-xs"
                />
              </div>
              <div>
                <Label className="text-xs">Facet</Label>
                <select
                  value={draft.facet}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      facet: e.target.value as TagFacet,
                    }))
                  }
                  className="mt-1 h-10 w-full rounded-md border border-slate-200 px-2 text-sm"
                >
                  {TAG_FACETS.map((facet) => (
                    <option key={facet} value={facet}>
                      {facetLabel(facet)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label className="text-xs">Synonyms (comma)</Label>
                <Input
                  value={draft.synonyms}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, synonyms: e.target.value }))
                  }
                  placeholder="lsr, injection moulding"
                  className="mt-1"
                />
              </div>
            </div>
            <div className="mt-3">
              <Label className="text-xs">Applies to</Label>
              <div className="mt-2 flex flex-wrap gap-3">
                {TAG_OBJECT_TYPES.map((object) => {
                  const checked = draft.objects.includes(object);
                  return (
                    <label
                      key={object}
                      className="inline-flex items-center gap-2 text-sm capitalize"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setDraft((d) => ({
                            ...d,
                            objects: checked
                              ? d.objects.filter((item) => item !== object)
                              : [...d.objects, object],
                          }))
                        }
                      />
                      {object}
                    </label>
                  );
                })}
              </div>
            </div>
            <div className="mt-3">
              <Button
                type="button"
                className="bg-blue-600 hover:bg-blue-700"
                disabled={saving || !draft.label.trim()}
                onClick={addCustomTag}
              >
                <Plus className="mr-1 h-4 w-4" />
                Add tag
              </Button>
            </div>
          </section>

          {groups.map(([facet, rows]) => {
            const enabledCount = rows.filter(
              (item) => !disabledSet.has(item.row.id)
            ).length;
            return (
              <section key={facet}>
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="text-sm font-semibold text-slate-900">
                    {facetLabel(facet)}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {enabledCount} of {rows.length} on
                  </p>
                </div>
                <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {rows.map(({ source, row }) => {
                    const on = !disabledSet.has(row.id);
                    return (
                      <li
                        key={`${source}:${row.id}`}
                        className={`flex items-start justify-between gap-2 rounded-xl border px-3 py-2.5 ${
                          on
                            ? "border-slate-200 bg-white"
                            : "border-slate-200 bg-slate-50 opacity-70"
                        }`}
                      >
                        <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-2">
                          <input
                            type="checkbox"
                            className="mt-1"
                            checked={on}
                            disabled={saving}
                            onChange={(e) =>
                              toggleTag(row.id, e.target.checked)
                            }
                          />
                          <span className="min-w-0">
                            <span className="block text-sm font-medium text-slate-900">
                              {row.label}
                              {source === "custom" ? (
                                <span className="ml-1.5 rounded-full bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-800">
                                  Custom
                                </span>
                              ) : null}
                            </span>
                            <span className="mt-0.5 block font-mono text-[11px] text-slate-500">
                              {row.id}
                            </span>
                            {(row.synonyms || []).length > 0 ? (
                              <span className="mt-0.5 block truncate text-[11px] text-slate-500">
                                {(row.synonyms || []).join(", ")}
                              </span>
                            ) : null}
                          </span>
                        </label>
                        {source === "custom" ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="shrink-0 border-red-200 text-red-600"
                            disabled={saving}
                            onClick={() => removeCustomTag(row.id)}
                            aria-label={`Remove ${row.label}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}

          {config.updatedAt ? (
            <p className="text-xs text-slate-400">
              Last updated {new Date(config.updatedAt).toLocaleString()}
              {config.updatedBy ? ` · ${config.updatedBy}` : ""}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
