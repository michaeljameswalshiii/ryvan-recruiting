/**
 * AI BYOK credentials API
 * GET    — status (never returns raw keys)
 * POST   — save Anthropic/Grok/OpenAI/Gemini key or set preferred provider
 * DELETE — remove a key (?provider=anthropic|grok|openai|gemini)
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
  saveOpenaiKey,
  saveGeminiKey,
  setPreferredProvider,
  deleteAnthropicKey,
  deleteGrokKey,
  deleteOpenaiKey,
  deleteGeminiKey,
  validateAnthropicKey,
  validateGrokKey,
  validateOpenaiKey,
  validateGeminiKey,
  type AiProviderPreference,
  type ByokKeyProvider,
} from '@/lib/db/repositories/ai-credentials-repository';

async function resolveUserId(request: NextRequest): Promise<string | null> {
  const fromHeader = request.headers.get('x-user-id');
  if (fromHeader) return fromHeader;
  const session = await getSession();
  return session?.userId || (await getSessionUserId());
}

const BYOK_PROVIDERS: ByokKeyProvider[] = [
  'anthropic',
  'grok',
  'openai',
  'gemini',
];

function isByok(p: string): p is ByokKeyProvider {
  return (BYOK_PROVIDERS as string[]).includes(p);
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
        openai: {
          id: 'openai',
          label: 'My OpenAI key (BYOK)',
          description: 'Your OpenAI API key — billed to your OpenAI account',
          available: status.hasOpenaiKey,
        },
        gemini: {
          id: 'gemini',
          label: 'My Gemini key (BYOK)',
          description: 'Your Google AI Studio key — billed to your Google account',
          available: status.hasGeminiKey,
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

    const hasAnyKeyBody = !!(
      body.apiKey ||
      body.anthropicApiKey ||
      body.grokApiKey ||
      body.xaiApiKey ||
      body.openaiApiKey ||
      body.geminiApiKey
    );

    // Set preferred provider only
    if (
      action === 'setPreferred' ||
      (body.preferredProvider && !hasAnyKeyBody)
    ) {
      const preferred = (body.preferredProvider ||
        body.provider) as AiProviderPreference;
      const allowed: AiProviderPreference[] = [
        'bedrock',
        'anthropic',
        'grok',
        'openai',
        'gemini',
      ];
      if (!allowed.includes(preferred)) {
        return NextResponse.json(
          {
            error:
              'preferredProvider must be bedrock, anthropic, openai, gemini, or grok',
          },
          { status: 400 }
        );
      }
      const status = await setPreferredProvider(userId, preferred, tenantId);
      return NextResponse.json({ success: true, ...status });
    }

    const keyProvider = (body.keyProvider ||
      body.provider ||
      (body.openaiApiKey
        ? 'openai'
        : body.geminiApiKey
          ? 'gemini'
          : body.grokApiKey || body.xaiApiKey
            ? 'grok'
            : 'anthropic')) as string;

    if (!isByok(keyProvider)) {
      return NextResponse.json(
        { error: 'keyProvider must be anthropic, openai, gemini, or grok' },
        { status: 400 }
      );
    }

    const apiKey = (
      body.apiKey ||
      body.anthropicApiKey ||
      body.openaiApiKey ||
      body.geminiApiKey ||
      body.grokApiKey ||
      body.xaiApiKey ||
      ''
    ) as string;

    if (!apiKey.trim()) {
      return NextResponse.json({ error: 'apiKey is required' }, { status: 400 });
    }

    const validateOnly = body.validateOnly === true;

    const validators = {
      anthropic: validateAnthropicKey,
      grok: validateGrokKey,
      openai: validateOpenaiKey,
      gemini: validateGeminiKey,
    } as const;

    const savers = {
      anthropic: saveAnthropicKey,
      grok: saveGrokKey,
      openai: saveOpenaiKey,
      gemini: saveGeminiKey,
    } as const;

    const validation = await validators[keyProvider](apiKey);
    if (!validation.ok) {
      return NextResponse.json(
        {
          error: validation.error || `Invalid ${keyProvider} API key`,
          valid: false,
        },
        { status: 400 }
      );
    }
    if (validateOnly) {
      return NextResponse.json({
        success: true,
        valid: true,
        model: validation.model,
        provider: keyProvider,
      });
    }

    const status = await savers[keyProvider]({
      userId,
      tenantId,
      apiKey,
      setAsPreferred: body.setAsPreferred !== false,
    });

    return NextResponse.json({
      success: true,
      valid: true,
      model: validation.model,
      provider: keyProvider,
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
    const provider = (searchParams.get('provider') || 'anthropic') as string;
    if (!isByok(provider)) {
      return NextResponse.json(
        { error: 'provider must be anthropic, openai, gemini, or grok' },
        { status: 400 }
      );
    }

    const deleters = {
      anthropic: deleteAnthropicKey,
      grok: deleteGrokKey,
      openai: deleteOpenaiKey,
      gemini: deleteGeminiKey,
    } as const;

    const status = await deleters[provider](userId);
    return NextResponse.json({ success: true, ...status });
  } catch (err: any) {
    console.error('[ai/credentials DELETE]', err);
    return NextResponse.json(
      { error: err?.message || 'Failed to delete AI credentials' },
      { status: 500 }
    );
  }
}
