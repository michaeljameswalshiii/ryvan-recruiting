import { NextRequest, NextResponse } from "next/server";
import {
  listTables,
  scanTableWithLimit,
  getItem,
  updateItem,
  putItem,
  deleteItem,
  queryItems,
  scanItems,
} from "@/lib/db/dynamodb";
import { requireSiteAdminSession, isAdminAuthError } from "@/lib/admin-auth";

/**
 * API Route: Admin DynamoDB Search Tool
 * =====================================
 * Full read + CRUD operations for DynamoDB tables.
 * REQUIRES Site Admin (multi-tenant). SITE_ADMIN_EMAIL_ALLOWLIST also works.
 * Set ADMIN_API_DISABLED=true to hard-disable.
 *
 * GET  /api/admin/dynamodb
 *   - no table → list tables
 *   - ?table=&action=get&key=JSON → get single item
 *   - ?table=&action=query&pkField=&pkValue=&skField=&skValue=&skOp= → query
 *   - ?table=&action=scan&limit=&filterAttr=&filterValue= → scan (optional contains filter)
 *   - ?table=&limit= → browse (scan with limit)
 *
 * POST   /api/admin/dynamodb?table= → create item
 * PATCH  /api/admin/dynamodb?table= → update item
 * DELETE /api/admin/dynamodb?table= → delete item
 */

const COMPOSITE_KEY_TABLES = [
  "turnkey-clients",
  "turnkey-leads",
  "turnkey-pipeline",
  "turnkey-jobs",
  "turnkey-issues",
  "turnkey-candidates",
];

const TABLE_KEY_FIELDS: Record<string, string[]> = {
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

function getKeyFields(tableName: string): string[] {
  return TABLE_KEY_FIELDS[tableName] || ["id"];
}

function parseJsonParam(value: string | null): Record<string, unknown> | null {
  if (!value) return null;
  try {
    return JSON.parse(decodeURIComponent(value));
  } catch {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
}

export async function GET(request: NextRequest) {
  try {
    const admin = await requireSiteAdminSession();
    if (isAdminAuthError(admin)) return admin;

    const { searchParams } = new URL(request.url);
    const tableName = searchParams.get("table");
    const action = (searchParams.get("action") || "browse").toLowerCase();
    const limit = Math.min(
      Math.max(parseInt(searchParams.get("limit") || "50", 10) || 50, 1),
      500
    );

    if (!tableName) {
      const allTables = await listTables();
      const tables = allTables
        .filter((t) => !t.toLowerCase().includes("candle"))
        .sort((a, b) => a.localeCompare(b));

      return NextResponse.json({
        success: true,
        tables,
        tableKeyFields: TABLE_KEY_FIELDS,
      });
    }

    const keyFields = getKeyFields(tableName);

    // ── Get item by primary key ──────────────────────────────────────────
    if (action === "get") {
      const key = parseJsonParam(searchParams.get("key"));
      if (!key || Object.keys(key).length === 0) {
        return NextResponse.json(
          { error: "key query param (JSON object) is required for get" },
          { status: 400 }
        );
      }

      const item = await getItem<Record<string, unknown>>(tableName, key);
      return NextResponse.json({
        success: true,
        table: tableName,
        items: item ? [item] : [],
        count: item ? 1 : 0,
        keyFields,
        mode: "get",
      });
    }

    // ── Query by partition key (+ optional sort key) ─────────────────────
    if (action === "query") {
      // Prefer structured params; fall back to legacy keyCondition
      const pkField = searchParams.get("pkField");
      const pkValue = searchParams.get("pkValue");
      const skField = searchParams.get("skField");
      const skValue = searchParams.get("skValue");
      const skOp = (searchParams.get("skOp") || "eq").toLowerCase();
      const legacyCondition = searchParams.get("keyCondition");
      const legacyValues = searchParams.get("keyConditionExpr");

      let keyCondition: string;
      let expressionValues: Record<string, unknown>;
      let expressionNames: Record<string, string> | undefined;

      if (pkField && pkValue !== null && pkValue !== undefined && pkValue !== "") {
        expressionNames = { "#pk": pkField };
        expressionValues = { ":pk": coerceValue(pkValue) };
        keyCondition = "#pk = :pk";

        if (skField && skValue !== null && skValue !== undefined && skValue !== "") {
          expressionNames["#sk"] = skField;
          if (skOp === "begins_with") {
            keyCondition += " AND begins_with(#sk, :sk)";
            expressionValues[":sk"] = coerceValue(skValue);
          } else if (skOp === "between") {
            const skValueTo = searchParams.get("skValueTo") || "";
            keyCondition += " AND #sk BETWEEN :skFrom AND :skTo";
            expressionValues[":skFrom"] = coerceValue(skValue);
            expressionValues[":skTo"] = coerceValue(skValueTo);
          } else {
            keyCondition += " AND #sk = :sk";
            expressionValues[":sk"] = coerceValue(skValue);
          }
        }
      } else if (legacyCondition && legacyValues) {
        keyCondition = legacyCondition;
        expressionValues = parseJsonParam(legacyValues) || {};
      } else {
        return NextResponse.json(
          {
            error:
              "Query requires pkField + pkValue (or legacy keyCondition + keyConditionExpr)",
          },
          { status: 400 }
        );
      }

      const result = await queryItems<Record<string, unknown>>(
        tableName,
        keyCondition,
        expressionValues,
        {
          expressionNames,
          limit,
        }
      );

      // queryItems returns { items, lastEvaluatedKey }
      const items = Array.isArray(result) ? result : result.items || [];

      return NextResponse.json({
        success: true,
        table: tableName,
        items,
        count: items.length,
        keyFields,
        mode: "query",
        lastEvaluatedKey: Array.isArray(result)
          ? undefined
          : result.lastEvaluatedKey,
      });
    }

    // ── Scan (with optional attribute contains filter) ───────────────────
    if (action === "scan" || action === "browse") {
      const filterAttr = searchParams.get("filterAttr");
      const filterValue = searchParams.get("filterValue");
      const filterOp = (searchParams.get("filterOp") || "contains").toLowerCase();

      if (filterAttr && filterValue) {
        // Use full scanItems with FilterExpression for attribute search
        const expressionNames = { "#f": filterAttr };
        const expressionValues: Record<string, unknown> = {
          ":v": coerceValue(filterValue),
        };
        let filterExpression: string;

        if (filterOp === "eq" || filterOp === "=") {
          filterExpression = "#f = :v";
        } else if (filterOp === "begins_with") {
          filterExpression = "begins_with(#f, :v)";
        } else {
          // contains — works for strings and sets
          filterExpression = "contains(#f, :v)";
        }

        const items = await scanItems<Record<string, unknown>>(
          tableName,
          filterExpression,
          expressionValues,
          expressionNames
        );

        // Cap response size after filter
        const limited = items.slice(0, limit);

        return NextResponse.json({
          success: true,
          table: tableName,
          items: limited,
          count: limited.length,
          matchedTotal: items.length,
          keyFields,
          mode: "scan",
          filtered: true,
        });
      }

      const items = await scanTableWithLimit<Record<string, unknown>>(
        tableName,
        limit
      );

      return NextResponse.json({
        success: true,
        table: tableName,
        items,
        count: items.length,
        keyFields,
        mode: action,
      });
    }

    return NextResponse.json(
      { error: `Unknown action: ${action}` },
      { status: 400 }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "DynamoDB operation failed";
    console.error("[DYNAMODB] Error:", message);

    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

/** Coerce string form values to number/boolean when obvious */
function coerceValue(raw: string): string | number | boolean {
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (raw !== "" && !Number.isNaN(Number(raw)) && /^-?\d+(\.\d+)?$/.test(raw)) {
    return Number(raw);
  }
  return raw;
}

export async function POST(request: NextRequest) {
  try {
    const admin = await requireSiteAdminSession();
    if (isAdminAuthError(admin)) return admin;

    const { searchParams } = new URL(request.url);
    const tableName = searchParams.get("table");

    if (!tableName) {
      return NextResponse.json({ error: "Table name is required" }, { status: 400 });
    }

    const body = await request.json();
    const { item } = body;

    if (!item) {
      return NextResponse.json({ error: "Item data is required" }, { status: 400 });
    }

    if (COMPOSITE_KEY_TABLES.includes(tableName)) {
      if (!item.tenant_id || !item.id) {
        return NextResponse.json(
          { error: `Table '${tableName}' requires both tenant_id and id` },
          { status: 400 }
        );
      }
    }

    const created = await putItem(tableName, item);

    return NextResponse.json({ success: true, created });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "DynamoDB create failed";
    console.error("[DYNAMODB] Error:", message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const admin = await requireSiteAdminSession();
    if (isAdminAuthError(admin)) return admin;

    const { searchParams } = new URL(request.url);
    const tableName = searchParams.get("table");

    if (!tableName) {
      return NextResponse.json({ error: "Table name is required" }, { status: 400 });
    }

    const body = await request.json();
    const { key, updates } = body;

    if (!key || !updates) {
      return NextResponse.json(
        { error: "Key and updates are required" },
        { status: 400 }
      );
    }

    if (COMPOSITE_KEY_TABLES.includes(tableName)) {
      if (!key.tenant_id || !key.id) {
        return NextResponse.json(
          { error: `Table '${tableName}' requires both tenant_id and id in key` },
          { status: 400 }
        );
      }
    }

    const updateExpressions: string[] = [];
    const expressionValues: Record<string, unknown> = {};
    const expressionNames: Record<string, string> = {};

    let idx = 1;
    for (const [field, value] of Object.entries(updates)) {
      updateExpressions.push(`#field${idx} = :value${idx}`);
      expressionValues[`:value${idx}`] = value;
      expressionNames[`#field${idx}`] = field;
      idx++;
    }

    const updateExpression = "SET " + updateExpressions.join(", ");

    const updated = await updateItem<Record<string, unknown>>(
      tableName,
      key,
      updateExpression,
      expressionValues,
      expressionNames
    );

    return NextResponse.json({ success: true, updated });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "DynamoDB update failed";
    console.error("[DYNAMODB] Error:", message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const admin = await requireSiteAdminSession();
    if (isAdminAuthError(admin)) return admin;

    const { searchParams } = new URL(request.url);
    const tableName = searchParams.get("table");

    if (!tableName) {
      return NextResponse.json({ error: "Table name is required" }, { status: 400 });
    }

    const body = await request.json();
    const { key } = body;

    if (!key) {
      return NextResponse.json({ error: "Key is required" }, { status: 400 });
    }

    if (COMPOSITE_KEY_TABLES.includes(tableName)) {
      if (!key.tenant_id || !key.id) {
        return NextResponse.json(
          { error: `Table '${tableName}' requires both tenant_id and id in key` },
          { status: 400 }
        );
      }
    }

    await deleteItem(tableName, key);

    return NextResponse.json({ success: true, deleted: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "DynamoDB delete failed";
    console.error("[DYNAMODB] Error:", message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
