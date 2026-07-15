/**
 * DynamoDB Viewer - Admin Debugging Page
 * ======================================
 * Editable viewer for inspecting and modifying DynamoDB tables.
 * 
 * Features:
 * - View all items in a table with editable cells
 * - Click-to-edit on any cell
 * - Save/Cancel editing
 * - PATCH API for updates
 * 
 * Auth: API requires admin session; middleware protects /admin routes.
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import { Search, RefreshCw, Database, Table as TableIcon, Save, X, Pencil, Check, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

interface DynamoDBResponse {
  success: boolean;
  tables?: string[];
  table?: string;
  items?: Record<string, unknown>[];
  count?: number;
  error?: string;
}

interface EditState {
  rowIndex: number;
  field: string;
  value: string | number | boolean | null;
}

interface CellEditState {
  [cellKey: string]: string | number | boolean | null;
}

export default function DynamoDBViewerPage() {
  const [tables, setTables] = useState<string[]>([]);
  const [selectedTable, setSelectedTable] = useState<string>("");
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [loadingTables, setLoadingTables] = useState(false);
  const [error, setError] = useState<string>("");
  
  // Edit state
  const [editingCell, setEditingCell] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [savingCell, setSavingCell] = useState<string | null>(null);

  // Fetch available tables
  const fetchTables = useCallback(async () => {
    setLoadingTables(true);
    setError("");
    
    try {
      const response = await fetch("/api/admin/dynamodb");
      const data: DynamoDBResponse = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || "Failed to fetch tables");
      }
      
      setTables(data.tables || []);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch tables";
      setError(message);
    } finally {
      setLoadingTables(false);
    }
  }, []);

  // Fetch items from selected table
  const fetchItems = useCallback(async (tableName: string) => {
    if (!tableName) return;
    
    setLoading(true);
    setError("");
    
    try {
      const response = await fetch(`/api/admin/dynamodb?table=${encodeURIComponent(tableName)}`);
      const data: DynamoDBResponse = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || "Failed to fetch items");
      }
      
      setItems(data.items || []);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch items";
      setError(message);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load tables on mount
  useEffect(() => {
    fetchTables();
  }, [fetchTables]);

  // Load items when table is selected
  useEffect(() => {
    if (selectedTable) {
      fetchItems(selectedTable);
    }
  }, [selectedTable, fetchItems]);

  // Filter items based on search
  const filteredItems = items.filter((item) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return JSON.stringify(item).toLowerCase().includes(query);
  });

  // Extract columns from items
  const getColumns = useCallback(() => {
    if (filteredItems.length === 0) return [];
    
    const allKeys = new Set<string>();
    filteredItems.forEach(item => {
      Object.keys(item).forEach(key => allKeys.add(key));
    });
    
    return Array.from(allKeys).map(key => ({
      key,
      label: key,
    }));
  }, [filteredItems]);

  const columns = getColumns();

// Get primary key fields for a table
  // Note: Tables with tenant-based access use composite keys (tenant_id + id)
  const getKeyFields = (tableName: string): string[] => {
    const keyFieldsMap: Record<string, string[]> = {
      "turnkey-tenants": ["id"],
      "turnkey-profiles": ["id"],
      // Composite key tables - require BOTH tenant_id and id for DynamoDB
      "turnkey-clients": ["tenant_id", "id"],
      "turnkey-leads": ["tenant_id", "id"],
      "turnkey-pipeline": ["tenant_id", "id"],
      "turnkey-sources": ["id"],
      "turnkey-email-logs": ["id"],
      "turnkey-events": ["id"],
      // Check candidates table - may vary
      "turnkey-candidates": ["id"],
    };
    return keyFieldsMap[tableName] || ["id"];
  };

  const keyFields = getKeyFields(selectedTable);

  // Determine if a field is editable (not a key field)
  const isEditable = (field: string): boolean => {
    return !keyFields.includes(field);
  };

  // Generate cell key
  const getCellKey = (rowIndex: number, field: string): string => {
    return `${rowIndex}-${field}`;
  };

  // Handle table selection
  const handleTableChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedTable(e.target.value);
    setSearchQuery("");
    setEditingCell(null);
  };

  // Handle refresh
  const handleRefresh = () => {
    setEditingCell(null);
    if (selectedTable) {
      fetchItems(selectedTable);
    } else {
      fetchTables();
    }
  };

  // Start editing a cell
  const handleStartEdit = (rowIndex: number, field: string, currentValue: unknown) => {
    if (!isEditable(field)) return;
    
    const cellKey = getCellKey(rowIndex, field);
    setEditingCell(cellKey);
    setEditValue(currentValue === null ? "" : String(currentValue));
  };

  // Cancel editing
  const handleCancelEdit = () => {
    setEditingCell(null);
    setEditValue("");
  };

  // Save edit
  const handleSaveEdit = async (rowIndex: number, field: string) => {
    const item = filteredItems[rowIndex];
    if (!item) return;
    
// Build key object
    const key: Record<string, unknown> = {};
    keyFields.forEach(kf => {
      key[kf] = item[kf];
    });
    
    // Build updates
    const updates: Record<string, unknown> = {};
    
    // Try to parse value as JSON, otherwise use string
    let parsedValue: unknown = editValue;
    try {
      parsedValue = JSON.parse(editValue);
    } catch {
      // Keep as string
    }
    
    updates[field] = parsedValue;
    
    const cellKey = getCellKey(rowIndex, field);
    setSavingCell(cellKey);
    setSaving(true);
    
    try {
      const response = await fetch(`/api/admin/dynamodb?table=${encodeURIComponent(selectedTable)}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ key, updates }),
      });
      
      const data = await response.json();
      
      if (!data.success && !response.ok) {
        throw new Error(data.error || "Failed to update item");
      }
      
      // Refresh items
      await fetchItems(selectedTable);
      setEditingCell(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save";
      setError(message);
    } finally {
      setSavingCell(null);
      setSaving(false);
    }
  };

  // Handle key press in edit input
  const handleKeyPress = (e: React.KeyboardEvent, rowIndex: number, field: string) => {
    if (e.key === "Enter") {
      handleSaveEdit(rowIndex, field);
    } else if (e.key === "Escape") {
      handleCancelEdit();
    }
  };

  // Format value for display
  const formatValue = (value: unknown): string => {
    if (value === null) return "null";
    if (value === undefined) return "";
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  };

  // Render editable cell
  const renderCell = (item: Record<string, unknown>, rowIndex: number, field: string) => {
    const value = item[field];
    const cellKey = getCellKey(rowIndex, field);
    const isEditing = editingCell === cellKey;
    const isSaving = savingCell === cellKey;
    const canEdit = isEditable(field);
    
    if (isEditing) {
      return (
        <td key={field} className="p-2 border bg-yellow-50">
          <div className="flex items-center gap-1">
            <Input
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={(e) => handleKeyPress(e, rowIndex, field)}
              className="h-7 text-sm"
              autoFocus
            />
            <Button
              size="sm"
              variant="ghost"
              onClick={() => handleSaveEdit(rowIndex, field)}
              disabled={saving}
              className="h-7 w-7 p-0"
            >
              <Check className="h-4 w-4 text-green-600" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleCancelEdit}
              disabled={saving}
              className="h-7 w-7 p-0"
            >
              <X className="h-4 w-4 text-red-600" />
            </Button>
          </div>
        </td>
      );
    }
    
    return (
      <td
        key={field}
        className={`p-2 border ${canEdit ? "cursor-pointer hover:bg-gray-50" : "bg-gray-50"}`}
        onClick={() => canEdit && handleStartEdit(rowIndex, field, value)}
      >
        <div className="flex items-center justify-between gap-1">
          <span className={`text-sm ${value === null ? "text-gray-400 italic" : ""}`}>
            {formatValue(value)}
          </span>
          {canEdit && <Pencil className="h-3 w-3 text-gray-400 opacity-0 group-hover:opacity-100" />}
        </div>
      </td>
    );
  };

  return (
    <div className="container mx-auto py-8 space-y-6">
{/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/admin" className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-8 w-8 text-primary" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold">DynamoDB Viewer</h1>
            <p className="text-muted-foreground">View and edit DynamoDB tables</p>
          </div>
        </div>
        <Button variant="outline" onClick={handleRefresh} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Table Selector */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TableIcon className="h-5 w-5" />
            Select Table
          </CardTitle>
          <CardDescription>Choose a DynamoDB table to view its contents</CardDescription>
        </CardHeader>
        <CardContent>
          {loadingTables ? (
            <p className="text-muted-foreground">Loading tables...</p>
          ) : tables.length > 0 ? (
            <select
              value={selectedTable}
              onChange={handleTableChange}
              className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer"
            >
              <option value="">-- Select a table --</option>
              {tables.map((table) => (
                <option key={table} value={table}>
                  {table}
                </option>
              ))}
            </select>
          ) : (
            <p className="text-muted-foreground">No tables found</p>
          )}
        </CardContent>
      </Card>

      {/* Error Display */}
      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <p className="text-destructive">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* Table Info & Search */}
      {selectedTable && (
        <Card>
          <CardHeader>
            <CardTitle>{selectedTable}</CardTitle>
            <CardDescription>
              {loading ? "Loading..." : `${filteredItems.length} items`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Search */}
            <div className="relative max-w-md mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search items..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            
            {/* Instructions */}
            <div className="text-sm text-muted-foreground mb-4">
              💡 Click on any cell to edit. Press Enter to save, Escape to cancel.
              {keyFields.length > 0 && (
                <span className="ml-2">
                  Key fields ({keyFields.join(", ")}) are not editable.
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results Table */}
      {selectedTable && !loading && filteredItems.length > 0 && columns.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Items ({filteredItems.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-muted">
                    <th className="p-2 border text-left font-semibold">#</th>
                    {columns.map((col) => (
                      <th key={col.key} className="p-2 border text-left font-semibold">
                        {col.label}
                        {keyFields.includes(col.key) && (
                          <span className="ml-1 text-xs text-gray-500">(key)</span>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((item, rowIndex) => (
                    <tr key={rowIndex} className="group hover:bg-gray-50">
                      <td className="p-2 border text-gray-500 text-xs">{rowIndex + 1}</td>
                      {columns.map((col) => renderCell(item, rowIndex, col.key))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty State */}
      {selectedTable && !loading && filteredItems.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <TableIcon className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <p className="text-muted-foreground">
              {searchQuery ? "No items match your search" : "No items in this table"}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
