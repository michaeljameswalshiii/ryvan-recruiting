/**
 * DynamoDB Viewer - Admin Debugging Page
 * ======================================
 * Simple viewer for inspecting DynamoDB tables.
 * 
 * TODO: Add auth guard for production
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import { Search, RefreshCw, Database, Table as TableIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
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

export default function DynamoDBViewerPage() {
  const [tables, setTables] = useState<string[]>([]);
  const [selectedTable, setSelectedTable] = useState<string>("");
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [loadingTables, setLoadingTables] = useState(false);
  const [error, setError] = useState<string>("");

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

  // Handle table selection
  const handleTableChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedTable(e.target.value);
    setSearchQuery("");
  };

  // Handle refresh
  const handleRefresh = () => {
    if (selectedTable) {
      fetchItems(selectedTable);
    } else {
      fetchTables();
    }
  };

  // Format JSON for display
  const formatJSON = (obj: unknown): string => {
    return JSON.stringify(obj, null, 2);
  };

  return (
    <div className="container mx-auto py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Database className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-3xl font-bold">DynamoDB Viewer</h1>
            <p className="text-muted-foreground">Debugging interface for DynamoDB tables</p>
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
                placeholder="Search items by any field..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {selectedTable && !loading && filteredItems.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Items ({filteredItems.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="bg-muted p-4 rounded-md overflow-x-auto max-h-[600px] overflow-y-auto text-sm">
              <code>{formatJSON(filteredItems)}</code>
            </pre>
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
