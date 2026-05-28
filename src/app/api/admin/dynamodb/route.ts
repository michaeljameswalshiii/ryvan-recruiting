import { NextRequest, NextResponse } from "next/server";
import { listTables, scanTableWithLimit, getItem, updateItem } from "@/lib/db/dynamodb";

/**
 * API Route: Admin DynamoDB Viewer
 * ================================
 * Server-side API for viewing DynamoDB tables.
 * 
 * GET /api/admin/dynamodb?table=<tableName>
 * - Returns list of tables if no table param
 * - Returns scanned items from specified table if table param provided
 * 
 * PATCH /api/admin/dynamodb?table=<tableName>
 * - Updates an item in the specified table
 * - Body: { key: Record<string, unknown>, updates: Record<string, unknown> }
 * 
 * TODO: Add auth guard for production
 */

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tableName = searchParams.get("table");

    // If no table specified, return list of tables
    if (!tableName) {
      console.log("[DYNAMODB] Listing tables");
      const tables = await listTables();
      
      return NextResponse.json({
        success: true,
        tables,
      });
    }

    // Scan the specified table
    console.log("[DYNAMODB] Scanning table:", tableName);
    const items = await scanTableWithLimit<Record<string, unknown>>(tableName, 100);

    return NextResponse.json({
      success: true,
      table: tableName,
      items,
      count: items.length,
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
