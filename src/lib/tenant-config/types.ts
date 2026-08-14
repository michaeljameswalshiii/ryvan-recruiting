/**
 * Tenant product configuration — foundation for per-customer customization.
 *
 * Keep this schema additive (versioned). Features read defaults when keys
 * are missing so old tenants keep working without migrations.
 */

export const TENANT_CONFIG_VERSION = 1 as const;

/** Feature flags — safe booleans for gradual rollout */
export type TenantFeatureFlags = {
  /** Work items: customer-request field & filter (default true) */
  workItemsCustomerRequests?: boolean;
  /** Careers public site (default true when careers used) */
  careersPublic?: boolean;
  /** Texting / SMS (default follows env + setup) */
  texting?: boolean;
  /** Remote MCP / Claude connectors (default true for admins) */
  mcpConnectors?: boolean;
};

/**
 * Declared custom field definitions (data layer ready; UI can expand later).
 * Values would live on the entity; this only stores the schema.
 */
export type TenantCustomFieldDef = {
  key: string;
  label: string;
  entity: "candidate" | "job" | "company" | "contact" | "work_item";
  type: "text" | "number" | "boolean" | "select" | "date";
  options?: string[];
  required?: boolean;
  enabled?: boolean;
};

export type TenantWorkItemsConfig = {
  /** Label used in UI for customer-request badge (default "Customer") */
  customerRequestLabel?: string;
  /** Optional list of known customer names for typeahead later */
  knownCustomers?: string[];
};

export type TenantCrmConfig = {
  /** Prefer stages list override later */
  notes?: string;
};

export type TenantProductConfig = {
  version: typeof TENANT_CONFIG_VERSION;
  updatedAt?: string;
  updatedBy?: string;
  features?: TenantFeatureFlags;
  workItems?: TenantWorkItemsConfig;
  crm?: TenantCrmConfig;
  /** Extensible custom field catalog */
  customFields?: TenantCustomFieldDef[];
  /**
   * Free-form key/value for experiments (prefer typed sections when stable).
   * Do not store secrets here.
   */
  extras?: Record<string, string | number | boolean | null>;
  /** Recruiter-controlled tag library overlays. */
  tagTaxonomy?: {
    disabledIds?: string[];
    extra?: Array<{
      id: string;
      label: string;
      facet: string;
      synonyms?: string[];
      objects?: Array<"candidate" | "job" | "company" | "contact">;
    }>;
  };
};

export const DEFAULT_TENANT_PRODUCT_CONFIG: TenantProductConfig = {
  version: TENANT_CONFIG_VERSION,
  features: {
    workItemsCustomerRequests: true,
    careersPublic: true,
    texting: true,
    mcpConnectors: true,
  },
  workItems: {
    customerRequestLabel: "Customer",
    knownCustomers: [],
  },
  customFields: [],
  extras: {},
};
