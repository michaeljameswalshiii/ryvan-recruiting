/**
 * SMS provider: AWS End User Messaging SMS (Pinpoint SMS Voice v2).
 * Falls back to simulated mode when not configured (dev / pre-registration).
 *
 * @serverOnly
 */

import {
  PinpointSMSVoiceV2Client,
  SendTextMessageCommand,
} from '@aws-sdk/client-pinpoint-sms-voice-v2';

export type ProviderSendResult =
  | {
      ok: true;
      provider: 'aws' | 'simulated';
      messageId: string;
    }
  | {
      ok: false;
      provider: 'aws' | 'simulated';
      error: string;
    };

function getCredentials() {
  const accessKeyId =
    process.env.AWS_ACCESS_KEY_ID || process.env.MY_AWS_ACCESS_KEY_ID;
  const secretAccessKey =
    process.env.AWS_SECRET_ACCESS_KEY || process.env.MY_AWS_SECRET_ACCESS_KEY;
  if (!accessKeyId || !secretAccessKey) return undefined;
  return { accessKeyId, secretAccessKey };
}

export function isAwsSmsConfigured(): boolean {
  // Need credentials + either env origination or tenant config will supply identity
  return !!getCredentials() && process.env.SMS_PROVIDER !== 'off';
}

export function getEnvOriginationIdentity(): string | undefined {
  return (
    process.env.AWS_SMS_ORIGINATION_NUMBER ||
    process.env.SMS_ORIGINATION_IDENTITY ||
    undefined
  );
}

export function getProviderStatus(): {
  mode: 'aws' | 'simulated' | 'off';
  region: string;
  hasCredentials: boolean;
  envOrigination?: string;
  note: string;
} {
  if (process.env.SMS_PROVIDER === 'off') {
    return {
      mode: 'off',
      region: process.env.AWS_REGION || 'us-east-1',
      hasCredentials: false,
      note: 'SMS_PROVIDER=off',
    };
  }
  const creds = !!getCredentials();
  const envOrigination = getEnvOriginationIdentity();
  if (creds && process.env.SMS_PROVIDER !== 'simulated') {
    return {
      mode: 'aws',
      region: process.env.AWS_REGION || 'us-east-1',
      hasCredentials: true,
      envOrigination,
      note: envOrigination
        ? 'AWS credentials present; using End User Messaging SMS'
        : 'AWS credentials present; set origination number in Settings or AWS_SMS_ORIGINATION_NUMBER',
    };
  }
  return {
    mode: 'simulated',
    region: process.env.AWS_REGION || 'us-east-1',
    hasCredentials: creds,
    envOrigination,
    note: 'Simulated mode — messages are logged only until AWS SMS is fully configured',
  };
}

/**
 * Send SMS via AWS End User Messaging, or simulate when not live.
 */
export async function providerSendSms(params: {
  toE164: string;
  body: string;
  originationIdentity: string;
  configurationSetName?: string;
  forceSimulate?: boolean;
}): Promise<ProviderSendResult> {
  const status = getProviderStatus();
  const simulate =
    params.forceSimulate ||
    status.mode === 'simulated' ||
    status.mode === 'off' ||
    !params.originationIdentity ||
    params.originationIdentity === 'SIMULATED';

  if (simulate) {
    const id = `sim_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    console.log('[SMS][simulated]', {
      to: params.toE164,
      from: params.originationIdentity || '(none)',
      bodyPreview: params.body.slice(0, 80),
      id,
    });
    return { ok: true, provider: 'simulated', messageId: id };
  }

  const region = process.env.AWS_REGION || 'us-east-1';
  const credentials = getCredentials();
  if (!credentials) {
    return {
      ok: false,
      provider: 'aws',
      error: 'AWS credentials not configured',
    };
  }

  try {
    const client = new PinpointSMSVoiceV2Client({ region, credentials });
    const cmd = new SendTextMessageCommand({
      DestinationPhoneNumber: params.toE164,
      MessageBody: params.body,
      OriginationIdentity: params.originationIdentity,
      ConfigurationSetName: params.configurationSetName || undefined,
      // TRANSACTIONAL is safer default for recruiting ops; marketing needs registration
      MessageType: 'TRANSACTIONAL',
    });
    const out = await client.send(cmd);
    const messageId = out.MessageId || `aws_${Date.now()}`;
    return { ok: true, provider: 'aws', messageId };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'AWS SMS send failed';
    console.error('[SMS][aws] send error', message);
    return { ok: false, provider: 'aws', error: message };
  }
}
