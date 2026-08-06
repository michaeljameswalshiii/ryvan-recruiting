'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

function ResetPasswordForm() {
  const params = useSearchParams();
  const token = params.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setError(''); setMessage('');
    if (!token) return setError('This reset link is missing or invalid.');
    if (password.length < 8) return setError('Password must be at least 8 characters.');
    if (password !== confirm) return setError('Passwords do not match.');
    setBusy(true);
    try {
      const res = await fetch('/api/auth/reset-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, password }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error || 'Could not reset password.'); return; }
      setMessage('Password reset successfully. You can now sign in.');
      setPassword(''); setConfirm('');
    } catch { setError('Could not reset password. Please try again.'); }
    finally { setBusy(false); }
  }

  return <main className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
    <form onSubmit={submit} className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-7 shadow-sm space-y-5">
      <div><h1 className="text-2xl font-semibold text-slate-900">Set a new password</h1><p className="mt-1 text-sm text-slate-500">Choose a new password for your Trio account.</p></div>
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {message && <p className="rounded-lg bg-green-50 p-3 text-sm text-green-700">{message} <Link className="font-semibold underline" href="/login">Sign in</Link></p>}
      <label className="block text-sm font-medium text-slate-700">New password<input type="password" minLength={8} required value={password} onChange={e => setPassword(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" autoComplete="new-password" /></label>
      <label className="block text-sm font-medium text-slate-700">Confirm password<input type="password" minLength={8} required value={confirm} onChange={e => setConfirm(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" autoComplete="new-password" /></label>
      <button disabled={busy || !token} className="w-full rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Saving…' : 'Reset password'}</button>
    </form>
  </main>;
}

export default function ResetPasswordPage() {
  return <Suspense fallback={<main className="min-h-screen bg-slate-50" />}><ResetPasswordForm /></Suspense>;
}
