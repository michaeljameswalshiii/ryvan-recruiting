/**
 * Verify Amazon SNS envelopes before processing webhook notifications.
 *
 * @serverOnly
 */

import { createVerify } from 'crypto';

export type SnsEnvelope = {
  Type: 'Notification' | 'SubscriptionConfirmation' | 'UnsubscribeConfirmation';
  MessageId: string;
  TopicArn: string;
  Message: string;
  Subject?: string;
  Timestamp: string;
  SignatureVersion: '1' | '2';
  Signature: string;
  SigningCertURL: string;
  SubscribeURL?: string;
  Token?: string;
};

const certCache = new Map<string, string>();
const allowedCertHost = /^sns(\.[a-z0-9-]+)?\.amazonaws\.com(\.cn)?$/i;

function required(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`SNS message missing ${field}`);
  }
  return value;
}

function parseEnvelope(value: unknown): SnsEnvelope {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('SNS payload must be an object');
  }
  const input = value as Record<string, unknown>;
  const type = required(input.Type, 'Type');
  if (!['Notification', 'SubscriptionConfirmation', 'UnsubscribeConfirmation'].includes(type)) {
    throw new Error(`Unsupported SNS message type: ${type}`);
  }
  const signatureVersion = required(input.SignatureVersion, 'SignatureVersion');
  if (signatureVersion !== '1' && signatureVersion !== '2') {
    throw new Error(`Unsupported SNS signature version: ${signatureVersion}`);
  }

  return {
    Type: type as SnsEnvelope['Type'],
    MessageId: required(input.MessageId, 'MessageId'),
    TopicArn: required(input.TopicArn, 'TopicArn'),
    Message: required(input.Message, 'Message'),
    Subject: typeof input.Subject === 'string' ? input.Subject : undefined,
    Timestamp: required(input.Timestamp, 'Timestamp'),
    SignatureVersion: signatureVersion,
    Signature: required(input.Signature, 'Signature'),
    SigningCertURL: required(input.SigningCertURL, 'SigningCertURL'),
    SubscribeURL:
      typeof input.SubscribeURL === 'string' ? input.SubscribeURL : undefined,
    Token: typeof input.Token === 'string' ? input.Token : undefined,
  };
}

function stringToSign(envelope: SnsEnvelope): string {
  const keys =
    envelope.Type === 'Notification'
      ? ['Message', 'MessageId', 'Subject', 'Timestamp', 'TopicArn', 'Type'] as const
      : ['Message', 'MessageId', 'SubscribeURL', 'Timestamp', 'Token', 'TopicArn', 'Type'] as const;
  const lines: string[] = [];
  for (const key of keys) {
    const value = envelope[key];
    if (typeof value === 'string' && value.length > 0) lines.push(key, value);
  }
  return `${lines.join('\n')}\n`;
}

function validatedAmazonUrl(raw: string, kind: 'certificate' | 'subscription'): URL {
  const url = new URL(raw);
  if (url.protocol !== 'https:' || !allowedCertHost.test(url.hostname)) {
    throw new Error(`SNS ${kind} URL is not an allowed Amazon HTTPS URL`);
  }
  if (kind === 'certificate' && !url.pathname.startsWith('/SimpleNotificationService-')) {
    throw new Error('SNS certificate URL path is invalid');
  }
  return url;
}

async function signingCertificate(rawUrl: string): Promise<string> {
  const url = validatedAmazonUrl(rawUrl, 'certificate').toString();
  const cached = certCache.get(url);
  if (cached) return cached;

  const response = await fetch(url, { redirect: 'error' });
  if (!response.ok) throw new Error(`Could not fetch SNS certificate (${response.status})`);
  const certificate = await response.text();
  if (!certificate.includes('BEGIN CERTIFICATE')) {
    throw new Error('SNS certificate response was invalid');
  }
  certCache.set(url, certificate);
  return certificate;
}

export async function verifySnsEnvelope(
  value: unknown,
  expectedTopicArn?: string
): Promise<SnsEnvelope> {
  const envelope = parseEnvelope(value);
  if (expectedTopicArn && envelope.TopicArn !== expectedTopicArn) {
    throw new Error('Unexpected SNS topic');
  }

  const certificate = await signingCertificate(envelope.SigningCertURL);
  const verifier = createVerify(
    envelope.SignatureVersion === '1' ? 'RSA-SHA1' : 'RSA-SHA256'
  );
  verifier.update(stringToSign(envelope), 'utf8');
  verifier.end();
  if (!verifier.verify(certificate, envelope.Signature, 'base64')) {
    throw new Error('SNS signature verification failed');
  }
  return envelope;
}

export async function confirmSnsSubscription(envelope: SnsEnvelope): Promise<void> {
  if (envelope.Type !== 'SubscriptionConfirmation' || !envelope.SubscribeURL) {
    throw new Error('SNS subscription confirmation URL is missing');
  }
  const url = validatedAmazonUrl(envelope.SubscribeURL, 'subscription');
  const response = await fetch(url, { redirect: 'error' });
  if (!response.ok) throw new Error(`SNS subscription confirmation failed (${response.status})`);
}
