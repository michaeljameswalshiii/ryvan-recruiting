'use client';

/**
 * Shared SMS panel for candidates and company contacts.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  MessageSquare,
  Loader2,
  Send,
  ShieldCheck,
  ShieldOff,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

type Msg = {
  id: string;
  direction: string;
  status: string;
  body: string;
  createdAt: string;
  phoneE164: string;
  provider?: string;
};

type Consent = {
  status: string;
  source?: string;
  optedInAt?: string;
  optedOutAt?: string;
} | null;

export type EntitySmsPanelProps = {
  entity: 'candidate' | 'contact';
  entityId: string;
  /** Required for contacts */
  companyId?: string;
  phone?: string;
  entityName?: string;
};

export function EntitySmsPanel({
  entity,
  entityId,
  companyId,
  phone,
  entityName,
}: EntitySmsPanelProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [consent, setConsent] = useState<Consent>(null);
  const [phoneE164, setPhoneE164] = useState<string | null>(null);
  const [body, setBody] = useState('');
  const [markConsent, setMarkConsent] = useState(true);
  const [bypassQuiet, setBypassQuiet] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [textingEnabled, setTextingEnabled] = useState<boolean | null>(null);

  const title =
    entity === 'contact' ? 'Text contact' : 'Text candidate';

  const loadConfigHint = useCallback(async () => {
    try {
      const res = await fetch('/api/sms/config', { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json();
      setTextingEnabled(!!data?.config?.enabled);
    } catch {
      /* ignore */
    }
  }, []);

  const load = useCallback(async () => {
    if (!entityId) return;
    if (entity === 'contact' && !companyId) return;
    setLoading(true);
    setLastError(null);
    try {
      const qs =
        entity === 'contact'
          ? `contactId=${encodeURIComponent(entityId)}&companyId=${encodeURIComponent(companyId || '')}`
          : `candidateId=${encodeURIComponent(entityId)}`;
      const res = await fetch(`/api/sms/messages?${qs}`, {
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setMessages(data.messages || []);
      setConsent(data.consent || null);
      setPhoneE164(data.phoneE164 || null);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to load SMS';
      setLastError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [entity, entityId, companyId]);

  useEffect(() => {
    if (open) {
      load();
      loadConfigHint();
    }
  }, [open, load, loadConfigHint]);

  const recordConsent = async (status: 'opted_in' | 'opted_out') => {
    const p = phone || phoneE164;
    if (!p) {
      toast.error('Add a phone number first');
      return;
    }
    setLastError(null);
    try {
      const res = await fetch('/api/sms/consent', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: p,
          candidateId: entity === 'candidate' ? entityId : undefined,
          contactId: entity === 'contact' ? entityId : undefined,
          companyId: entity === 'contact' ? companyId : undefined,
          status,
          source: 'manual',
          notes: `Recorded from ${entity} profile for ${entityName || entityId}`,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed');
      setConsent(data.record);
      toast.success(
        status === 'opted_in' ? 'Opt-in recorded' : 'Opt-out recorded'
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Consent failed';
      setLastError(msg);
      toast.error(msg);
    }
  };

  const send = async () => {
    if (!body.trim()) {
      toast.error('Enter a message');
      return;
    }
    if (entity === 'contact' && !companyId) {
      const msg = 'Missing company for this contact — open from company/contact-info with company linked.';
      setLastError(msg);
      toast.error(msg);
      return;
    }
    if (!phone && !phoneE164) {
      const msg = 'Add a phone number before texting.';
      setLastError(msg);
      toast.error(msg);
      return;
    }
    setSending(true);
    setLastError(null);
    try {
      const res = await fetch('/api/sms/send', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candidateId: entity === 'candidate' ? entityId : undefined,
          contactId: entity === 'contact' ? entityId : undefined,
          companyId: entity === 'contact' ? companyId : undefined,
          body: body.trim(),
          phone: phone || phoneE164 || undefined,
          markConsent: markConsent || undefined,
          consentSource: markConsent ? 'manual' : undefined,
          bypassQuietHours: bypassQuiet || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg =
          typeof data.error === 'string'
            ? data.error
            : data.details
              ? 'Invalid request — check phone and Company Settings → Texting'
              : 'Send failed';
        throw new Error(msg);
      }
      toast.success(
        data.simulated
          ? 'SMS simulated (logged in thread — finish AWS setup for live delivery)'
          : 'SMS sent'
      );
      setBody('');
      load();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Send failed';
      setLastError(msg);
      toast.error(msg, { duration: 8000 });
    } finally {
      setSending(false);
    }
  };

  const hasPhone = !!(phone || phoneE164);

  return (
    <div
      data-ink-on-light
      className="rounded-xl border border-slate-200 bg-white overflow-hidden text-slate-900 shadow-sm"
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-left text-slate-900 hover:bg-slate-50"
      >
        <span className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900">
          <MessageSquare className="h-4 w-4 text-violet-600" />
          {title}
          {consent?.status === 'opted_out' && (
            <span className="text-[10px] uppercase tracking-wide text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded">
              opted out
            </span>
          )}
          {consent?.status === 'opted_in' && (
            <span className="text-[10px] uppercase tracking-wide text-emerald-800 bg-emerald-100 px-1.5 py-0.5 rounded">
              consent ok
            </span>
          )}
        </span>
        <span className="text-xs font-medium text-slate-600">
          {open ? 'Hide' : 'Open'}
        </span>
      </button>

      {open && (
        <div className="border-t border-slate-200 px-4 py-3 space-y-3 bg-white text-slate-900">
          {textingEnabled === false && (
            <div className="flex items-start gap-2 text-xs text-rose-900 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
              <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>
                Texting is <strong>disabled</strong> for this workspace.{' '}
                <a
                  href="/dashboard/settings/company?tab=texting"
                  className="underline font-semibold"
                >
                  Company Settings → Texting
                </a>{' '}
                → enable texting, then try again.
              </span>
            </div>
          )}

          {!hasPhone && (
            <div className="flex items-start gap-2 text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              Add a phone number on this {entity} before texting.
            </div>
          )}

          {hasPhone && (
            <p className="text-[11px] text-slate-500">
              To: {phoneE164 || phone}
            </p>
          )}

          {lastError && (
            <div className="flex items-start gap-2 text-xs text-rose-900 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
              <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>{lastError}</span>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="border-slate-300 bg-white text-slate-900 hover:bg-slate-50"
              onClick={() => recordConsent('opted_in')}
            >
              <ShieldCheck className="h-3.5 w-3.5 mr-1" />
              Record opt-in
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="border-slate-300 bg-white text-slate-900 hover:bg-slate-50"
              onClick={() => recordConsent('opted_out')}
            >
              <ShieldOff className="h-3.5 w-3.5 mr-1" />
              Record opt-out
            </Button>
          </div>

          {loading ? (
            <div className="flex items-center gap-2 text-xs text-slate-600 py-4">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading thread…
            </div>
          ) : (
            <div className="max-h-48 overflow-y-auto space-y-2 rounded-lg bg-slate-50 border border-slate-100 p-2">
              {messages.length === 0 && (
                <p className="text-xs text-slate-500 text-center py-4">
                  No texts yet
                </p>
              )}
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`text-xs rounded-lg px-2.5 py-1.5 max-w-[90%] ${
                    m.direction === 'outbound'
                      ? 'ml-auto bg-violet-600 text-white'
                      : 'mr-auto bg-white border border-slate-200 text-slate-900'
                  }`}
                >
                  <div className="whitespace-pre-wrap">{m.body}</div>
                  <div
                    className={`mt-0.5 text-[10px] ${
                      m.direction === 'outbound'
                        ? 'text-violet-100'
                        : 'text-slate-500'
                    }`}
                  >
                    {new Date(m.createdAt).toLocaleString()} · {m.status}
                    {m.provider === 'simulated' ? ' · sim' : ''}
                  </div>
                </div>
              ))}
            </div>
          )}

          <Textarea
            rows={3}
            placeholder="Short message… (STOP notice may be appended)"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={1500}
            className="bg-white border-slate-300 text-slate-900 placeholder:text-slate-500"
          />
          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
            <label className="inline-flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={markConsent}
                onChange={(e) => setMarkConsent(e.target.checked)}
              />
              Also mark opt-in when sending
            </label>
            <label className="inline-flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={bypassQuiet}
                onChange={(e) => setBypassQuiet(e.target.checked)}
              />
              Bypass quiet hours (urgent only)
            </label>
            <span className="ml-auto text-slate-500">{body.length}/1500</span>
          </div>
          <Button
            type="button"
            size="sm"
            data-ink-keep
            className="bg-violet-600 hover:bg-violet-700 text-white"
            onClick={send}
            disabled={sending || !hasPhone || !body.trim()}
          >
            {sending ? (
              <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5 mr-1" />
            )}
            Send text
          </Button>
        </div>
      )}
    </div>
  );
}
