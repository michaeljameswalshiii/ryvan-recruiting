'use client';

import { useState } from 'react';
import { Loader2, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';

type OAuthConsentClientProps = {
  clientName: string;
  request: Record<string, string>;
};

export function OAuthConsentClient({ clientName, request }: OAuthConsentClientProps) {
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState('');

  function deny() {
    const callback = new URL(request.redirect_uri);
    callback.searchParams.set('error', 'access_denied');
    callback.searchParams.set('error_description', 'The user denied the authorization request.');
    if (request.state) callback.searchParams.set('state', request.state);
    window.location.assign(callback.toString());
  }

  async function approve() {
    setApproving(true);
    setError('');
    try {
      const response = await fetch('/api/oauth/authorize', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body?.redirectTo) {
        throw new Error(body?.error || 'Unable to authorize this connection');
      }
      window.location.assign(body.redirectTo);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to authorize this connection');
      setApproving(false);
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 px-4 py-12">
      <div className="mx-auto max-w-lg rounded-2xl border border-slate-200 bg-white p-7 shadow-xl shadow-slate-200/50">
        <div className="mb-6 flex items-start gap-3">
          <div className="rounded-xl bg-blue-50 p-2.5 text-blue-700">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-slate-950">Connect {clientName}</h1>
            <p className="mt-1 text-sm text-slate-600">
              Review the access requested for your Turnkey organization.
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-medium text-slate-900">This connection will be able to:</p>
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-slate-700">
            <li>Search and view candidates</li>
            <li>View jobs and pipeline information</li>
            <li>Add candidate activity notes</li>
          </ul>
        </div>

        <p className="mt-4 text-xs leading-5 text-slate-500">
          Access is limited to your current organization. You can revoke this OAuth client from Company Settings at any time.
        </p>

        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={deny} disabled={approving}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void approve()} disabled={approving} className="bg-blue-600 hover:bg-blue-700">
            {approving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Authorize connection
          </Button>
        </div>
      </div>
    </main>
  );
}
