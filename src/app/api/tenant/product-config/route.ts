/**
 * GET/PATCH /api/tenant/product-config
 * Per-tenant product configuration (feature flags, work-item prefs, custom fields catalog).
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession, getSessionTenantId } from "@/lib/server-auth";
import { hasPermission } from "@/lib/roles";
import {
  getTenantProductConfig,
  saveTenantProductConfig,
} from "@/lib/tenant-config/repository";
import type { TenantProductConfig } from "@/lib/tenant-config/types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getSession();
    const tenantId = await getSessionTenantId();
    if (!session?.userId || !tenantId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const config = await getTenantProductConfig(tenantId);
    return NextResponse.json({ config });
  } catch (error) {
    console.error("[GET /api/tenant/product-config]", error);
    return NextResponse.json(
      { error: "Failed to load product configuration" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await getSession();
    const tenantId = await getSessionTenantId();
    if (!session?.userId || !tenantId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!hasPermission(session.role, "team_admin")) {
      return NextResponse.json(
        { error: "Only organization admins can update product configuration" },
        { status: 403 }
      );
    }

    const body = (await request.json().catch(() => ({}))) as Partial<TenantProductConfig>;
    const config = await saveTenantProductConfig(tenantId, body, {
      userId: session.userId,
      email: session.email,
    });
    return NextResponse.json({ config, success: true });
  } catch (error) {
    console.error("[PATCH /api/tenant/product-config]", error);
    return NextResponse.json(
      { error: "Failed to save product configuration" },
      { status: 500 }
    );
  }
}
