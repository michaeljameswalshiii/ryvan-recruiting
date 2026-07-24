/**
 * Tenant-scoped Apollo BYOK credentials.
 * One key per company (tenant): team admins set/update it; all members use it.
 * Encrypted at rest; never returned raw to the client.
 */
import { getItem, putItem, deleteItem, tableNames } from '../dynamodb';
import { encryptSecret, decryptSecret, maskSecret } from '../../crypto/secrets';

export interface TenantApolloCredentialsRecord {
  id: string; // apollo-cred#${tenantId}
  tenant_id: string;
  type: 'tenant_apollo_credentials';
  encryptedKey: string;
  keyHint: string;
  /** User who last saved/validated the key */
  providedByUserId: string;
  providedByEmail?: string;
  validatedAt?: string;
  lastValidatedOk?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TenantApolloPublic {
  hasKey: boolean;
  keyHint?: string;
  providedByUserId?: string;
  providedByEmail?: string;
  updatedAt?: string;
  lastValidatedOk?: boolean;
  /** Platform env key is also present (fallback when no tenant key) */
  hasPlatformKey?: boolean;
}

function recordId(tenantId: string) {
  return `apollo-cred#${tenantId}`;
}

export function hasPlatformApolloKey(): boolean {
  const key =
    process.env.APOLLO_API_KEY ||
    process.env.Apollo_API_key ||
    process.env.APOLLO_API_key ||
    process.env.apollo_api_key ||
    process.env.NEXT_PUBLIC_APOLLO_API_KEY ||
    '';
  return key.trim().length > 10;
}

export async function getTenantApolloRecord(
  tenantId: string
): Promise<TenantApolloCredentialsRecord | null> {
  if (!tenantId) return null;
  try {
    return await getItem<TenantApolloCredentialsRecord>(tableNames.profiles, {
      id: recordId(tenantId),
    });
  } catch (err) {
    console.error('[tenant-apollo] get failed', err);
    return null;
  }
}

export async function getTenantApolloPublic(
  tenantId: string
): Promise<TenantApolloPublic> {
  const rec = await getTenantApolloRecord(tenantId);
  return {
    hasKey: !!rec?.encryptedKey,
    keyHint: rec?.keyHint,
    providedByUserId: rec?.providedByUserId,
    providedByEmail: rec?.providedByEmail,
    updatedAt: rec?.updatedAt,
    lastValidatedOk: rec?.lastValidatedOk,
    hasPlatformKey: hasPlatformApolloKey(),
  };
}

export async function getDecryptedTenantApolloKey(
  tenantId: string
): Promise<string | null> {
  const rec = await getTenantApolloRecord(tenantId);
  if (!rec?.encryptedKey) return null;
  try {
    return decryptSecret(rec.encryptedKey);
  } catch (err) {
    console.error('[tenant-apollo] decrypt failed', err);
    return null;
  }
}

/**
 * Resolve Apollo key for a tenant:
 * 1) Tenant BYOK (shared company key)
 * 2) Platform env key
 */
export async function resolveApolloApiKey(
  tenantId?: string | null
): Promise<{ apiKey: string; source: 'tenant' | 'platform' } | null> {
  if (tenantId) {
    const tenantKey = await getDecryptedTenantApolloKey(tenantId);
    if (tenantKey && tenantKey.trim().length > 10) {
      return { apiKey: tenantKey.trim(), source: 'tenant' };
    }
  }
  const env =
    process.env.APOLLO_API_KEY ||
    process.env.Apollo_API_key ||
    process.env.APOLLO_API_key ||
    process.env.apollo_api_key ||
    process.env.NEXT_PUBLIC_APOLLO_API_KEY ||
    '';
  if (env.trim().length > 10) {
    return { apiKey: env.trim(), source: 'platform' };
  }
  return null;
}

/** Validate key against Apollo (light people search). */
export async function validateApolloApiKey(
  apiKey: string
): Promise<{ ok: boolean; message: string }> {
  const key = apiKey.trim();
  if (key.length < 12) {
    return { ok: false, message: 'API key looks too short' };
  }
  try {
    const res = await fetch(
      'https://api.apollo.io/api/v1/mixed_people/api_search',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
          'X-Api-Key': key,
          'Api-Key': key,
        },
        body: JSON.stringify({
          person_titles: ['software engineer'],
          per_page: 1,
          page: 1,
        }),
      }
    );
    if (res.ok) {
      return { ok: true, message: 'Apollo key validated' };
    }
    if (res.status === 401) {
      return { ok: false, message: 'Invalid Apollo API key (401)' };
    }
    if (res.status === 403) {
      return {
        ok: false,
        message:
          'Key accepted but plan/permissions blocked search (403). Use a master key with People Search access.',
      };
    }
    const text = await res.text().catch(() => '');
    return {
      ok: false,
      message: `Apollo returned ${res.status}${text ? `: ${text.slice(0, 120)}` : ''}`,
    };
  } catch (err: any) {
    return {
      ok: false,
      message: err?.message || 'Could not reach Apollo',
    };
  }
}

export async function saveTenantApolloKey(params: {
  tenantId: string;
  apiKey: string;
  userId: string;
  userEmail?: string;
  /** Skip live validation (default: validate) */
  skipValidation?: boolean;
}): Promise<TenantApolloPublic> {
  const { tenantId, userId, userEmail, skipValidation } = params;
  const trimmed = params.apiKey.trim();
  if (!tenantId) throw new Error('tenantId required');
  if (!userId) throw new Error('userId required');
  if (trimmed.length < 12) throw new Error('API key looks invalid');

  if (!skipValidation) {
    const v = await validateApolloApiKey(trimmed);
    if (!v.ok) throw new Error(v.message);
  }

  const now = new Date().toISOString();
  const existing = await getTenantApolloRecord(tenantId);
  const record: TenantApolloCredentialsRecord = {
    id: recordId(tenantId),
    tenant_id: tenantId,
    type: 'tenant_apollo_credentials',
    encryptedKey: encryptSecret(trimmed),
    keyHint: maskSecret(trimmed),
    providedByUserId: userId,
    providedByEmail: userEmail || existing?.providedByEmail,
    validatedAt: now,
    lastValidatedOk: true,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };

  await putItem(tableNames.profiles, {
    id: record.id,
    tenant_id: record.tenant_id,
    type: record.type,
    encryptedKey: record.encryptedKey,
    keyHint: record.keyHint,
    providedByUserId: record.providedByUserId,
    providedByEmail: record.providedByEmail,
    validatedAt: record.validatedAt,
    lastValidatedOk: record.lastValidatedOk,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });

  return getTenantApolloPublic(tenantId);
}

export async function deleteTenantApolloKey(
  tenantId: string
): Promise<TenantApolloPublic> {
  if (!tenantId) throw new Error('tenantId required');
  try {
    await deleteItem(tableNames.profiles, { id: recordId(tenantId) });
  } catch (err) {
    console.error('[tenant-apollo] delete failed', err);
  }
  return getTenantApolloPublic(tenantId);
}
