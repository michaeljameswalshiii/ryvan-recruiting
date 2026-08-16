/**
 * Signed Amazon SNS webhook for inbound SMS and delivery events.
 *
 * @serverOnly
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  findSmsTenantByOriginationIdentity,
  incrementSmsConversationUnread,
  resolveSmsConversationRoute,
  upsertSmsConversationRoute,
} from '@/lib/db/repositories/sms-repository';
import { normalizeToE164 } from '@/lib/sms/phone';
import { handleInboundSms } from '@/lib/sms/service';
import {
  confirmSnsSubscription,
  verifySnsEnvelope,
} from '@/lib/sms/sns';

function objectValue(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function textValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export async function POST(request: NextRequest) {
  try {
    const envelopeBody = await request.json();
    const envelope = await verifySnsEnvelope(
      envelopeBody,
      process.env.AWS_SMS_INBOUND_TOPIC_ARN
    );

    if (envelope.Type === 'SubscriptionConfirmation') {
      await confirmSnsSubscription(envelope);
      return NextResponse.json({ ok: true, subscription: 'confirmed' });
    }
    if (envelope.Type !== 'Notification') {
      return NextResponse.json({ ok: true, ignored: envelope.Type });
    }

    const payload = objectValue(JSON.parse(envelope.Message));
    const from = textValue(
      payload.originationNumber || payload.originatingNumber || payload.from
    );
    const destination = textValue(
      payload.destinationNumber || payload.destinationPhoneNumber || payload.to
    );
    const messageBody = textValue(
      payload.messageBody || payload.body || payload.message
    );

    // Configuration-set delivery events share this topic but are not replies.
    if (!from || !messageBody) {
      return NextResponse.json({ ok: true, event: 'delivery-status' });
    }

    const normalized = normalizeToE164(from, 'US');
    if (!normalized.ok) {
      return NextResponse.json({ error: normalized.error }, { status: 400 });
    }

    const previousProviderMessageId = textValue(
      payload.previousPublishedMessageId || payload.previousMessageId
    );
    const route = await resolveSmsConversationRoute({
      destinationNumber: destination || undefined,
      phoneE164: normalized.e164,
      previousProviderMessageId: previousProviderMessageId || undefined,
    });

    const tenantId =
      route?.tenant_id ||
      textValue(payload.tenantId || payload.tenant_id) ||
      (destination
        ? await findSmsTenantByOriginationIdentity(destination)
        : null) ||
      process.env.SMS_DEFAULT_TENANT_ID;
    if (!tenantId) {
      return NextResponse.json(
        { error: 'No Turnkey tenant is configured for this SMS destination' },
        { status: 422 }
      );
    }

    const initialConversation = route || (destination
      ? await upsertSmsConversationRoute({
          tenantId,
          destinationNumber: destination,
          phoneE164: normalized.e164,
        })
      : null);

    const result = await handleInboundSms({
      tenantId,
      fromE164: normalized.e164,
      body: messageBody,
      providerMessageId: textValue(
        payload.inboundMessageId || payload.messageId || envelope.MessageId
      ),
      candidateId:
        initialConversation?.candidateId ||
        textValue(payload.candidateId) ||
        undefined,
      candidateName: initialConversation?.candidateName,
      contactId: initialConversation?.contactId,
      contactName: initialConversation?.contactName,
      companyId: initialConversation?.companyId,
      ownerUserId: initialConversation?.ownerUserId,
      ownerName: initialConversation?.ownerName,
      ownerEmail: initialConversation?.ownerEmail,
      conversationKey: initialConversation?.id,
      originationIdentity:
        destination || initialConversation?.destinationNumber,
    });

    const conversation = destination
      ? await upsertSmsConversationRoute({
          tenantId,
          destinationNumber: destination,
          phoneE164: normalized.e164,
          candidateId: result.message.candidateId,
          candidateName: result.message.candidateName,
          contactId: result.message.contactId,
          contactName: result.message.contactName,
          companyId: result.message.companyId,
          ownerUserId: result.message.ownerUserId,
          ownerName: result.message.ownerName,
          ownerEmail: result.message.ownerEmail,
        })
      : initialConversation;
    if (conversation) {
      await incrementSmsConversationUnread(conversation.id);
    }

    return NextResponse.json({
      ok: true,
      action: result.action,
      autoReply: result.autoReply,
      messageId: result.message.id,
    });
  } catch (error) {
    console.error('[SMS_INBOUND]', error);
    return NextResponse.json({ error: 'Invalid SNS notification' }, { status: 403 });
  }
}

export async function GET() {
  return NextResponse.json({
    service: 'turnkey-sms-inbound',
    method: 'POST',
    authentication: 'Amazon SNS signature verification',
  });
}
