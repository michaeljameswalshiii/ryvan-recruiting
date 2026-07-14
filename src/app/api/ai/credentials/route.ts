/**
 * AI BYOK credentials API
 * GET    — status (never returns raw keys)
 * POST   — save Anthropic/Grok key or set preferred provider
 * DELETE — remove a key (?provider=anthropic|grok)
 */
import { NextRequest, NextResponse } from 'next/server';
import {
  getSession,
  getSessionTenantId,
  getSessionUserId,
} from '@/lib/server-auth';
import {
  getAiCredentialsPublic,
  saveAnthropicKey,
  saveGrokKey,
  setPreferredProvider,
  deleteAnthropicKey,
  deleteGrokKey,
  validateAnthropicKey,
  validateGrokKey,
  type AiProviderPreference,
} from '@/lib/db/repositories/ai-credentials-repository';

async function resolveUserId(request: NextRequest): Promise<string | null> {
  const fromHeader = request.headers.get('x-user-id');
  if (fromHeader) return fromHeader;
  const session = await getSession();
  return session?.userId || (await getSessionUserId());
}

export async function GET(request: NextRequest) {
  try {
    const userId = await resolveUserId(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const status = await getAiCredentialsPublic(userId);
    return NextResponse.json({
      ...status,
      providers: {
        bedrock: {
          id: 'bedrock',
          label: 'Platform (AWS Bedrock)',
          description: 'Uses Trio platform Claude via Bedrock — no key required',
          available: true,
        },
        anthropic: {
          id: 'anthropic',
          label: 'My Anthropic key (BYOK)',
          description: 'Your Claude API key — billed to your Anthropic account',
          available: status.hasAnthropicKey,
        },
        grok: {
          id: 'grok',
          label: 'My Grok key (BYOK)',
          description: 'Your xAI API key — billed to your xAI account',
          available: status.hasGrokKey,
        },
      },
    });
  } catch (err: any) {
    console.error('[ai/credentials GET]', err);
    return NextResponse.json(
      { error: err?.message || 'Failed to load AI credentials' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await resolveUserId(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const tenantId =
      request.headers.get('x-tenant-id') || (await getSessionTenantId());

    const body = await request.json();
    const action = body.action as string | undefined;

    // Set preferred provider only
    if (action === 'setPreferred' || (body.preferredProvider && !body.apiKey && !body.anthropicApiKey && !body.grokApiKey && !body.xaiApiKey)) {
      const preferred = (body.preferredProvider ||
        body.provider) as AiProviderPreference;
      if (
        preferred !== 'bedrock' &&
        preferred !== 'anthropic' &&
        preferred !== 'grok'
      ) {
        return NextResponse.json(
          { error: 'preferredProvider must be bedrock, anthropic, or grok' },
          { status: 400 }
        );
      }
      const status = await setPreferredProvider(userId, preferred, tenantId);
      return NextResponse.json({ success: true, ...status });
    }

    // Determine which provider key is being saved
    const keyProvider = (body.keyProvider ||
      body.provider ||
      (body.grokApiKey || body.xaiApiKey ? 'grok' : 'anthropic')) as
      | 'anthropic'
      | 'grok';

    const apiKey = (
      body.apiKey ||
      body.anthropicApiKey ||
      body.grokApiKey ||
      body.xaiApiKey ||
      ''
    ) as string;

    if (!apiKey.trim()) {
      return NextResponse.json({ error: 'apiKey is required' }, { status: 400 });
    }

    const validateOnly = body.validateOnly === true;

    if (keyProvider === 'grok') {
      const validation = await validateGrokKey(apiKey);
      if (!validation.ok) {
        return NextResponse.json(
          { error: validation.error || 'Invalid Grok/xAI API key', valid: false },
          { status: 400 }
        );
      }
      if (validateOnly) {
        return NextResponse.json({
          success: true,
          valid: true,
          model: validation.model,
          provider: 'grok',
        });
      }
      const status = await saveGrokKey({
        userId,
        tenantId,
        apiKey,
        setAsPreferred: body.setAsPreferred !== false,
      });
      return NextResponse.json({
        success: true,
        valid: true,
        model: validation.model,
        provider: 'grok',
        ...status,
      });
    }

    // Default: Anthropic
    const validation = await validateAnthropicKey(apiKey);
    if (!validation.ok) {
      return NextResponse.json(
        { error: validation.error || 'Invalid Anthropic API key', valid: false },
        { status: 400 }
      );
    }

    if (validateOnly) {
      return NextResponse.json({
        success: true,
        valid: true,
        model: validation.model,
        provider: 'anthropic',
      });
    }

    const status = await saveAnthropicKey({
      userId,
      tenantId,
      apiKey,
      setAsPreferred: body.setAsPreferred !== false,
    });

    return NextResponse.json({
      success: true,
      valid: true,
      model: validation.model,
      provider: 'anthropic',
      ...status,
    });
  } catch (err: any) {
    console.error('[ai/credentials POST]', err);
    return NextResponse.json(
      { error: err?.message || 'Failed to save AI credentials' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const userId = await resolveUserId(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const provider = (searchParams.get('provider') || 'anthropic') as
      | 'anthropic'
      | 'grok';

    const status =
      provider === 'grok'
        ? await deleteGrokKey(userId)
        : await deleteAnthropicKey(userId);

    return NextResponse.json({ success: true, ...status });
  } catch (err: any) {
    console.error('[ai/credentials DELETE]', err);
    return NextResponse.json(
      { error: err?.message || 'Failed to delete AI credentials' },
      { status: 500 }
    );
  }
}
