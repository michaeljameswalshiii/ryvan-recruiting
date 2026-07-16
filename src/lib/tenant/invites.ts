/**
 * Tenant invite tokens + optional email delivery.
 * @serverOnly
 */

import { createHash, randomBytes } from "crypto";
import { Resend } from "resend";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export function generateInviteToken(): string {
  return randomBytes(32).toString("hex");
}

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function inviteExpiresAt(from = Date.now()): string {
  return new Date(from + INVITE_TTL_MS).toISOString();
}

export function isInviteExpired(expiresAt: string | undefined): boolean {
  if (!expiresAt) return true;
  return new Date(expiresAt).getTime() < Date.now();
}

export function appBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "") ||
    "http://localhost:3000"
  ).replace(/\/$/, "");
}

export function inviteAcceptUrl(token: string): string {
  return `${appBaseUrl()}/invite/accept?token=${encodeURIComponent(token)}`;
}

/**
 * Send invite email via Resend when configured.
 * Returns { sent: false } if not configured so UI can show copy-link.
 */
export async function sendInviteEmail(opts: {
  to: string;
  tenantName: string;
  inviterName?: string;
  inviteUrl: string;
  roleLabel: string;
}): Promise<{ sent: boolean; error?: string }> {
  if (!process.env.RESEND_API_KEY || !process.env.FROM_EMAIL) {
    return { sent: false, error: "Email not configured" };
  }

  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error } = await resend.emails.send({
      from: process.env.FROM_EMAIL,
      to: opts.to,
      subject: `You're invited to ${opts.tenantName} on Trio ATS`,
      html: `
        <p>You've been invited to join <strong>${escapeHtml(opts.tenantName)}</strong>
        as <strong>${escapeHtml(opts.roleLabel)}</strong>${
          opts.inviterName
            ? ` by ${escapeHtml(opts.inviterName)}`
            : ""
        }.</p>
        <p><a href="${opts.inviteUrl}">Accept invitation</a></p>
        <p>This link expires in 7 days.</p>
        <p style="color:#666;font-size:12px;">If the button doesn't work, copy this URL:<br/>${escapeHtml(
          opts.inviteUrl
        )}</p>
      `,
    });
    if (error) {
      return { sent: false, error: error.message };
    }
    return { sent: true };
  } catch (err) {
    return {
      sent: false,
      error: err instanceof Error ? err.message : "Failed to send email",
    };
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
