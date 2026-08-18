/**
 * Tenant-bound OAuth 2.1 credentials and tokens for the remote MCP server.
 * Client secrets are shown once and stored only as hashes.
 * @serverOnly
 */

import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  UpdateItemCommand,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { SignJWT, jwtVerify } from 'jose';
import { invalidateCache } from '@/lib/cache';

const region = process.env.AWS_REGION || 'us-east-1';
const ACCESS_TOKEN_TTL_SECONDS = 60 * 60;
const REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30;
const CODE_TTL_SECONDS = 5 * 60;

export type McpOAuthClientRecord = {
  id: string;
  name: string;
  client_id: string;
  /** Empty for public PKCE clients (Claude DCR) */
  client_secret_hash: string;
  client_secret_prefix: string;
  redirect_uris: string[];
  created_at: string;
  created_by: string;
  last_used_at?: string;
  revoked_at?: string | null;
  /**
   * public = PKCE only, no secret (Claude dynamic registration)
   * confidential = client_id + secret
   */
  token_endpoint_auth_method?: "none" | "client_secret_post" | "client_secret_basic";
  /** When true, authorize binds to the logged-in admin's tenant (not a fixed org). */
  unbound?: boolean;
};

/** Known Claude / Anthropic MCP OAuth callbacks */
export const CLAUDE_MCP_REDIRECT_URIS = [
  "https://claude.ai/api/mcp/auth_callback",
  "https://claude.com/api/mcp/auth_callback",
] as const;

/** Dynamo item id for globally registered (DCR) OAuth clients */
const DCR_CLIENTS_TENANT_ID = "tenant-mcp-oauth-dcr";

export type McpOAuthClientPublic = Omit<McpOAuthClientRecord, 'client_secret_hash'>;

type OAuthJwtPayload = {
  kind: 'authorization_code' | 'access_token' | 'refresh_token';
  tenantId: string;
  clientId: string;
  userId: string;
  redirectUri?: string;
  codeChallenge?: string;
  scope: string;
  resource: string;
};

function dynamo() {
  return new DynamoDBClient({
    region,
    credentials:
      process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
        ? {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
          }
        : undefined,
  });
}

function tenantsTable() {
  return process.env.DYNAMODB_TENANTS_TABLE || 'turnkey-tenants';
}

export function oauthAppUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '') ||
    'https://turnkey-optimization.vercel.app'
  ).replace(/\/$/, '');
}

export function oauthMcpResource(): string {
  return `${oauthAppUrl()}/api/mcp`;
}

function hashSecret(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function safeHashEqual(value: string, expectedHash: string): boolean {
  const actual = Buffer.from(hashSecret(value), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function signingKey(): Uint8Array {
  const secret =
    process.env.MCP_OAUTH_SIGNING_SECRET ||
    process.env.SESSION_SECRET ||
    process.env.AI_CREDENTIALS_SECRET ||
    '';
  if (process.env.NODE_ENV === 'production' && secret.length < 16) {
    throw new Error('MCP_OAUTH_SIGNING_SECRET or SESSION_SECRET must be at least 16 characters');
  }
  return createHash('sha256')
    .update(secret || 'turnkey-local-oauth-secret-change-me')
    .digest();
}

async function loadTenantRaw(tenantId: string): Promise<Record<string, any> | null> {
  const response = await dynamo().send(
    new GetItemCommand({
      TableName: tenantsTable(),
      Key: { id: { S: tenantId } },
    })
  );
  return response.Item ? (unmarshall(response.Item) as Record<string, any>) : null;
}

async function saveTenantField(tenantId: string, field: string, value: unknown): Promise<void> {
  await dynamo().send(
    new UpdateItemCommand({
      TableName: tenantsTable(),
      Key: { id: { S: tenantId } },
      UpdateExpression: 'SET #field = :value, updated_at = :updated',
      ExpressionAttributeNames: { '#field': field },
      ExpressionAttributeValues: marshall(
        { ':value': value, ':updated': new Date().toISOString() },
        { removeUndefinedValues: true }
      ),
    })
  );
  await invalidateCache(`tenant:${tenantId}`);
}

function toPublic(client: McpOAuthClientRecord): McpOAuthClientPublic {
  const { client_secret_hash: _hash, ...publicClient } = client;
  return publicClient;
}

function validRedirectUri(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

export async function listMcpOAuthClients(tenantId: string): Promise<McpOAuthClientPublic[]> {
  const tenant = await loadTenantRaw(tenantId);
  return ((tenant?.mcp_oauth_clients || []) as McpOAuthClientRecord[])
    .filter((client) => !client.revoked_at)
    .map(toPublic)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function createMcpOAuthClient(input: {
  tenantId: string;
  name: string;
  createdBy: string;
  redirectUris?: string[];
  /** public PKCE client (Claude DCR) — no secret */
  publicClient?: boolean;
  unbound?: boolean;
}): Promise<{ client: McpOAuthClientPublic; clientSecret: string | null }> {
  const tenant = await loadTenantRaw(input.tenantId);
  if (!tenant && input.tenantId !== DCR_CLIENTS_TENANT_ID) {
    throw new Error('Tenant not found');
  }

  // Ensure DCR bucket exists as a pseudo-tenant row when needed
  if (!tenant && input.tenantId === DCR_CLIENTS_TENANT_ID) {
    await ensureDcrBucket();
  }

  const existing = ((await loadTenantRaw(input.tenantId))?.mcp_oauth_clients ||
    []) as McpOAuthClientRecord[];
  if (existing.filter((client) => !client.revoked_at).length >= 50) {
    throw new Error('Maximum of 50 active MCP OAuth clients in this registry');
  }

  const requestedRedirects = (input.redirectUris || [])
    .map((uri) => String(uri).trim())
    .filter(Boolean);
  const redirectUris = Array.from(
    new Set(
      (requestedRedirects.length
        ? requestedRedirects
        : [...CLAUDE_MCP_REDIRECT_URIS]).filter(validRedirectUri)
    )
  ).slice(0, 10);
  if (!redirectUris.length) throw new Error('At least one valid HTTPS redirect URI is required');

  const publicClient = !!input.publicClient;
  const clientId = `trio_oauth_client_${randomBytes(16).toString('hex')}`;
  const clientSecret = publicClient
    ? null
    : `trio_oauth_secret_${randomBytes(32).toString('hex')}`;
  const record: McpOAuthClientRecord = {
    id: `mcpoauth_${randomBytes(8).toString('hex')}`,
    name: (input.name || 'Claude OAuth').trim().slice(0, 80),
    client_id: clientId,
    client_secret_hash: clientSecret ? hashSecret(clientSecret) : '',
    client_secret_prefix: clientSecret ? `${clientSecret.slice(0, 20)}...` : 'public',
    redirect_uris: redirectUris,
    created_at: new Date().toISOString(),
    created_by: input.createdBy,
    revoked_at: null,
    token_endpoint_auth_method: publicClient ? 'none' : 'client_secret_post',
    unbound: !!input.unbound || publicClient,
  };
  await saveTenantField(input.tenantId, 'mcp_oauth_clients', [...existing, record]);
  return { client: toPublic(record), clientSecret };
}

async function ensureDcrBucket(): Promise<void> {
  const existing = await loadTenantRaw(DCR_CLIENTS_TENANT_ID);
  if (existing) return;
  try {
    await dynamo().send(
      new PutItemCommand({
        TableName: tenantsTable(),
        Item: marshall(
          {
            id: DCR_CLIENTS_TENANT_ID,
            name: 'MCP OAuth DCR Registry',
            mcp_oauth_clients: [],
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          { removeUndefinedValues: true }
        ),
        ConditionExpression: 'attribute_not_exists(id)',
      })
    );
  } catch {
    /* race ok */
  }
}

/**
 * RFC 7591 Dynamic Client Registration for Claude custom connectors.
 * Creates a public PKCE client that can be authorized for any org the admin belongs to.
 */
export async function registerDynamicMcpOAuthClient(input: {
  redirectUris: string[];
  clientName?: string;
  tokenEndpointAuthMethod?: string;
}): Promise<{
  client_id: string;
  client_secret?: string;
  redirect_uris: string[];
  token_endpoint_auth_method: string;
  grant_types: string[];
  response_types: string[];
  client_id_issued_at: number;
}> {
  const redirectUris = (input.redirectUris || [])
    .map((u) => String(u).trim())
    .filter(validRedirectUri);
  if (!redirectUris.length) {
    throw new Error('invalid_redirect_uri');
  }

  // Always allow Claude callbacks even if not listed (Claude sometimes sends variants)
  const merged = Array.from(
    new Set([...redirectUris, ...CLAUDE_MCP_REDIRECT_URIS].filter(validRedirectUri))
  );

  const authMethod =
    input.tokenEndpointAuthMethod === 'client_secret_post' ||
    input.tokenEndpointAuthMethod === 'client_secret_basic'
      ? input.tokenEndpointAuthMethod
      : 'none';

  const result = await createMcpOAuthClient({
    tenantId: DCR_CLIENTS_TENANT_ID,
    name: (input.clientName || 'Claude Custom Connector').slice(0, 80),
    createdBy: 'dcr',
    redirectUris: merged,
    publicClient: authMethod === 'none',
    unbound: true,
  });

  return {
    client_id: result.client.client_id,
    ...(result.clientSecret ? { client_secret: result.clientSecret } : {}),
    redirect_uris: result.client.redirect_uris,
    token_endpoint_auth_method: authMethod,
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    client_id_issued_at: Math.floor(Date.now() / 1000),
  };
}

export function isPublicOAuthClient(client: McpOAuthClientRecord): boolean {
  return (
    client.token_endpoint_auth_method === 'none' ||
    !client.client_secret_hash ||
    !!client.unbound
  );
}

export function redirectUriAllowed(
  client: McpOAuthClientRecord,
  redirectUri: string
): boolean {
  if (!redirectUri) return false;
  if (client.redirect_uris.includes(redirectUri)) return true;
  // Claude callbacks always accepted for public/unbound clients
  if (
    isPublicOAuthClient(client) &&
    (CLAUDE_MCP_REDIRECT_URIS as readonly string[]).includes(redirectUri)
  ) {
    return true;
  }
  return false;
}

export function scopeAllowsMcp(scope: string): boolean {
  const s = (scope || 'mcp').trim();
  if (!s || s === 'mcp') return true;
  return s.split(/[\s+]+/).includes('mcp');
}

export function resourceMatchesMcp(resource: string): boolean {
  const expected = oauthMcpResource();
  const r = (resource || expected).replace(/\/$/, '');
  return r === expected || r === expected.replace(/\/api\/mcp$/, '') + '/api/mcp';
}

export async function revokeMcpOAuthClient(tenantId: string, id: string): Promise<boolean> {
  const tenant = await loadTenantRaw(tenantId);
  if (!tenant) return false;
  let found = false;
  const clients = ((tenant.mcp_oauth_clients || []) as McpOAuthClientRecord[]).map((client) => {
    if (client.id === id && !client.revoked_at) {
      found = true;
      return { ...client, revoked_at: new Date().toISOString() };
    }
    return client;
  });
  if (!found) return false;
  await saveTenantField(tenantId, 'mcp_oauth_clients', clients);
  return true;
}

export async function findMcpOAuthClient(clientId: string): Promise<{
  tenantId: string;
  client: McpOAuthClientRecord;
} | null> {
  const { getAllTenants } = await import('@/lib/db/repositories/tenant-repository');
  const tenants = await getAllTenants({ includePlatform: true });
  for (const tenant of tenants || []) {
    const tenantId = String((tenant as any).id || '');
    const clients = (((tenant as any).mcp_oauth_clients || []) as McpOAuthClientRecord[]);
    const client = clients.find((item) => item.client_id === clientId && !item.revoked_at);
    if (tenantId && client) return { tenantId, client };
  }
  return null;
}

export async function validateMcpOAuthClientSecret(
  clientId: string,
  clientSecret: string
): Promise<{ tenantId: string; client: McpOAuthClientRecord } | null> {
  const found = await findMcpOAuthClient(clientId);
  if (!found) return null;
  // Public clients: no secret
  if (isPublicOAuthClient(found.client) && !found.client.client_secret_hash) {
    return found;
  }
  if (!clientSecret || !found.client.client_secret_hash) return null;
  if (!safeHashEqual(clientSecret, found.client.client_secret_hash)) return null;
  return found;
}

/**
 * Resolve which tenant an authorization should bind to.
 * - Tenant-bound client: that org (site admins may approve without switching)
 * - Unbound/public DCR client: the admin's currently selected customer tenant
 */
export function resolveAuthorizeTenantId(input: {
  clientTenantId: string;
  sessionTenantId: string;
  isSiteAdmin: boolean;
  unbound: boolean;
}): { tenantId: string } | { error: string } {
  const session = (input.sessionTenantId || '').trim();
  const clientTenant = (input.clientTenantId || '').trim();

  if (input.unbound || clientTenant === DCR_CLIENTS_TENANT_ID) {
    if (!session || session === 'tenant-platform') {
      return {
        error:
          'Select a customer organization in Trio (not All Tenants / Platform), then try Connect again.',
      };
    }
    return { tenantId: session };
  }

  if (session === clientTenant) {
    return { tenantId: clientTenant };
  }

  // Site admin can approve a client created for another org without switching
  if (input.isSiteAdmin && clientTenant) {
    return { tenantId: clientTenant };
  }

  return {
    error: `Organization mismatch. This OAuth client belongs to a different tenant. Switch to that company in Trio, or recreate the OAuth client under the company you are using.`,
  };
}

async function signOAuthJwt(payload: OAuthJwtPayload, audience: string, ttl: number): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuer(oauthAppUrl())
    .setAudience(audience)
    .setJti(randomBytes(16).toString('hex'))
    .setIssuedAt()
    .setExpirationTime(`${ttl}s`)
    .sign(signingKey());
}

async function verifyOAuthJwt(token: string, audience: string): Promise<OAuthJwtPayload & { jti: string }> {
  const result = await jwtVerify(token, signingKey(), {
    issuer: oauthAppUrl(),
    audience,
    algorithms: ['HS256'],
  });
  return result.payload as unknown as OAuthJwtPayload & { jti: string };
}

export async function createAuthorizationCode(input: {
  tenantId: string;
  clientId: string;
  userId: string;
  redirectUri: string;
  codeChallenge: string;
  scope: string;
  resource: string;
}): Promise<string> {
  return signOAuthJwt(
    {
      kind: 'authorization_code',
      tenantId: input.tenantId,
      clientId: input.clientId,
      userId: input.userId,
      redirectUri: input.redirectUri,
      codeChallenge: input.codeChallenge,
      scope: input.scope,
      resource: input.resource,
    },
    `${oauthAppUrl()}/api/oauth/token`,
    CODE_TTL_SECONDS
  );
}

async function consumeTokenId(
  tenantId: string,
  field: string,
  jti: string,
  retentionMs: number
): Promise<boolean> {
  const tenant = await loadTenantRaw(tenantId);
  if (!tenant) return false;
  const now = Date.now();
  const used = (tenant[field] || []) as Array<{ jti: string; used_at: string }>;
  const recent = used.filter((item) => now - new Date(item.used_at).getTime() < retentionMs);
  if (recent.some((item) => item.jti === jti)) return false;
  // Fail closed rather than dropping a still-live replay marker.
  if (recent.length >= 500) return false;
  await saveTenantField(tenantId, field, [
    ...recent,
    { jti, used_at: new Date().toISOString() },
  ]);
  return true;
}

function pkceMatches(verifier: string, challenge: string): boolean {
  if (!verifier || !challenge) return false;
  const actual = createHash('sha256').update(verifier).digest('base64url');
  const a = Buffer.from(actual);
  const b = Buffer.from(challenge);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function issueTokenPair(payload: OAuthJwtPayload) {
  const accessToken = await signOAuthJwt(
    { ...payload, kind: 'access_token' },
    oauthMcpResource(),
    ACCESS_TOKEN_TTL_SECONDS
  );
  const refreshToken = await signOAuthJwt(
    { ...payload, kind: 'refresh_token' },
    `${oauthAppUrl()}/api/oauth/token`,
    REFRESH_TOKEN_TTL_SECONDS
  );
  return {
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: ACCESS_TOKEN_TTL_SECONDS,
    refresh_token: refreshToken,
    scope: payload.scope,
  };
}

export async function exchangeAuthorizationCode(input: {
  code: string;
  clientId: string;
  redirectUri: string;
  codeVerifier: string;
  resource: string;
}) {
  const payload = await verifyOAuthJwt(input.code, `${oauthAppUrl()}/api/oauth/token`);
  if (
    payload.kind !== 'authorization_code' ||
    payload.clientId !== input.clientId ||
    payload.redirectUri !== input.redirectUri ||
    !resourceMatchesMcp(payload.resource || '') ||
    !resourceMatchesMcp(input.resource || '') ||
    !pkceMatches(input.codeVerifier, payload.codeChallenge || '')
  ) {
    throw new Error('invalid_grant');
  }
  if (!(await consumeTokenId(
    payload.tenantId,
    'mcp_oauth_used_codes',
    payload.jti,
    15 * 60 * 1000
  ))) {
    throw new Error('invalid_grant');
  }
  return issueTokenPair(payload);
}

export async function refreshMcpOAuthToken(input: {
  refreshToken: string;
  clientId: string;
  resource: string;
}) {
  const payload = await verifyOAuthJwt(input.refreshToken, `${oauthAppUrl()}/api/oauth/token`);
  if (
    payload.kind !== 'refresh_token' ||
    payload.clientId !== input.clientId ||
    !resourceMatchesMcp(payload.resource || '') ||
    !resourceMatchesMcp(input.resource || '')
  ) {
    throw new Error('invalid_grant');
  }
  if (!(await consumeTokenId(
    payload.tenantId,
    'mcp_oauth_used_refresh_tokens',
    payload.jti,
    (REFRESH_TOKEN_TTL_SECONDS + 86400) * 1000
  ))) {
    throw new Error('invalid_grant');
  }
  return issueTokenPair(payload);
}

export async function validateMcpOAuthAccessToken(token: string): Promise<{
  tenantId: string;
  keyId: string;
  keyName: string;
  userId?: string;
} | null> {
  try {
    const payload = await verifyOAuthJwt(token, oauthMcpResource());
    if (payload.kind !== 'access_token') return null;
    const found = await findMcpOAuthClient(payload.clientId);
    if (!found || found.tenantId !== payload.tenantId) return null;
    return {
      tenantId: payload.tenantId,
      keyId: found.client.id,
      keyName: found.client.name,
      userId: payload.userId || undefined,
    };
  } catch {
    return null;
  }
}
