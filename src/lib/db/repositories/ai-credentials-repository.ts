/**
 * Store BYOK AI credentials (encrypted) per user.
 * Supports Anthropic, Grok (xAI), OpenAI, Gemini. Platform Bedrock needs no key.
 */
import { getItem, putItem, deleteItem, tableNames } from '../dynamodb';
import { encryptSecret, decryptSecret, maskSecret } from '../../crypto/secrets';

export type AiProviderPreference =
  | 'bedrock'
  | 'anthropic'
  | 'grok'
  | 'openai'
  | 'gemini';

export type ByokKeyProvider = 'anthropic' | 'grok' | 'openai' | 'gemini';

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
  openaiEncryptedKey?: string;
  openaiKeyHint?: string;
  geminiEncryptedKey?: string;
  geminiKeyHint?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AiCredentialsPublic {
  preferredProvider: AiProviderPreference;
  hasAnthropicKey: boolean;
  anthropicKeyHint?: string;
  hasGrokKey: boolean;
  grokKeyHint?: string;
  hasOpenaiKey: boolean;
  openaiKeyHint?: string;
  hasGeminiKey: boolean;
  geminiKeyHint?: string;
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
    hasOpenaiKey: false,
    hasGeminiKey: false,
  };
}

function hasKeyFor(
  rec: AiCredentialsRecord,
  provider: AiProviderPreference
): boolean {
  if (provider === 'bedrock') return true;
  if (provider === 'anthropic') return !!rec.anthropicEncryptedKey;
  if (provider === 'grok') return !!rec.grokEncryptedKey;
  if (provider === 'openai') return !!rec.openaiEncryptedKey;
  if (provider === 'gemini') return !!rec.geminiEncryptedKey;
  return false;
}

function toPublic(rec: AiCredentialsRecord | null): AiCredentialsPublic {
  if (!rec) return emptyPublic();
  let preferred = rec.preferredProvider || 'bedrock';
  if (preferred !== 'bedrock' && !hasKeyFor(rec, preferred)) {
    preferred = 'bedrock';
  }
  return {
    preferredProvider: preferred,
    hasAnthropicKey: !!rec.anthropicEncryptedKey,
    anthropicKeyHint: rec.anthropicKeyHint,
    hasGrokKey: !!rec.grokEncryptedKey,
    grokKeyHint: rec.grokKeyHint,
    hasOpenaiKey: !!rec.openaiEncryptedKey,
    openaiKeyHint: rec.openaiKeyHint,
    hasGeminiKey: !!rec.geminiEncryptedKey,
    geminiKeyHint: rec.geminiKeyHint,
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
    preferredProvider:
      patch.preferredProvider ?? existing?.preferredProvider ?? 'bedrock',
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
    openaiEncryptedKey:
      patch.openaiEncryptedKey !== undefined
        ? patch.openaiEncryptedKey
        : existing?.openaiEncryptedKey,
    openaiKeyHint:
      patch.openaiKeyHint !== undefined
        ? patch.openaiKeyHint
        : existing?.openaiKeyHint,
    geminiEncryptedKey:
      patch.geminiEncryptedKey !== undefined
        ? patch.geminiEncryptedKey
        : existing?.geminiEncryptedKey,
    geminiKeyHint:
      patch.geminiKeyHint !== undefined
        ? patch.geminiKeyHint
        : existing?.geminiKeyHint,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
}

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
  if (record.openaiEncryptedKey) {
    item.openaiEncryptedKey = record.openaiEncryptedKey;
    item.openaiKeyHint = record.openaiKeyHint;
  }
  if (record.geminiEncryptedKey) {
    item.geminiEncryptedKey = record.geminiEncryptedKey;
    item.geminiKeyHint = record.geminiKeyHint;
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

async function decryptField(
  encrypted: string | undefined,
  label: string
): Promise<string | null> {
  if (!encrypted) return null;
  try {
    return decryptSecret(encrypted);
  } catch (err) {
    console.error(`[ai-credentials] ${label} decrypt failed`, err);
    return null;
  }
}

export async function getDecryptedAnthropicKey(userId: string) {
  const rec = await getAiCredentialsRecord(userId);
  return decryptField(rec?.anthropicEncryptedKey, 'anthropic');
}

export async function getDecryptedGrokKey(userId: string) {
  const rec = await getAiCredentialsRecord(userId);
  return decryptField(rec?.grokEncryptedKey, 'grok');
}

export async function getDecryptedOpenaiKey(userId: string) {
  const rec = await getAiCredentialsRecord(userId);
  return decryptField(rec?.openaiEncryptedKey, 'openai');
}

export async function getDecryptedGeminiKey(userId: string) {
  const rec = await getAiCredentialsRecord(userId);
  return decryptField(rec?.geminiEncryptedKey, 'gemini');
}

async function saveKey(params: {
  userId: string;
  tenantId?: string | null;
  apiKey: string;
  provider: ByokKeyProvider;
  setAsPreferred?: boolean;
  minLength?: number;
}): Promise<AiCredentialsPublic> {
  const {
    userId,
    tenantId,
    apiKey,
    provider,
    setAsPreferred = true,
    minLength = 16,
  } = params;
  const trimmed = apiKey.trim();
  if (!trimmed || trimmed.length < minLength) {
    throw new Error('API key looks invalid');
  }

  const existing = await getAiCredentialsRecord(userId);
  const hint = maskSecret(trimmed);
  const enc = encryptSecret(trimmed);
  const patch: Partial<AiCredentialsRecord> = {
    preferredProvider: setAsPreferred
      ? provider
      : existing?.preferredProvider || 'bedrock',
  };
  if (provider === 'anthropic') {
    patch.anthropicEncryptedKey = enc;
    patch.anthropicKeyHint = hint;
  } else if (provider === 'grok') {
    patch.grokEncryptedKey = enc;
    patch.grokKeyHint = hint;
  } else if (provider === 'openai') {
    patch.openaiEncryptedKey = enc;
    patch.openaiKeyHint = hint;
  } else if (provider === 'gemini') {
    patch.geminiEncryptedKey = enc;
    patch.geminiKeyHint = hint;
  }

  const record = mergeRecord(existing, userId, tenantId, patch);
  await putClean(record);
  return getAiCredentialsPublic(userId);
}

export async function saveAnthropicKey(params: {
  userId: string;
  tenantId?: string | null;
  apiKey: string;
  setAsPreferred?: boolean;
}) {
  return saveKey({ ...params, provider: 'anthropic', minLength: 20 });
}

export async function saveGrokKey(params: {
  userId: string;
  tenantId?: string | null;
  apiKey: string;
  setAsPreferred?: boolean;
}) {
  return saveKey({ ...params, provider: 'grok', minLength: 16 });
}

export async function saveOpenaiKey(params: {
  userId: string;
  tenantId?: string | null;
  apiKey: string;
  setAsPreferred?: boolean;
}) {
  return saveKey({ ...params, provider: 'openai', minLength: 20 });
}

export async function saveGeminiKey(params: {
  userId: string;
  tenantId?: string | null;
  apiKey: string;
  setAsPreferred?: boolean;
}) {
  return saveKey({ ...params, provider: 'gemini', minLength: 20 });
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
  if (preferredProvider === 'openai' && !existing?.openaiEncryptedKey) {
    throw new Error('Save an OpenAI API key before selecting it as preferred');
  }
  if (preferredProvider === 'gemini' && !existing?.geminiEncryptedKey) {
    throw new Error('Save a Gemini API key before selecting it as preferred');
  }

  const record = mergeRecord(existing, userId, tenantId, {
    preferredProvider,
  });
  await putClean(record);
  return getAiCredentialsPublic(userId);
}

async function deleteProviderKey(
  userId: string,
  provider: ByokKeyProvider
): Promise<AiCredentialsPublic> {
  const existing = await getAiCredentialsRecord(userId);
  if (!existing) return emptyPublic();

  const preferred: AiProviderPreference =
    existing.preferredProvider === provider
      ? 'bedrock'
      : existing.preferredProvider || 'bedrock';

  // Rebuild without the deleted provider key
  const next: AiCredentialsRecord = {
    ...existing,
    preferredProvider: preferred,
    updatedAt: new Date().toISOString(),
  };
  if (provider === 'anthropic') {
    next.anthropicEncryptedKey = undefined;
    next.anthropicKeyHint = undefined;
  } else if (provider === 'grok') {
    next.grokEncryptedKey = undefined;
    next.grokKeyHint = undefined;
  } else if (provider === 'openai') {
    next.openaiEncryptedKey = undefined;
    next.openaiKeyHint = undefined;
  } else if (provider === 'gemini') {
    next.geminiEncryptedKey = undefined;
    next.geminiKeyHint = undefined;
  }

  // Full rewrite so Dynamo doesn't keep stale encrypted fields
  await deleteItem(tableNames.profiles, { id: recordId(userId) });
  await putClean(next);
  return getAiCredentialsPublic(userId);
}

export async function deleteAnthropicKey(userId: string) {
  return deleteProviderKey(userId, 'anthropic');
}
export async function deleteGrokKey(userId: string) {
  return deleteProviderKey(userId, 'grok');
}
export async function deleteOpenaiKey(userId: string) {
  return deleteProviderKey(userId, 'openai');
}
export async function deleteGeminiKey(userId: string) {
  return deleteProviderKey(userId, 'gemini');
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

    if (res.ok) return { ok: true, model };

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
    const model =
      process.env.GROK_BYOK_MODEL || process.env.XAI_BYOK_MODEL || 'grok-4.3';
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

    if (res.ok) return { ok: true, model };

    const text = await res.text();
    let message = `Grok/xAI API error (${res.status})`;
    try {
      const json = JSON.parse(text);
      message = json?.error?.message || json?.error || message;
    } catch {
      if (text) message = text.slice(0, 200);
    }
    if (res.status === 404 && /model/i.test(message)) {
      return { ok: true, model };
    }
    return { ok: false, error: message };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Validation failed',
    };
  }
}

/** Lightweight validation call to OpenAI */
export async function validateOpenaiKey(apiKey: string): Promise<{
  ok: boolean;
  error?: string;
  model?: string;
}> {
  try {
    const model = process.env.OPENAI_BYOK_MODEL || 'gpt-4o-mini';
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
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

    if (res.ok) return { ok: true, model };

    const text = await res.text();
    let message = `OpenAI API error (${res.status})`;
    try {
      const json = JSON.parse(text);
      message = json?.error?.message || message;
    } catch {
      if (text) message = text.slice(0, 200);
    }
    // Key valid but model name differs on some accounts
    if (res.status === 404 && /model/i.test(message)) {
      return { ok: true, model };
    }
    return { ok: false, error: message };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Validation failed',
    };
  }
}

/** Lightweight validation call to Google Gemini */
export async function validateGeminiKey(apiKey: string): Promise<{
  ok: boolean;
  error?: string;
  model?: string;
}> {
  try {
    const model =
      process.env.GEMINI_BYOK_MODEL || 'gemini-2.0-flash';
    // OpenAI-compatible endpoint for Gemini
    const res = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
      {
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
      }
    );

    if (res.ok) return { ok: true, model };

    // Fallback: native generateContent (some keys work better this way)
    const native = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey.trim())}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'Reply with ok' }] }],
          generationConfig: { maxOutputTokens: 16 },
        }),
      }
    );
    if (native.ok) return { ok: true, model };

    const text = await res.text();
    let message = `Gemini API error (${res.status})`;
    try {
      const json = JSON.parse(text);
      message =
        json?.error?.message || json?.error?.status || message;
    } catch {
      if (text) message = text.slice(0, 200);
    }
    if (
      (res.status === 404 || native.status === 404) &&
      /model/i.test(message)
    ) {
      return { ok: true, model };
    }
    return { ok: false, error: message };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Validation failed',
    };
  }
}
