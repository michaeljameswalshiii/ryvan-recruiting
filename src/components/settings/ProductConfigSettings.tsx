"use client";

/**
 * Company Settings → Product configuration
 * Lightweight foundation for per-tenant customization & feature flags.
 */

import { useCallback, useEffect, useState } from "react";
import { Loader2, Settings2, Plus, Trash2 } from "lucide-react";
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
import type {
  TenantCustomFieldDef,
  TenantProductConfig,
} from "@/lib/tenant-config/types";
import { DEFAULT_TENANT_PRODUCT_CONFIG } from "@/lib/tenant-config/types";

export function ProductConfigSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<TenantProductConfig>(
    DEFAULT_TENANT_PRODUCT_CONFIG
  );
  const [newCustomer, setNewCustomer] = useState("");
  const [fieldDraft, setFieldDraft] = useState({
    key: "",
    label: "",
    entity: "candidate" as TenantCustomFieldDef["entity"],
    type: "text" as TenantCustomFieldDef["type"],
  });

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
      toast.error(e instanceof Error ? e.message : "Failed to load config");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(next: TenantProductConfig) {
    setSaving(true);
    try {
      const res = await fetch("/api/tenant/product-config", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to save");
      setConfig(data.config || next);
      toast.success("Product configuration saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  function toggleFeature(
    key: keyof NonNullable<TenantProductConfig["features"]>
  ) {
    const features = {
      ...config.features,
      [key]: !(config.features?.[key] ?? true),
    };
    void save({ ...config, features });
  }

  function addKnownCustomer() {
    const name = newCustomer.trim();
    if (!name) return;
    const known = [
      ...(config.workItems?.knownCustomers || []),
      name,
    ].filter((v, i, a) => a.indexOf(v) === i);
    setNewCustomer("");
    void save({
      ...config,
      workItems: { ...config.workItems, knownCustomers: known },
    });
  }

  function removeKnownCustomer(name: string) {
    const known = (config.workItems?.knownCustomers || []).filter(
      (c) => c !== name
    );
    void save({
      ...config,
      workItems: { ...config.workItems, knownCustomers: known },
    });
  }

  function addCustomField() {
    const key = fieldDraft.key
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, "_");
    const label = fieldDraft.label.trim();
    if (!key || !label) {
      toast.error("Key and label are required");
      return;
    }
    const existing = config.customFields || [];
    if (existing.some((f) => f.key === key && f.entity === fieldDraft.entity)) {
      toast.error("That field key already exists for this entity");
      return;
    }
    const field: TenantCustomFieldDef = {
      key,
      label,
      entity: fieldDraft.entity,
      type: fieldDraft.type,
      enabled: true,
    };
    setFieldDraft({
      key: "",
      label: "",
      entity: "candidate",
      type: "text",
    });
    void save({
      ...config,
      customFields: [...existing, field],
    });
  }

  function removeField(key: string, entity: string) {
    void save({
      ...config,
      customFields: (config.customFields || []).filter(
        (f) => !(f.key === key && f.entity === entity)
      ),
    });
  }

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
            <Settings2 className="h-5 w-5 text-blue-600" />
            Product configuration
          </CardTitle>
          <CardDescription className="text-slate-600">
            Per-organization customization foundation. Feature flags and a custom
            field catalog you can grow into as customers need different workflows
            — without forking the app.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-8 text-slate-900">
          <section>
            <h3 className="text-sm font-semibold text-slate-900">
              Feature flags
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              Turn capabilities on or off for this organization.
            </p>
            <ul className="mt-4 space-y-3">
              {(
                [
                  [
                    "workItemsCustomerRequests",
                    "Work items: customer-specific requests",
                    "Show customer request flag and filters on the Work items board",
                  ],
                  [
                    "mcpConnectors",
                    "Claude / MCP connectors",
                    "Allow remote MCP keys and OAuth clients for this org",
                  ],
                  [
                    "texting",
                    "Text messaging",
                    "Enable SMS / texting features when configured",
                  ],
                  [
                    "careersPublic",
                    "Public careers site",
                    "Allow public careers pages for this org",
                  ],
                ] as const
              ).map(([key, title, hint]) => {
                const on = config.features?.[key] ?? true;
                return (
                  <li
                    key={key}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 px-4 py-3"
                  >
                    <div>
                      <div className="text-sm font-medium">{title}</div>
                      <div className="text-xs text-slate-500">{hint}</div>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={saving}
                      onClick={() => toggleFeature(key)}
                      className={
                        on
                          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                          : "border-slate-200 text-slate-600"
                      }
                    >
                      {on ? "On" : "Off"}
                    </Button>
                  </li>
                );
              })}
            </ul>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-slate-900">
              Work items — known customers
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              Optional list for customer-request work items (typeahead-ready).
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Input
                value={newCustomer}
                onChange={(e) => setNewCustomer(e.target.value)}
                placeholder="Customer / account name"
                className="max-w-xs"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addKnownCustomer();
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={saving || !newCustomer.trim()}
                onClick={addKnownCustomer}
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                Add
              </Button>
            </div>
            {(config.workItems?.knownCustomers || []).length > 0 ? (
              <ul className="mt-3 flex flex-wrap gap-2">
                {(config.workItems?.knownCustomers || []).map((c) => (
                  <li
                    key={c}
                    className="inline-flex items-center gap-1 rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-900"
                  >
                    {c}
                    <button
                      type="button"
                      className="text-violet-600 hover:text-violet-900"
                      onClick={() => removeKnownCustomer(c)}
                      aria-label={`Remove ${c}`}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-xs text-slate-500">No known customers yet.</p>
            )}
          </section>

          <section>
            <h3 className="text-sm font-semibold text-slate-900">
              Custom field catalog
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              Define fields you may need per customer later (schema only for
              now). Values can be wired entity-by-entity as you gain traction.
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
              <div>
                <Label className="text-xs">Key</Label>
                <Input
                  value={fieldDraft.key}
                  onChange={(e) =>
                    setFieldDraft((d) => ({ ...d, key: e.target.value }))
                  }
                  placeholder="referral_source"
                  className="mt-1 font-mono text-xs"
                />
              </div>
              <div>
                <Label className="text-xs">Label</Label>
                <Input
                  value={fieldDraft.label}
                  onChange={(e) =>
                    setFieldDraft((d) => ({ ...d, label: e.target.value }))
                  }
                  placeholder="Referral source"
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">Entity</Label>
                <select
                  value={fieldDraft.entity}
                  onChange={(e) =>
                    setFieldDraft((d) => ({
                      ...d,
                      entity: e.target.value as TenantCustomFieldDef["entity"],
                    }))
                  }
                  className="mt-1 h-10 w-full rounded-md border border-slate-200 px-2 text-sm"
                >
                  <option value="candidate">Candidate</option>
                  <option value="job">Job</option>
                  <option value="company">Company</option>
                  <option value="contact">Contact</option>
                  <option value="work_item">Work item</option>
                </select>
              </div>
              <div>
                <Label className="text-xs">Type</Label>
                <select
                  value={fieldDraft.type}
                  onChange={(e) =>
                    setFieldDraft((d) => ({
                      ...d,
                      type: e.target.value as TenantCustomFieldDef["type"],
                    }))
                  }
                  className="mt-1 h-10 w-full rounded-md border border-slate-200 px-2 text-sm"
                >
                  <option value="text">Text</option>
                  <option value="number">Number</option>
                  <option value="boolean">Yes/No</option>
                  <option value="select">Select</option>
                  <option value="date">Date</option>
                </select>
              </div>
              <div className="flex items-end">
                <Button
                  type="button"
                  className="w-full bg-blue-600 hover:bg-blue-700"
                  disabled={saving}
                  onClick={addCustomField}
                >
                  <Plus className="mr-1 h-4 w-4" />
                  Add field
                </Button>
              </div>
            </div>

            {(config.customFields || []).length === 0 ? (
              <p className="mt-3 text-xs text-slate-500">
                No custom fields defined yet.
              </p>
            ) : (
              <ul className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-200">
                {(config.customFields || []).map((f) => (
                  <li
                    key={`${f.entity}:${f.key}`}
                    className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm"
                  >
                    <div>
                      <span className="font-medium">{f.label}</span>
                      <span className="ml-2 font-mono text-xs text-slate-500">
                        {f.entity}.{f.key}
                      </span>
                      <span className="ml-2 text-xs text-slate-400">
                        {f.type}
                      </span>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="border-red-200 text-red-600"
                      onClick={() => removeField(f.key, f.entity)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>

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
