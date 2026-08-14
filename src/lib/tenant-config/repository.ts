/**
 * Persist / load tenant product configuration on the tenant Dynamo record.
 * @serverOnly
 */

import {
  getTenantById,
  updateTenant,
} from "@/lib/db/repositories/tenant-repository";
import {
  DEFAULT_TENANT_PRODUCT_CONFIG,
  TENANT_CONFIG_VERSION,
  type TenantProductConfig,
} from "@/lib/tenant-config/types";

function mergeConfig(
  stored: Partial<TenantProductConfig> | null | undefined
): TenantProductConfig {
  const base = DEFAULT_TENANT_PRODUCT_CONFIG;
  if (!stored || typeof stored !== "object") {
    return { ...base, features: { ...base.features }, workItems: { ...base.workItems } };
  }
  return {
    version: TENANT_CONFIG_VERSION,
    updatedAt: stored.updatedAt,
    updatedBy: stored.updatedBy,
    features: { ...base.features, ...(stored.features || {}) },
    workItems: { ...base.workItems, ...(stored.workItems || {}) },
    crm: { ...(base.crm || {}), ...(stored.crm || {}) },
    customFields: Array.isArray(stored.customFields)
      ? stored.customFields
      : base.customFields || [],
    extras: { ...(base.extras || {}), ...(stored.extras || {}) },
    tagTaxonomy: stored.tagTaxonomy
      ? {
          disabledIds: Array.isArray(stored.tagTaxonomy.disabledIds)
            ? stored.tagTaxonomy.disabledIds
            : [],
          extra: Array.isArray(stored.tagTaxonomy.extra)
            ? stored.tagTaxonomy.extra
            : [],
        }
      : undefined,
  };
}

export async function getTenantProductConfig(
  tenantId: string
): Promise<TenantProductConfig> {
  const tenant = await getTenantById(tenantId);
  const raw = (tenant as any)?.product_config as
    | Partial<TenantProductConfig>
    | undefined;
  return mergeConfig(raw);
}

export async function saveTenantProductConfig(
  tenantId: string,
  patch: Partial<TenantProductConfig>,
  actor?: { userId?: string; email?: string }
): Promise<TenantProductConfig> {
  const current = await getTenantProductConfig(tenantId);
  const next: TenantProductConfig = mergeConfig({
    ...current,
    ...patch,
    features: { ...current.features, ...(patch.features || {}) },
    workItems: { ...current.workItems, ...(patch.workItems || {}) },
    crm: { ...current.crm, ...(patch.crm || {}) },
    customFields:
      patch.customFields !== undefined
        ? patch.customFields
        : current.customFields,
    extras: { ...current.extras, ...(patch.extras || {}) },
    tagTaxonomy:
      patch.tagTaxonomy !== undefined
        ? patch.tagTaxonomy
        : current.tagTaxonomy,
    version: TENANT_CONFIG_VERSION,
    updatedAt: new Date().toISOString(),
    updatedBy: actor?.email || actor?.userId,
  });

  // Store under product_config on tenant item
  await updateTenant(tenantId, {
    product_config: next,
  } as any);

  return next;
}

export function isFeatureEnabled(
  config: TenantProductConfig,
  flag: keyof NonNullable<TenantProductConfig["features"]>
): boolean {
  const v = config.features?.[flag];
  if (v === undefined || v === null) return true;
  return !!v;
}
