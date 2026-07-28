/**
 * High-level SMS send + inbound compliance handling.
 *
 * @serverOnly
 */

import {
  getSmsConfig,
  getConsent,
  upsertConsent,
  saveSmsMessage,
  listMessagesForCandidate,
  getDailySendCount,
  incrementDailySendCount,
  updateSmsConfig,
} from '@/lib/db/repositories/sms-repository';
import type {
  SendSmsInput,
  SmsMessage,
  SmsTenantConfig,
  UpdateSmsConfigInput,
  RecordConsentInput,
} from '@/lib/schemas/sms';
import { normalizeToE164 } from './phone';
import {
  classifyInboundKeyword,
  composeOutboundBody,
  complianceBlockMessage,
  helpAutoReply,
  isInQuietHours,
  startAutoReply,
  stopAutoReply,
  type ComplianceBlockReason,
} from './compliance';
import {
  getEnvOriginationIdentity,
  getProviderStatus,
  providerSendSms,
} from './provider';
import { getLeadById } from '@/lib/db/repositories/lead-repository';

export type SendSmsResult =
  | { ok: true; message: SmsMessage; simulated: boolean }
  | { ok: false; error: string; code?: ComplianceBlockReason | string };

function resolveOrigination(config: SmsTenantConfig): string | undefined {
  return (
    config.originationIdentity ||
    getEnvOriginationIdentity() ||
    undefined
  );
}

export async function getSmsSettings(tenantId: string) {
  const config = await getSmsConfig(tenantId);
  const provider = getProviderStatus();
  const sentToday = await getDailySendCount(tenantId);
  return {
    config,
    provider,
    sentToday,
    originationEffective: resolveOrigination(config) || null,
  };
}

export async function saveSmsSettings(
  tenantId: string,
  input: UpdateSmsConfigInput,
  userId?: string
) {
  return updateSmsConfig(tenantId, input, userId);
}

export async function recordConsent(
  tenantId: string,
  input: RecordConsentInput
) {
  const config = await getSmsConfig(tenantId);
  const norm = normalizeToE164(input.phone, config.defaultCountry);
  if (!norm.ok) return { ok: false as const, error: norm.error };
  const record = await upsertConsent({
    tenantId,
    phoneE164: norm.e164,
    status: input.status,
    source: input.source,
    candidateId: input.candidateId,
    notes: input.notes,
  });
  return { ok: true as const, record };
}

export async function sendSmsToCandidate(
  tenantId: string,
  input: SendSmsInput,
  userId?: string
): Promise<SendSmsResult> {
  const config = await getSmsConfig(tenantId);
  if (!config.enabled) {
    return {
      ok: false,
      error: complianceBlockMessage('disabled'),
      code: 'disabled',
    };
  }

  const lead = await getLeadById(tenantId, input.candidateId);
  const rawPhone =
    input.phone ||
    (lead as { phone?: string } | null)?.phone ||
    '';
  const norm = normalizeToE164(rawPhone, config.defaultCountry);
  if (!norm.ok) {
    return {
      ok: false,
      error: norm.error,
      code: 'invalid_phone',
    };
  }

  if (input.markConsent && input.consentSource) {
    await upsertConsent({
      tenantId,
      phoneE164: norm.e164,
      status: 'opted_in',
      source: input.consentSource,
      candidateId: input.candidateId,
    });
  }

  const consent = await getConsent(tenantId, norm.e164);
  if (consent?.status === 'opted_out') {
    return {
      ok: false,
      error: complianceBlockMessage('opted_out'),
      code: 'opted_out',
    };
  }

  if (config.requireConsent && consent?.status !== 'opted_in') {
    // Allow if allowColdOutreach and not require strict — requireConsent wins
    return {
      ok: false,
      error: complianceBlockMessage('consent_required'),
      code: 'consent_required',
    };
  }

  // Soft preference: allowColdOutreach=false is documented in Settings;
  // hard block remains requireConsent + opt-out.

  if (!input.bypassQuietHours && isInQuietHours(config)) {
    return {
      ok: false,
      error: complianceBlockMessage('quiet_hours'),
      code: 'quiet_hours',
    };
  }

  const sentToday = await getDailySendCount(tenantId);
  if (sentToday >= config.dailySendLimit) {
    return {
      ok: false,
      error: complianceBlockMessage('daily_limit'),
      code: 'daily_limit',
    };
  }

  const origination = resolveOrigination(config);
  // Without a from-number we still allow simulated sends so UI/compliance can be tested.

  const history = await listMessagesForCandidate(tenantId, input.candidateId);
  const isFirst = history.filter((m) => m.direction === 'outbound').length === 0;
  const { body, segments } = composeOutboundBody(input.body, config, {
    isFirstMessage: isFirst,
  });

  const providerResult = await providerSendSms({
    toE164: norm.e164,
    body,
    originationIdentity: origination || 'SIMULATED',
    configurationSetName: config.configurationSetName,
  });

  if (!providerResult.ok) {
    const failed = await saveSmsMessage(tenantId, {
      direction: 'outbound',
      status: 'failed',
      candidateId: input.candidateId,
      candidateName: (lead as { name?: string } | null)?.name,
      phoneE164: norm.e164,
      body,
      segments,
      provider: providerResult.provider,
      errorMessage: providerResult.error,
      createdBy: userId,
    });
    return { ok: false, error: providerResult.error, code: 'provider_error' };
  }

  await incrementDailySendCount(tenantId, 1);

  const message = await saveSmsMessage(tenantId, {
    direction: 'outbound',
    status: providerResult.provider === 'simulated' ? 'simulated' : 'sent',
    candidateId: input.candidateId,
    candidateName: (lead as { name?: string } | null)?.name,
    phoneE164: norm.e164,
    body,
    segments,
    provider: providerResult.provider,
    providerMessageId: providerResult.messageId,
    createdBy: userId,
  });

  // Soft activity note (non-fatal)
  try {
    const { addNoteToCandidate } = await import(
      '@/lib/events/candidate-events'
    );
    await addNoteToCandidate(
      input.candidateId,
      `SMS sent: ${body.slice(0, 200)}${body.length > 200 ? '…' : ''}`,
      userId || 'system',
      { noteType: 'SMS' }
    );
  } catch {
    /* optional */
  }

  return {
    ok: true,
    message,
    simulated: providerResult.provider === 'simulated',
  };
}

/**
 * Handle inbound SMS (from AWS event destination → our webhook).
 */
export async function handleInboundSms(params: {
  tenantId: string;
  fromE164: string;
  body: string;
  providerMessageId?: string;
  candidateId?: string;
}): Promise<{
  action: 'stop' | 'start' | 'help' | 'message';
  autoReply?: string;
  message: SmsMessage;
}> {
  const config = await getSmsConfig(params.tenantId);
  const keyword = classifyInboundKeyword(params.body);

  let autoReply: string | undefined;
  if (keyword === 'stop') {
    await upsertConsent({
      tenantId: params.tenantId,
      phoneE164: params.fromE164,
      status: 'opted_out',
      source: 'manual',
      candidateId: params.candidateId,
      lastKeyword: 'STOP',
    });
    autoReply = stopAutoReply(config);
  } else if (keyword === 'start') {
    await upsertConsent({
      tenantId: params.tenantId,
      phoneE164: params.fromE164,
      status: 'opted_in',
      source: 'inbound_start',
      candidateId: params.candidateId,
      lastKeyword: 'START',
    });
    autoReply = startAutoReply(config);
  } else if (keyword === 'help') {
    autoReply = helpAutoReply(config);
  }

  const message = await saveSmsMessage(params.tenantId, {
    direction: 'inbound',
    status: 'received',
    candidateId: params.candidateId,
    phoneE164: params.fromE164,
    body: params.body,
    segments: 1,
    provider: 'aws',
    providerMessageId: params.providerMessageId,
  });

  if (autoReply) {
    const origination = resolveOrigination(config);
    await providerSendSms({
      toE164: params.fromE164,
      body: autoReply,
      originationIdentity: origination || 'SIMULATED',
      configurationSetName: config.configurationSetName,
    });
    await saveSmsMessage(params.tenantId, {
      direction: 'outbound',
      status: 'sent',
      candidateId: params.candidateId,
      phoneE164: params.fromE164,
      body: autoReply,
      segments: 1,
      provider: origination ? 'aws' : 'simulated',
      createdBy: 'system',
    });
  }

  return {
    action: keyword === 'none' ? 'message' : keyword,
    autoReply,
    message,
  };
}
