/**
 * Email Connections API
 * GET /api/email/connections
 *   ?userId= optional (defaults to session user)
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/server-auth";
import { getUserEmailConnections } from "@/lib/db/repositories/email-connection-repository";

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    const qUserId = request.nextUrl.searchParams.get("userId");
    const userId = session?.userId || qUserId;

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Only allow looking up your own connections (unless same as session)
    if (session?.userId && qUserId && qUserId !== session.userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const connections = await getUserEmailConnections(userId);
    const activeConnections = connections
      .filter(
        (c) => c.status === "active" && (!c.expiresAt || c.expiresAt > Date.now())
      )
      .map((c) => ({
        provider: c.provider,
        emailAddress: c.emailAddress,
      }));

    const safeConnections = connections.map((c) => ({
      provider: c.provider,
      emailAddress: c.emailAddress,
      status: c.status,
      lastSyncedAt: c.lastSyncedAt,
      createdAt: c.createdAt,
    }));

    return NextResponse.json({
      connections: safeConnections,
      activeConnections: activeConnections.map((c) => ({
        provider: c.provider,
        emailAddress: c.emailAddress,
      })),
      hasActive: activeConnections.length > 0,
    });
  } catch (error) {
    console.error("[Email Connections] Error:", error);
    return NextResponse.json(
      { error: "Failed to get connections" },
      { status: 500 }
    );
  }
}
