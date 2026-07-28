/**
 * Public inbound SMS webhook (AWS End User Messaging event destination).
 * POST /api/public/sms/inbound
 *
 * Protect with shared secret header: x-sms-webhook-secret === SMS_WEBHOOK_SECRET
 * Or set tenantId in body when using multi-tenant routing.
 *
 * Expected body (flexible):
 * {
 *   tenantId?: string,
 *   originationNumber / destinationNumber / messageBody / messageId
 *   OR from / to / body / messageId
 * }
 *
 * @serverOnly
 */

import { NextRequest, NextResponse } from 'next/server';
import { handleInboundSms } from '@/lib/sms/service';
import { normalizeToE164 } from '@/lib/sms/phone';

function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

export async function POST(request: NextRequest) {
  try {
    const secret = process.env.SMS_WEBHOOK_SECRET;
    if (secret) {
      const header = request.headers.get('x-sms-webhook-secret');
      if (header !== secret) return unauthorized();
    }

    const body = await request.json().catch(() => ({}));
    const tenantId =
      body.tenantId ||
      body.tenant_id ||
      process.env.SMS_DEFAULT_TENANT_ID ||
      null;

    if (!tenantId) {
      return NextResponse.json(
        { error: 'tenantId required (body or SMS_DEFAULT_TENANT_ID)' },
        { status: 400 }
      );
    }

    const fromRaw =
      body.originationNumber ||
      body.originatingNumber ||
      body.from ||
      body.source ||
      body.SourceNumber;
    const text =
      body.messageBody || body.body || body.message || body.MessageBody || '';

    if (!fromRaw || !text) {
      return NextResponse.json(
        { error: 'from and body required' },
        { status: 400 }
      );
    }

    const norm = normalizeToE164(String(fromRaw), 'US');
    if (!norm.ok) {
      return NextResponse.json({ error: norm.error }, { status: 400 });
    }

    const result = await handleInboundSms({
      tenantId: String(tenantId),
      fromE164: norm.e164,
      body: String(text),
      providerMessageId:
        body.messageId || body.MessageId || body.inboundMessageId,
      candidateId: body.candidateId,
    });

    return NextResponse.json({
      ok: true,
      action: result.action,
      autoReply: result.autoReply,
      messageId: result.message.id,
    });
  } catch (error) {
    console.error('[SMS_INBOUND]', error);
    return NextResponse.json({ error: 'Inbound handler failed' }, { status: 500 });
  }
}

/** Health / docs for webhook setup */
export async function GET() {
  return NextResponse.json({
    service: 'trio-sms-inbound',
    method: 'POST',
    auth: 'Header x-sms-webhook-secret when SMS_WEBHOOK_SECRET is set',
  });
}
