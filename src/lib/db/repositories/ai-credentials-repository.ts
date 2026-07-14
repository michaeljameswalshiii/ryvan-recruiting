/**
 * Store BYOK AI credentials (encrypted) per user.
 * Supports Anthropic + Grok (xAI). Platform Bedrock needs no key.
 */
import { getItem, putItem, deleteItem, tableNames } from '../dynamodb';
import { encryptSecret, decryptSecret, maskSecret } from '../../crypto/secrets';

export type AiProviderPreference = 'bedrock' | 'anthropic' | 'grok';

export interface AiCredentialsRecord {
  id: string; // ai-cred#${userId}
  userId: string;
  tenant_id?: string;
  type: 'ai_credentials';
  preferredProvider: AiProviderPreference;
  anthropicEncryptedKey?: string;
  anthropicKeyHint?: string;
  grokEncryptedKey?: string;
  grokKeyHint?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AiCredentialsPublic {
  preferredProvider: AiProviderPreference;
  hasAnthropicKey: boolean;
  anthropicKeyHint?: string;
  hasGrokKey: boolean;
  grokKeyHint?: string;
  updatedAt?: string;
}

function recordId(userId: string) {
  return `ai-cred#${userId}`;
}

function emptyPublic(
  preferred: AiProviderPreference = 'bedrock'
): AiCredentialsPublic {
  return {
    preferredProvider: preferred,
    hasAnthropicKey: false,
    hasGrokKey: false,
  };
}

function toPublic(rec: AiCredentialsRecord | null): AiCredentialsPublic {
  if (!rec) return emptyPublic();
  let preferred = rec.preferredProvider || 'bedrock';
  // Fall back if preferred key was removed
  if (preferred === 'anthropic' && !rec.anthropicEncryptedKey) preferred = 'bedrock';
  if (preferred === 'grok' && !rec.grokEncryptedKey) preferred = 'bedrock';
  return {
    preferredProvider: preferred,
    hasAnthropicKey: !!rec.anthropicEncryptedKey,
    anthropicKeyHint: rec.anthropicKeyHint,
    hasGrokKey: !!rec.grokEncryptedKey,
    grokKeyHint: rec.grokKeyHint,
    updatedAt: rec.updatedAt,
  };
}

function mergeRecord(
  existing: AiCredentialsRecord | null,
  userId: string,
  tenantId: string | null | undefined,
  patch: Partial<AiCredentialsRecord>
): AiCredentialsRecord {
  const now = new Date().toISOString();
  return {
    id: recordId(userId),
    userId,
    tenant_id: tenantId || existing?.tenant_id,
    type: 'ai_credentials',
    preferredProvider: patch.preferredProvider ?? existing?.preferredProvider ?? 'bedrock',
    anthropicEncryptedKey:
      patch.anthropicEncryptedKey !== undefined
        ? patch.anthropicEncryptedKey
        : existing?.anthropicEncryptedKey,
    anthropicKeyHint:
      patch.anthropicKeyHint !== undefined
        ? patch.anthropicKeyHint
        : existing?.anthropicKeyHint,
    grokEncryptedKey:
      patch.grokEncryptedKey !== undefined
        ? patch.grokEncryptedKey
        : existing?.grokEncryptedKey,
    grokKeyHint:
      patch.grokKeyHint !== undefined ? patch.grokKeyHint : existing?.grokKeyHint,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
}

/** Persist without undefined key fields (Dynamo put) */
async function putClean(record: AiCredentialsRecord): Promise<void> {
  const item: Record<string, unknown> = {
    id: record.id,
    userId: record.userId,
    type: 'ai_credentials',
    preferredProvider: record.preferredProvider,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
  if (record.tenant_id) item.tenant_id = record.tenant_id;
  if (record.anthropicEncryptedKey) {
    item.anthropicEncryptedKey = record.anthropicEncryptedKey;
    item.anthropicKeyHint = record.anthropicKeyHint;
  }
  if (record.grokEncryptedKey) {
    item.grokEncryptedKey = record.grokEncryptedKey;
    item.grokKeyHint = record.grokKeyHint;
  }
  await putItem(tableNames.profiles, item);
}

export async function getAiCredentialsRecord(
  userId: string
): Promise<AiCredentialsRecord | null> {
  if (!userId) return null;
  try {
    return await getItem<AiCredentialsRecord>(tableNames.profiles, {
      id: recordId(userId),
    });
  } catch (err) {
    console.error('[ai-credentials] get failed', err);
    return null;
  }
}

export async function getAiCredentialsPublic(
  userId: string
): Promise<AiCredentialsPublic> {
  return toPublic(await getAiCredentialsRecord(userId));
}

export async function getDecryptedAnthropicKey(
  userId: string
): Promise<string | null> {
  const rec = await getAiCredentialsRecord(userId);
  if (!rec?.anthropicEncryptedKey) return null;
  try {
    return decryptSecret(rec.anthropicEncryptedKey);
  } catch (err) {
    console.error('[ai-credentials] anthropic decrypt failed', err);
    return null;
  }
}

export async function getDecryptedGrokKey(
  userId: string
): Promise<string | null> {
  const rec = await getAiCredentialsRecord(userId);
  if (!rec?.grokEncryptedKey) return null;
  try {
    return decryptSecret(rec.grokEncryptedKey);
  } catch (err) {
    console.error('[ai-credentials] grok decrypt failed', err);
    return null;
  }
}

export async function saveAnthropicKey(params: {
  userId: string;
  tenantId?: string | null;
  apiKey: string;
  setAsPreferred?: boolean;
}): Promise<AiCredentialsPublic> {
  const { userId, tenantId, apiKey, setAsPreferred = true } = params;
  const trimmed = apiKey.trim();
  if (!trimmed || trimmed.length < 20) {
    throw new Error('API key looks invalid');
  }

  const existing = await getAiCredentialsRecord(userId);
  const record = mergeRecord(existing, userId, tenantId, {
    preferredProvider: setAsPreferred
      ? 'anthropic'
      : existing?.preferredProvider || 'bedrock',
    anthropicEncryptedKey: encryptSecret(trimmed),
    anthropicKeyHint: maskSecret(trimmed),
  });
  await putClean(record);
  return getAiCredentialsPublic(userId);
}

export async function saveGrokKey(params: {
  userId: string;
  tenantId?: string | null;
  apiKey: string;
  setAsPreferred?: boolean;
}): Promise<AiCredentialsPublic> {
  const { userId, tenantId, apiKey, setAsPreferred = true } = params;
  const trimmed = apiKey.trim();
  if (!trimmed || trimmed.length < 16) {
    throw new Error('API key looks invalid');
  }

  const existing = await getAiCredentialsRecord(userId);
  const record = mergeRecord(existing, userId, tenantId, {
    preferredProvider: setAsPreferred
      ? 'grok'
      : existing?.preferredProvider || 'bedrock',
    grokEncryptedKey: encryptSecret(trimmed),
    grokKeyHint: maskSecret(trimmed),
  });
  await putClean(record);
  return getAiCredentialsPublic(userId);
}

export async function setPreferredProvider(
  userId: string,
  preferredProvider: AiProviderPreference,
  tenantId?: string | null
): Promise<AiCredentialsPublic> {
  const existing = await getAiCredentialsRecord(userId);

  if (preferredProvider === 'anthropic' && !existing?.anthropicEncryptedKey) {
    throw new Error('Save an Anthropic API key before selecting it as preferred');
  }
  if (preferredProvider === 'grok' && !existing?.grokEncryptedKey) {
    throw new Error('Save a Grok (xAI) API key before selecting it as preferred');
  }

  const record = mergeRecord(existing, userId, tenantId, {
    preferredProvider,
  });
  await putClean(record);
  return getAiCredentialsPublic(userId);
}

export async function deleteAnthropicKey(
  userId: string
): Promise<AiCredentialsPublic> {
  const existing = await getAiCredentialsRecord(userId);
  if (!existing) return emptyPublic();

  const preferred: AiProviderPreference =
    existing.preferredProvider === 'anthropic'
      ? 'bedrock'
      : existing.preferredProvider || 'bedrock';

  await deleteItem(tableNames.profiles, { id: recordId(userId) });
  const record = mergeRecord(
    {
      ...existing,
      anthropicEncryptedKey: undefined,
      anthropicKeyHint: undefined,
    },
    userId,
    existing.tenant_id,
    {
      preferredProvider: preferred,
      anthropicEncryptedKey: undefined,
      anthropicKeyHint: undefined,
    }
  );
  // Force clear anthropic fields
  record.anthropicEncryptedKey = undefined;
  record.anthropicKeyHint = undefined;
  record.preferredProvider = preferred;
  await putClean(record);
  return getAiCredentialsPublic(userId);
}

export async function deleteGrokKey(
  userId: string
): Promise<AiCredentialsPublic> {
  const existing = await getAiCredentialsRecord(userId);
  if (!existing) return emptyPublic();

  const preferred: AiProviderPreference =
    existing.preferredProvider === 'grok'
      ? 'bedrock'
      : existing.preferredProvider || 'bedrock';

  await deleteItem(tableNames.profiles, { id: recordId(userId) });
  const record = mergeRecord(existing, userId, existing.tenant_id, {
    preferredProvider: preferred,
  });
  record.grokEncryptedKey = undefined;
  record.grokKeyHint = undefined;
  record.preferredProvider = preferred;
  // Keep anthropic if present
  await putClean(record);
  return getAiCredentialsPublic(userId);
}

/** Lightweight validation call to Anthropic */
export async function validateAnthropicKey(apiKey: string): Promise<{
  ok: boolean;
  error?: string;
  model?: string;
}> {
  try {
    const model =
      process.env.ANTHROPIC_BYOK_MODEL || 'claude-sonnet-4-20250514';
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey.trim(),
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 16,
        messages: [{ role: 'user', content: 'Reply with ok' }],
      }),
    });

    if (res.ok) {
      return { ok: true, model };
    }

    const text = await res.text();
    let message = `Anthropic API error (${res.status})`;
    try {
      const json = JSON.parse(text);
      message = json?.error?.message || message;
    } catch {
      if (text) message = text.slice(0, 200);
    }
    return { ok: false, error: message };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Validation failed',
    };
  }
}

/** Lightweight validation call to xAI / Grok */
export async function validateGrokKey(apiKey: string): Promise<{
  ok: boolean;
  error?: string;
  model?: string;
}> {
  try {
    const model = process.env.GROK_BYOK_MODEL || process.env.XAI_BYOK_MODEL || 'grok-3';
    const res = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Authorization: `Bearer ${apiKey.trim()}`,
      },
      body: JSON.stringify({
        model,
        max_tokens: 16,
        messages: [{ role: 'user', content: 'Reply with ok' }],
      }),
    });

    if (res.ok) {
      return { ok: true, model };
    }

    const text = await res.text();
    let message = `Grok/xAI API error (${res.status})`;
    try {
      const json = JSON.parse(text);
      message = json?.error?.message || json?.error || message;
    } catch {
      if (text) message = text.slice(0, 200);
    }
    // Some accounts use different model ids — 404 model often still means key is valid
    if (res.status === 404 && /model/i.test(message)) {
      return {
        ok: true,
        model,
        error: undefined,
      };
    }
    return { ok: false, error: message };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Validation failed',
    };
  }
}
