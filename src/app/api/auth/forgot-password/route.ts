import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { createPasswordReset } from '@/lib/auth/password-reset';

export const dynamic = 'force-dynamic';

function appUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '')).replace(/\/$/, '');
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const email = String(body.email || '').trim().toLowerCase();
  // Always return the same response to avoid account enumeration.
  const generic = { message: 'If an account matches that email, a reset link has been sent.' };
  if (!email || !email.includes('@')) return NextResponse.json(generic);
  try {
    const reset = await createPasswordReset(email);
    if (!reset) return NextResponse.json(generic);
    if (!process.env.RESEND_API_KEY || !process.env.FROM_EMAIL) {
      console.error('[PASSWORD_RESET] RESEND_API_KEY or FROM_EMAIL is not configured');
      return NextResponse.json(generic);
    }
    const link = `${appUrl()}/reset-password?token=${encodeURIComponent(reset.token)}`;
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error } = await resend.emails.send({
      from: process.env.FROM_EMAIL,
      to: reset.email,
      subject: 'Reset your Trio password',
      html: `<p>We received a request to reset your Trio password.</p><p><a href="${link}">Reset your password</a></p><p>This link expires in 30 minutes. If you did not request this, you can ignore this email.</p>`,
    });
    if (error) console.error('[PASSWORD_RESET] email failed', error.message);
  } catch (error) {
    console.error('[PASSWORD_RESET] request failed', error instanceof Error ? error.message : error);
  }
  return NextResponse.json(generic);
}
