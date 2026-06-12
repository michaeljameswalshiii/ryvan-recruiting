import { NextRequest, NextResponse } from "next/server";
import { 
  listTables, 
  scanTableWithLimit,
  getItem,
  updateItem,
  putItem,
  deleteItem,
  queryItems
} from "@/lib/db/dynamodb";

/**
 * API Route: Admin DynamoDB Admin Tool
 * ================================
 * Full CRUD operations for DynamoDB tables.
 * 
 * GET /api/admin/dynamodb?table=
 * - Returns list of tables if no table param
 * - Returns scanned items from specified table
 * - Supports query with keyCondition
 * 
 * POST /api/admin/dynamodb?table= - Create item
 * PATCH /api/admin/dynamodb?table= - Update item
 * DELETE /api/admin/dynamodb?table= - Delete item
 */

// Tables that require composite key (tenant_id + id)
const COMPOSITE_KEY_TABLES = [
  "turnkey-clients",
  "turnkey-leads", 
  "turnkey-pipeline",
];

// Key fields for each table
const TABLE_KEY_FIELDS: Record<string, string[]> = {
  "turnkey-tenants": ["id"],
  "turnkey-profiles": ["id"],
  "turnkey-clients": ["tenant_id", "id"],
  "turnkey-leads": ["tenant_id", "id"],
  "turnkey-pipeline": ["tenant_id", "id"],
  "turnkey-sources": ["id"],
  "turnkey-email-logs": ["id"],
  "turnkey-events": ["id"],
  "turnkey-candidates": ["id"],
};

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tableName = searchParams.get("table");
    const limit = parseInt(searchParams.get("limit") || "50");
    const cursor = searchParams.get("cursor");
    const keyCondition = searchParams.get("keyCondition");
    const keyConditionExpr = searchParams.get("keyConditionExpr");

    // If no table specified, return list of tables
    if (!tableName) {
      console.log("[DYNAMODB] Listing tables");
      const allTables = await listTables();
      
      // Filter out candle-garden tables
      const tables = allTables.filter(t => !t.toLowerCase().includes("candle"));
      
      return NextResponse.json({
        success: true,
        tables,
      });
    }

    // Handle query if keyCondition provided
    if (keyCondition && keyConditionExpr) {
      console.log("[DYNAMODB] Querying table:", tableName);
      const parsedValues = JSON.parse(decodeURIComponent(keyConditionExpr));
      const items = await queryItems<Record<string, unknown>>(
        tableName,
        keyCondition,
        parsedValues
      );
      
      return NextResponse.json({
        success: true,
        table: tableName,
        items,
        count: items.length,
        keyFields: TABLE_KEY_FIELDS[tableName] || ["id"],
      });
    }

    // Otherwise scan the table
    console.log("[DYNAMODB] Scanning table:", tableName, "limit:", limit);
const items = await scanTableWithLimit<Record<string, unknown>>(tableName, limit);
    
    // Get table key fields
    const keyFields = TABLE_KEY_FIELDS[tableName] || ["id"];

    return NextResponse.json({
      success: true,
      table: tableName,
      items,
      count: items.length,
      keyFields,
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "DynamoDB operation failed";
    console.error("[DYNAMODB] Error:", message);
    
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tableName = searchParams.get("table");

    if (!tableName) {
      return NextResponse.json(
        { error: "Table name is required" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { item } = body;

    if (!item) {
      return NextResponse.json(
        { error: "Item data is required" },
        { status: 400 }
      );
    }

    // Validate composite key tables have all required key fields
    if (COMPOSITE_KEY_TABLES.includes(tableName)) {
      if (!item.tenant_id || !item.id) {
        return NextResponse.json(
          { error: `Table '${tableName}' requires both tenant_id and id` },
          { status: 400 }
        );
      }
    }

    console.log("[DYNAMODB] Creating item in table:", tableName);
    
    const created = await putItem(tableName, item);

    return NextResponse.json({
      success: true,
      created,
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "DynamoDB create failed";
    console.error("[DYNAMODB] Error:", message);
    
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tableName = searchParams.get("table");

    if (!tableName) {
      return NextResponse.json(
        { error: "Table name is required" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { key, updates } = body;

    if (!key || !updates) {
      return NextResponse.json(
        { error: "Key and updates are required" },
        { status: 400 }
      );
    }

    // Validate composite key tables have all required key fields
    if (COMPOSITE_KEY_TABLES.includes(tableName)) {
      if (!key.tenant_id || !key.id) {
        return NextResponse.json(
          { error: `Table '${tableName}' requires both tenant_id and id in key` },
          { status: 400 }
        );
      }
    }

    console.log("[DYNAMODB] Updating item in table:", tableName);
    console.log("[DYNAMODB] Key:", key);
    console.log("[DYNAMODB] Updates:", updates);

    // Build update expression
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

    return NextResponse.json({
      success: true,
      updated,
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "DynamoDB update failed";
    console.error("[DYNAMODB] Error:", message);
    
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tableName = searchParams.get("table");

    if (!tableName) {
      return NextResponse.json(
        { error: "Table name is required" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { key } = body;

    if (!key) {
      return NextResponse.json(
        { error: "Key is required" },
        { status: 400 }
      );
    }

    // Validate composite key tables have all required key fields
    if (COMPOSITE_KEY_TABLES.includes(tableName)) {
      if (!key.tenant_id || !key.id) {
        return NextResponse.json(
          { error: `Table '${tableName}' requires both tenant_id and id in key` },
          { status: 400 }
        );
      }
    }

    console.log("[DYNAMODB] Deleting item from table:", tableName);

    await deleteItem(tableName, key);

    return NextResponse.json({
      success: true,
      deleted: true,
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "DynamoDB delete failed";
    console.error("[DYNAMODB] Error:", message);
    
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
