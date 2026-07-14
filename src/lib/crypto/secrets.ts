/**
 * AES-256-GCM helpers for encrypting user secrets (BYOK API keys).
 * Server-only — never import from client components.
 */
import crypto from 'crypto';

function getEncryptionKey(): Buffer {
  const secret =
    process.env.AI_CREDENTIALS_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    process.env.AWS_SECRET_ACCESS_KEY ||
    process.env.MY_AWS_SECRET_ACCESS_KEY;

  if (!secret) {
    // Dev fallback — production should set AI_CREDENTIALS_SECRET
    console.warn(
      '[secrets] AI_CREDENTIALS_SECRET not set; using weak dev key. Set AI_CREDENTIALS_SECRET in Vercel.'
    );
    return crypto.createHash('sha256').update('turnkey-dev-only-ai-secret').digest();
  }

  return crypto.createHash('sha256').update(secret).digest();
}

/** Encrypt plaintext → base64(iv|tag|ciphertext) */
export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

/** Decrypt base64(iv|tag|ciphertext) → plaintext */
export function decryptSecret(payload: string): string {
  const buf = Buffer.from(payload, 'base64');
  if (buf.length < 28) {
    throw new Error('Invalid encrypted payload');
  }
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const data = buf.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', getEncryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

/** Mask key for UI: sk-ant-…abcd */
export function maskSecret(plain: string, visible = 4): string {
  if (!plain || plain.length <= visible) return '••••';
  const start = plain.slice(0, Math.min(7, plain.length));
  const end = plain.slice(-visible);
  return `${start}…${end}`;
}
