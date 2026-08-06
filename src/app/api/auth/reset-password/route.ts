import { NextRequest, NextResponse } from 'next/server';
import { hash } from 'bcryptjs';
import { consumePasswordReset } from '@/lib/auth/password-reset';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const token = String(body.token || '').trim();
  const password = String(body.password || '');
  if (!token || password.length < 8 || password.length > 100) {
    return NextResponse.json({ error: 'Use a valid reset link and a password of at least 8 characters.' }, { status: 400 });
  }
  try {
    const ok = await consumePasswordReset(token, await hash(password, 12));
    if (!ok) return NextResponse.json({ error: 'This reset link is invalid or expired.' }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[PASSWORD_RESET] consume failed', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'Unable to reset password right now.' }, { status: 500 });
  }
}
