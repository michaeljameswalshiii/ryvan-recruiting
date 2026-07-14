/**
 * Dynamo Search Tool
 * ==================
 * Modern admin UI for querying DynamoDB tables:
 * Get by key · Query · Scan / filter · Browse
 */

"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Search,
  RefreshCw,
  Database,
  KeyRound,
  Filter,
  ScanSearch,
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
  X,
  Loader2,
  Table as TableIcon,
  Trash2,
  Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type Mode = "get" | "query" | "scan" | "browse";

interface ApiResponse {
  success: boolean;
  tables?: string[];
  tableKeyFields?: Record<string, string[]>;
  table?: string;
  items?: Record<string, unknown>[];
  count?: number;
  matchedTotal?: number;
  keyFields?: string[];
  mode?: string;
  error?: string;
  lastEvaluatedKey?: Record<string, unknown>;
}

const MODE_META: Record<
  Mode,
  { label: string; description: string; icon: typeof KeyRound }
> = {
  get: {
    label: "Get",
    description: "Fetch one item by primary key",
    icon: KeyRound,
  },
  query: {
    label: "Query",
    description: "Efficient lookup by partition key (+ optional sort key)",
    icon: Search,
  },
  scan: {
    label: "Scan / Filter",
    description: "Scan with an attribute filter (contains / equals)",
    icon: Filter,
  },
  browse: {
    label: "Browse",
    description: "Load a limited sample of the table",
    icon: ScanSearch,
  },
};

const DEFAULT_KEY_MAP: Record<string, string[]> = {
  "turnkey-tenants": ["id"],
  "turnkey-profiles": ["id"],
  "turnkey-clients": ["tenant_id", "id"],
  "turnkey-leads": ["tenant_id", "id"],
  "turnkey-pipeline": ["tenant_id", "id"],
  "turnkey-jobs": ["tenant_id", "id"],
  "turnkey-issues": ["tenant_id", "id"],
  "turnkey-candidates": ["tenant_id", "id"],
  "turnkey-sources": ["id"],
  "turnkey-email-logs": ["id"],
  "turnkey-events": ["id"],
  "turnkey-bedrock-usage": ["id"],
  "turnkey-contacts": ["tenant_id", "id"],
};

function formatCell(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "";
  if (typeof value === "object") {
    try {
      const s = JSON.stringify(value);
      return s.length > 80 ? s.slice(0, 77) + "…" : s;
    } catch {
      return "[object]";
    }
  }
  const s = String(value);
  return s.length > 80 ? s.slice(0, 77) + "…" : s;
}

function isComplex(value: unknown): boolean {
  return value !== null && typeof value === "object";
}

export default function DynamoSearchToolPage() {
  const [tables, setTables] = useState<string[]>([]);
  const [tableKeyFields, setTableKeyFields] =
    useState<Record<string, string[]>>(DEFAULT_KEY_MAP);
  const [selectedTable, setSelectedTable] = useState("");
  const [mode, setMode] = useState<Mode>("query");
  const [limit, setLimit] = useState(50);

  // Get / Query key inputs
  const [keyValues, setKeyValues] = useState<Record<string, string>>({});
  const [pkField, setPkField] = useState("tenant_id");
  const [pkValue, setPkValue] = useState("");
  const [skField, setSkField] = useState("id");
  const [skValue, setSkValue] = useState("");
  const [skOp, setSkOp] = useState<"eq" | "begins_with" | "between">("eq");
  const [skValueTo, setSkValueTo] = useState("");
  const [useSortKey, setUseSortKey] = useState(false);

  // Scan filter
  const [filterAttr, setFilterAttr] = useState("");
  const [filterValue, setFilterValue] = useState("");
  const [filterOp, setFilterOp] = useState<"contains" | "eq" | "begins_with">(
    "contains"
  );

  // Results
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [keyFields, setKeyFields] = useState<string[]>(["id"]);
  const [resultMeta, setResultMeta] = useState<{
    count: number;
    matchedTotal?: number;
    mode?: string;
  } | null>(null);
  const [clientFilter, setClientFilter] = useState("");
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [copied, setCopied] = useState(false);

  const [loadingTables, setLoadingTables] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);

  const resolvedKeyFields = useMemo(() => {
    if (!selectedTable) return ["id"];
    return tableKeyFields[selectedTable] || DEFAULT_KEY_MAP[selectedTable] || ["id"];
  }, [selectedTable, tableKeyFields]);

  // Sync key field defaults when table changes
  useEffect(() => {
    if (!selectedTable) return;
    const keys = tableKeyFields[selectedTable] || DEFAULT_KEY_MAP[selectedTable] || ["id"];
    setKeyFields(keys);
    const next: Record<string, string> = {};
    keys.forEach((k) => {
      next[k] = keyValues[k] || "";
    });
    setKeyValues(next);
    setPkField(keys[0] || "id");
    setSkField(keys[1] || "id");
    setUseSortKey(keys.length > 1);
    setItems([]);
    setSelectedIndex(null);
    setResultMeta(null);
    setError("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTable]);

  const fetchTables = useCallback(async () => {
    setLoadingTables(true);
    setError("");
    try {
      const res = await fetch("/api/admin/dynamodb");
      const data: ApiResponse = await res.json();
      if (!data.success && data.error) throw new Error(data.error);
      setTables(data.tables || []);
      if (data.tableKeyFields) {
        setTableKeyFields((prev) => ({ ...prev, ...data.tableKeyFields }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to list tables");
    } finally {
      setLoadingTables(false);
    }
  }, []);

  useEffect(() => {
    fetchTables();
  }, [fetchTables]);

  const runSearch = async () => {
    if (!selectedTable) {
      setError("Select a table first");
      return;
    }

    setLoading(true);
    setError("");
    setSelectedIndex(null);
    setExpandedRows(new Set());

    try {
      const params = new URLSearchParams({
        table: selectedTable,
        action: mode,
        limit: String(limit),
      });

      if (mode === "get") {
        const key: Record<string, string> = {};
        for (const k of resolvedKeyFields) {
          const v = (keyValues[k] || "").trim();
          if (!v) {
            throw new Error(`Key field "${k}" is required for Get`);
          }
          key[k] = v;
        }
        params.set("key", JSON.stringify(key));
      }

      if (mode === "query") {
        if (!pkField.trim() || !pkValue.trim()) {
          throw new Error("Partition key field and value are required for Query");
        }
        params.set("pkField", pkField.trim());
        params.set("pkValue", pkValue.trim());
        if (useSortKey && skField.trim() && skValue.trim()) {
          params.set("skField", skField.trim());
          params.set("skValue", skValue.trim());
          params.set("skOp", skOp);
          if (skOp === "between") {
            params.set("skValueTo", skValueTo.trim());
          }
        }
      }

      if (mode === "scan") {
        if (filterAttr.trim() && filterValue.trim()) {
          params.set("filterAttr", filterAttr.trim());
          params.set("filterValue", filterValue.trim());
          params.set("filterOp", filterOp);
        }
      }

      const res = await fetch(`/api/admin/dynamodb?${params.toString()}`);
      const data: ApiResponse = await res.json();

      if (!res.ok || data.success === false) {
        throw new Error(data.error || "Query failed");
      }

      setItems(data.items || []);
      if (data.keyFields) setKeyFields(data.keyFields);
      setResultMeta({
        count: data.count ?? (data.items || []).length,
        matchedTotal: data.matchedTotal,
        mode: data.mode,
      });
    } catch (err) {
      setItems([]);
      setResultMeta(null);
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setLoading(false);
    }
  };

  const filteredItems = useMemo(() => {
    if (!clientFilter.trim()) return items;
    const q = clientFilter.toLowerCase();
    return items.filter((item) =>
      JSON.stringify(item).toLowerCase().includes(q)
    );
  }, [items, clientFilter]);

  const columns = useMemo(() => {
    const keys = new Set<string>();
    // Prefer key fields first
    keyFields.forEach((k) => keys.add(k));
    filteredItems.forEach((item) => {
      Object.keys(item).forEach((k) => keys.add(k));
    });
    return Array.from(keys);
  }, [filteredItems, keyFields]);

  // Cap visible columns in the grid; rest still in detail panel
  const visibleColumns = useMemo(() => {
    const priority = new Set(keyFields);
    const preferred = [
      "name",
      "email",
      "title",
      "company",
      "status",
      "stage",
      "created_at",
      "updated_at",
      "tenant_id",
      "id",
    ];
    const rest = columns.filter((c) => !priority.has(c));
    const ordered = [
      ...keyFields.filter((k) => columns.includes(k)),
      ...preferred.filter((p) => rest.includes(p)),
      ...rest.filter((r) => !preferred.includes(r)),
    ];
    return ordered.slice(0, 8);
  }, [columns, keyFields]);

  const selectedItem =
    selectedIndex !== null ? filteredItems[selectedIndex] : null;

  const copyJson = async (value: unknown) => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(value, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Could not copy to clipboard");
    }
  };

  const handleDelete = async () => {
    if (!selectedTable || !selectedItem) return;
    if (
      !confirm(
        "Delete this item from DynamoDB? This cannot be undone."
      )
    ) {
      return;
    }

    const key: Record<string, unknown> = {};
    for (const k of keyFields) {
      if (selectedItem[k] === undefined) {
        setError(`Missing key field "${k}" on selected item`);
        return;
      }
      key[k] = selectedItem[k];
    }

    setDeleting(true);
    setError("");
    try {
      const res = await fetch(
        `/api/admin/dynamodb?table=${encodeURIComponent(selectedTable)}`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key }),
        }
      );
      const data = await res.json();
      if (!res.ok || data.success === false) {
        throw new Error(data.error || "Delete failed");
      }
      setItems((prev) =>
        prev.filter((item) =>
          !keyFields.every((k) => item[k] === selectedItem[k])
        )
      );
      setSelectedIndex(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  };

  const toggleExpand = (idx: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  return (
    <div className="space-y-6 max-w-[1600px]">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-xl bg-orange-100 text-orange-700 flex items-center justify-center">
            <Database className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Dynamo Search Tool
            </h1>
            <p className="text-sm text-muted-foreground">
              Query DynamoDB by key, partition, or attribute filter
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          onClick={fetchTables}
          disabled={loadingTables}
        >
          <RefreshCw
            className={`h-4 w-4 mr-2 ${loadingTables ? "animate-spin" : ""}`}
          />
          Refresh tables
        </Button>
      </div>

      {/* Query builder */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <TableIcon className="h-4 w-4" />
            Query builder
          </CardTitle>
          <CardDescription>
            Pick a table and mode, then run a targeted lookup instead of
            dumping the whole table.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Table + limit */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2">
              <label className="text-xs font-medium text-gray-600 mb-1 block">
                Table
              </label>
              <select
                value={selectedTable}
                onChange={(e) => setSelectedTable(e.target.value)}
                className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                disabled={loadingTables}
              >
                <option value="">
                  {loadingTables ? "Loading tables…" : "— Select a table —"}
                </option>
                {tables.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              {selectedTable && (
                <p className="text-xs text-muted-foreground mt-1">
                  Keys:{" "}
                  <span className="font-mono text-gray-700">
                    {resolvedKeyFields.join(" + ")}
                  </span>
                </p>
              )}
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">
                Limit
              </label>
              <Input
                type="number"
                min={1}
                max={500}
                value={limit}
                onChange={(e) =>
                  setLimit(
                    Math.min(500, Math.max(1, parseInt(e.target.value, 10) || 50))
                  )
                }
              />
            </div>
          </div>

          {/* Mode tabs */}
          <div className="flex flex-wrap gap-2">
            {(Object.keys(MODE_META) as Mode[]).map((m) => {
              const meta = MODE_META[m];
              const Icon = meta.icon;
              const active = mode === m;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    active
                      ? "bg-orange-50 border-orange-300 text-orange-800"
                      : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {meta.label}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground -mt-1">
            {MODE_META[mode].description}
          </p>

          {/* Mode-specific fields */}
          {mode === "get" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-lg bg-gray-50 border">
              {resolvedKeyFields.map((field) => (
                <div key={field}>
                  <label className="text-xs font-medium text-gray-600 mb-1 block font-mono">
                    {field}
                  </label>
                  <Input
                    placeholder={`Value for ${field}`}
                    value={keyValues[field] || ""}
                    onChange={(e) =>
                      setKeyValues((prev) => ({
                        ...prev,
                        [field]: e.target.value,
                      }))
                    }
                    onKeyDown={(e) => e.key === "Enter" && runSearch()}
                  />
                </div>
              ))}
            </div>
          )}

          {mode === "query" && (
            <div className="space-y-3 p-3 rounded-lg bg-gray-50 border">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">
                    Partition key field
                  </label>
                  <Input
                    value={pkField}
                    onChange={(e) => setPkField(e.target.value)}
                    className="font-mono"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">
                    Partition key value
                  </label>
                  <Input
                    placeholder="e.g. tenant uuid"
                    value={pkValue}
                    onChange={(e) => setPkValue(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && runSearch()}
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={useSortKey}
                  onChange={(e) => setUseSortKey(e.target.checked)}
                  className="rounded border-gray-300"
                />
                Also filter by sort key
              </label>

              {useSortKey && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs font-medium text-gray-600 mb-1 block">
                      Sort key field
                    </label>
                    <Input
                      value={skField}
                      onChange={(e) => setSkField(e.target.value)}
                      className="font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600 mb-1 block">
                      Operator
                    </label>
                    <select
                      value={skOp}
                      onChange={(e) =>
                        setSkOp(
                          e.target.value as "eq" | "begins_with" | "between"
                        )
                      }
                      className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                    >
                      <option value="eq">=</option>
                      <option value="begins_with">begins_with</option>
                      <option value="between">between</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600 mb-1 block">
                      Sort key value
                    </label>
                    <Input
                      value={skValue}
                      onChange={(e) => setSkValue(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && runSearch()}
                    />
                  </div>
                  {skOp === "between" && (
                    <div className="sm:col-span-3">
                      <label className="text-xs font-medium text-gray-600 mb-1 block">
                        Sort key upper bound
                      </label>
                      <Input
                        value={skValueTo}
                        onChange={(e) => setSkValueTo(e.target.value)}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {mode === "scan" && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 rounded-lg bg-gray-50 border">
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">
                  Attribute name
                </label>
                <Input
                  placeholder="e.g. email"
                  value={filterAttr}
                  onChange={(e) => setFilterAttr(e.target.value)}
                  className="font-mono"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">
                  Operator
                </label>
                <select
                  value={filterOp}
                  onChange={(e) =>
                    setFilterOp(
                      e.target.value as "contains" | "eq" | "begins_with"
                    )
                  }
                  className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                >
                  <option value="contains">contains</option>
                  <option value="eq">equals</option>
                  <option value="begins_with">begins_with</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">
                  Value
                </label>
                <Input
                  placeholder="search text"
                  value={filterValue}
                  onChange={(e) => setFilterValue(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && runSearch()}
                />
              </div>
              <p className="sm:col-span-3 text-xs text-amber-700">
                Scan + filter reads the table (filtered server-side). Prefer
                Query/Get when you know the key. Leave attribute empty to scan
                unfiltered up to the limit.
              </p>
            </div>
          )}

          {mode === "browse" && (
            <div className="p-3 rounded-lg bg-gray-50 border text-sm text-muted-foreground">
              Loads up to <strong>{limit}</strong> items from{" "}
              <span className="font-mono">
                {selectedTable || "the selected table"}
              </span>{" "}
              with no filter. Useful for a quick sample.
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              onClick={runSearch}
              disabled={loading || !selectedTable}
              className="bg-orange-600 hover:bg-orange-700 text-white"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Search className="h-4 w-4 mr-2" />
              )}
              Run search
            </Button>
            {(items.length > 0 || error) && (
              <Button
                variant="outline"
                onClick={() => {
                  setItems([]);
                  setError("");
                  setResultMeta(null);
                  setSelectedIndex(null);
                  setClientFilter("");
                }}
              >
                <X className="h-4 w-4 mr-2" />
                Clear results
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Results */}
      {(resultMeta || loading) && (
        <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
          <Card className="xl:col-span-3">
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base">Results</CardTitle>
                  <CardDescription>
                    {loading
                      ? "Running…"
                      : `${filteredItems.length} shown` +
                        (clientFilter
                          ? ` (filtered from ${items.length})`
                          : "") +
                        (resultMeta?.matchedTotal !== undefined
                          ? ` · ${resultMeta.matchedTotal} matched server-side`
                          : "") +
                        (resultMeta?.mode ? ` · mode: ${resultMeta.mode}` : "")}
                  </CardDescription>
                </div>
                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Filter results…"
                    value={clientFilter}
                    onChange={(e) => {
                      setClientFilter(e.target.value);
                      setSelectedIndex(null);
                    }}
                    className="pl-9 h-9"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-16 text-muted-foreground">
                  <Loader2 className="h-6 w-6 animate-spin mr-2" />
                  Querying DynamoDB…
                </div>
              ) : filteredItems.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground text-sm">
                  No items returned. Try a different mode or key.
                </div>
              ) : (
                <div className="overflow-x-auto rounded-md border">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="bg-muted/60">
                        <th className="p-2 border-b text-left w-8" />
                        <th className="p-2 border-b text-left text-xs font-semibold text-gray-500 w-10">
                          #
                        </th>
                        {visibleColumns.map((col) => (
                          <th
                            key={col}
                            className="p-2 border-b text-left text-xs font-semibold whitespace-nowrap"
                          >
                            <span className="font-mono">{col}</span>
                            {keyFields.includes(col) && (
                              <span className="ml-1 text-[10px] uppercase text-orange-600">
                                key
                              </span>
                            )}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredItems.map((item, idx) => {
                        const expanded = expandedRows.has(idx);
                        const active = selectedIndex === idx;
                        return (
                          <React.Fragment key={idx}>
                            <tr
                              onClick={() => setSelectedIndex(idx)}
                              className={`cursor-pointer border-b transition-colors ${
                                active
                                  ? "bg-orange-50"
                                  : "hover:bg-gray-50"
                              }`}
                            >
                              <td className="p-2">
                                <button
                                  type="button"
                                  onClick={(e) => toggleExpand(idx, e)}
                                  className="text-gray-400 hover:text-gray-700"
                                  aria-label="Expand row"
                                >
                                  {expanded ? (
                                    <ChevronDown className="h-4 w-4" />
                                  ) : (
                                    <ChevronRight className="h-4 w-4" />
                                  )}
                                </button>
                              </td>
                              <td className="p-2 text-xs text-gray-400">
                                {idx + 1}
                              </td>
                              {visibleColumns.map((col) => (
                                <td
                                  key={col}
                                  className={`p-2 max-w-[220px] truncate ${
                                    isComplex(item[col])
                                      ? "font-mono text-xs text-blue-700"
                                      : item[col] === null
                                        ? "italic text-gray-400"
                                        : ""
                                  }`}
                                  title={formatCell(item[col])}
                                >
                                  {formatCell(item[col])}
                                </td>
                              ))}
                            </tr>
                            {expanded && (
                              <tr className="bg-slate-50">
                                <td
                                  colSpan={visibleColumns.length + 2}
                                  className="p-3"
                                >
                                  <pre className="text-xs overflow-x-auto max-h-64 font-mono bg-slate-900 text-slate-100 p-3 rounded-lg">
                                    {JSON.stringify(item, null, 2)}
                                  </pre>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Detail panel */}
          <Card className="xl:col-span-2">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Eye className="h-4 w-4" />
                  Item detail
                </CardTitle>
                {selectedItem && (
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => copyJson(selectedItem)}
                    >
                      {copied ? (
                        <Check className="h-3.5 w-3.5 mr-1 text-green-600" />
                      ) : (
                        <Copy className="h-3.5 w-3.5 mr-1" />
                      )}
                      Copy JSON
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleDelete}
                      disabled={deleting}
                      className="text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1" />
                      Delete
                    </Button>
                  </div>
                )}
              </div>
              <CardDescription>
                {selectedItem
                  ? "Full document for the selected row"
                  : "Select a row to inspect the full item"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!selectedItem ? (
                <div className="py-16 text-center text-sm text-muted-foreground border border-dashed rounded-lg">
                  No item selected
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-1.5">
                    {keyFields.map((k) => (
                      <span
                        key={k}
                        className="inline-flex items-center gap-1 text-xs bg-orange-100 text-orange-800 px-2 py-1 rounded-md font-mono"
                      >
                        {k}=
                        <span className="font-semibold">
                          {String(selectedItem[k] ?? "—")}
                        </span>
                      </span>
                    ))}
                  </div>
                  <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
                    {Object.entries(selectedItem).map(([k, v]) => (
                      <div
                        key={k}
                        className="rounded-md border bg-white px-3 py-2"
                      >
                        <div className="text-[11px] uppercase tracking-wide text-gray-400 font-semibold mb-0.5 flex items-center justify-between">
                          <span className="font-mono normal-case text-gray-600">
                            {k}
                            {keyFields.includes(k) && (
                              <span className="ml-1 text-orange-500 text-[10px]">
                                KEY
                              </span>
                            )}
                          </span>
                          <button
                            type="button"
                            className="text-gray-400 hover:text-gray-700"
                            onClick={() => copyJson(v)}
                            title="Copy value"
                          >
                            <Copy className="h-3 w-3" />
                          </button>
                        </div>
                        {isComplex(v) ? (
                          <pre className="text-xs font-mono whitespace-pre-wrap break-all text-slate-800">
                            {JSON.stringify(v, null, 2)}
                          </pre>
                        ) : (
                          <div
                            className={`text-sm break-all ${
                              v === null
                                ? "italic text-gray-400"
                                : "text-gray-900"
                            }`}
                          >
                            {v === null ? "null" : String(v)}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Empty first-run tip */}
      {!resultMeta && !loading && !error && (
        <Card className="border-dashed">
          <CardContent className="py-10 text-center space-y-2">
            <Database className="h-10 w-10 mx-auto text-muted-foreground/40" />
            <p className="font-medium text-gray-700">Ready to search</p>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Choose a table, pick <strong>Get</strong> for a single key,{" "}
              <strong>Query</strong> by partition key,{" "}
              <strong>Scan / Filter</strong> by any attribute, or{" "}
              <strong>Browse</strong> a sample — then hit Run search.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
