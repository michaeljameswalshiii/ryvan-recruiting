import { NextResponse } from "next/server";
import { GetItemCommand } from "@aws-sdk/client-dynamodb";
import { getRawDynamoClient, getTableName } from "@/lib/db/dynamodb";
import { requireSiteAdminSession, isAdminAuthError } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const auth = await requireSiteAdminSession();
  if (isAdminAuthError(auth)) return auth;

  const startedAt = performance.now();
  try {
    // A strongly consistent read of a deliberately absent profile key measures
    // the real DynamoDB round trip without changing application data.
    await getRawDynamoClient().send(
      new GetItemCommand({
        TableName: getTableName("profiles"),
        Key: { id: { S: "__performance_probe__" } },
        ConsistentRead: true,
        ProjectionExpression: "id",
      })
    );
    return NextResponse.json({
      status: "healthy",
      database: "DynamoDB",
      table: getTableName("profiles"),
      latencyMs: Math.round(performance.now() - startedAt),
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "unhealthy",
        database: "DynamoDB",
        table: getTableName("profiles"),
        latencyMs: Math.round(performance.now() - startedAt),
        error: error instanceof Error ? error.message : "Database probe failed",
        checkedAt: new Date().toISOString(),
      },
      { status: 503 }
    );
  }
}
