/**
 * Store BYOK AI credentials (encrypted) per user.
 * Uses profiles table with a dedicated item id so no new Dynamo table is required.
 */
import { getItem, putItem, deleteItem, tableNames } from '../dynamodb';
import { encryptSecret, decryptSecret, maskSecret } from '../../crypto/secrets';

export type AiProviderPreference = 'bedrock' | 'anthropic';

export interface AiCredentialsRecord {
  id: string; // ai-cred#${userId}
  userId: string;
  tenant_id?: string;
  type: 'ai_credentials';
  preferredProvider: AiProviderPreference;
  anthropicEncryptedKey?: string;
  anthropicKeyHint?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AiCredentialsPublic {
  preferredProvider: AiProviderPreference;
  hasAnthropicKey: boolean;
  anthropicKeyHint?: string;
  updatedAt?: string;
}

function recordId(userId: string) {
  return `ai-cred#${userId}`;
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
  const rec = await getAiCredentialsRecord(userId);
  if (!rec) {
    return {
      preferredProvider: 'bedrock',
      hasAnthropicKey: false,
    };
  }
  return {
    preferredProvider: rec.preferredProvider || 'bedrock',
    hasAnthropicKey: !!rec.anthropicEncryptedKey,
    anthropicKeyHint: rec.anthropicKeyHint,
    updatedAt: rec.updatedAt,
  };
}

export async function getDecryptedAnthropicKey(
  userId: string
): Promise<string | null> {
  const rec = await getAiCredentialsRecord(userId);
  if (!rec?.anthropicEncryptedKey) return null;
  try {
    return decryptSecret(rec.anthropicEncryptedKey);
  } catch (err) {
    console.error('[ai-credentials] decrypt failed', err);
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
  const now = new Date().toISOString();
  const record: AiCredentialsRecord = {
    id: recordId(userId),
    userId,
    tenant_id: tenantId || existing?.tenant_id,
    type: 'ai_credentials',
    preferredProvider: setAsPreferred
      ? 'anthropic'
      : existing?.preferredProvider || 'bedrock',
    anthropicEncryptedKey: encryptSecret(trimmed),
    anthropicKeyHint: maskSecret(trimmed),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };

  await putItem(tableNames.profiles, record);
  return getAiCredentialsPublic(userId);
}

export async function setPreferredProvider(
  userId: string,
  preferredProvider: AiProviderPreference,
  tenantId?: string | null
): Promise<AiCredentialsPublic> {
  const existing = await getAiCredentialsRecord(userId);
  const now = new Date().toISOString();

  if (preferredProvider === 'anthropic' && !existing?.anthropicEncryptedKey) {
    throw new Error('Save an Anthropic API key before selecting it as preferred');
  }

  const record: AiCredentialsRecord = {
    id: recordId(userId),
    userId,
    tenant_id: tenantId || existing?.tenant_id,
    type: 'ai_credentials',
    preferredProvider,
    anthropicEncryptedKey: existing?.anthropicEncryptedKey,
    anthropicKeyHint: existing?.anthropicKeyHint,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };

  await putItem(tableNames.profiles, record);
  return getAiCredentialsPublic(userId);
}

export async function deleteAnthropicKey(
  userId: string
): Promise<AiCredentialsPublic> {
  const existing = await getAiCredentialsRecord(userId);
  if (!existing) {
    return { preferredProvider: 'bedrock', hasAnthropicKey: false };
  }

  // Clear key; keep preference as bedrock
  const now = new Date().toISOString();
  const record: AiCredentialsRecord = {
    ...existing,
    preferredProvider: 'bedrock',
    anthropicEncryptedKey: undefined,
    anthropicKeyHint: undefined,
    updatedAt: now,
  };

  // putItem with undefined may still store — delete and re-put without key fields
  await deleteItem(tableNames.profiles, { id: recordId(userId) });
  await putItem(tableNames.profiles, {
    id: recordId(userId),
    userId,
    tenant_id: existing.tenant_id,
    type: 'ai_credentials',
    preferredProvider: 'bedrock',
    createdAt: existing.createdAt,
    updatedAt: now,
  });

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
