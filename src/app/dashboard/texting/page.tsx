'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Loader2,
  MessageSquare,
  RefreshCw,
  Search,
  Send,
  UserRound,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

type SmsMessage = {
  id: string;
  direction: 'inbound' | 'outbound';
  status: string;
  body: string;
  phoneE164: string;
  candidateId?: string;
  candidateName?: string;
  contactId?: string;
  contactName?: string;
  companyId?: string;
  provider?: string;
  ownerUserId?: string;
  ownerName?: string;
  ownerEmail?: string;
  conversationKey?: string;
  originationIdentity?: string;
  createdAt: string;
};

type SmsRoute = {
  id: string;
  destinationNumber: string;
  phoneE164: string;
  candidateId?: string;
  contactId?: string;
  ownerUserId?: string;
  ownerName?: string;
  ownerEmail?: string;
  unreadCount: number;
};

type TeamMember = {
  id: string;
  full_name: string;
  email: string;
  status: string;
};

type InboxScope = 'my' | 'all' | 'unassigned';

type Thread = {
  key: string;
  title: string;
  subtitle: string;
  messages: SmsMessage[];
  latest: SmsMessage;
  route?: SmsRoute;
  ownerLabel: string;
  unreadCount: number;
};

function threadKey(message: SmsMessage) {
  if (message.contactId) return `contact:${message.contactId}`;
  if (message.candidateId) return `candidate:${message.candidateId}`;
  return `phone:${message.phoneE164}`;
}

function profileHref(message: SmsMessage): string | null {
  if (message.candidateId) {
    return `/dashboard/candidates/${encodeURIComponent(message.candidateId)}`;
  }
  if (message.contactId) {
    const query = message.companyId
      ? `?companyId=${encodeURIComponent(message.companyId)}`
      : '';
    return `/dashboard/contact-info/${encodeURIComponent(message.contactId)}${query}`;
  }
  return null;
}

export default function TextingInboxPage() {
  const [messages, setMessages] = useState<SmsMessage[]>([]);
  const [routes, setRoutes] = useState<SmsRoute[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [scope, setScope] = useState<InboxScope>('my');
  const [canViewAll, setCanViewAll] = useState(false);
  const [currentUserId, setCurrentUserId] = useState('');
  const [selectedKey, setSelectedKey] = useState('');
  const [query, setQuery] = useState('');
  const [reply, setReply] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/sms/messages?scope=${scope}`, {
        credentials: 'include',
        cache: 'no-store',
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to load texts');
      setMessages(Array.isArray(data.messages) ? data.messages : []);
      setRoutes(Array.isArray(data.routes) ? data.routes : []);
      setCanViewAll(Boolean(data.canViewAll));
      setCurrentUserId(String(data.currentUserId || ''));
      if (data.canViewAll) {
        const membersResponse = await fetch('/api/tenant/members', {
          credentials: 'include',
          cache: 'no-store',
        });
        if (membersResponse.ok) {
          const membersData = await membersResponse.json();
          setMembers(
            (Array.isArray(membersData.members) ? membersData.members : []).filter(
              (member: TeamMember) => member.status === 'active'
            )
          );
        }
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load texts');
    } finally {
      setLoading(false);
    }
  }, [scope]);

  useEffect(() => {
    load();
  }, [load]);

  const threads = useMemo(() => {
    const grouped = new Map<string, SmsMessage[]>();
    for (const message of messages) {
      const route =
        routes.find((item) => item.id === message.conversationKey) ||
        routes.find(
          (item) =>
            item.phoneE164 === message.phoneE164 &&
            (!message.originationIdentity ||
              item.destinationNumber === message.originationIdentity)
        ) ||
        routes.find(
          (item) =>
            (!!message.candidateId && item.candidateId === message.candidateId) ||
            (!!message.contactId && item.contactId === message.contactId)
        );
      const key = route?.id || threadKey(message);
      grouped.set(key, [...(grouped.get(key) || []), message]);
    }
    return Array.from(grouped, ([key, threadMessages]) => {
      const sorted = threadMessages.sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
      const latest = sorted[sorted.length - 1];
      const route = routes.find((item) => item.id === key);
      return {
        key,
        title:
          latest.contactName ||
          latest.candidateName ||
          latest.phoneE164 ||
          'Unknown person',
        subtitle: latest.contactId ? 'Contact' : latest.candidateId ? 'Candidate' : 'Phone',
        messages: sorted,
        latest,
        route,
        ownerLabel:
          route?.ownerName ||
          route?.ownerEmail ||
          latest.ownerName ||
          latest.ownerEmail ||
          'Unassigned',
        unreadCount: route?.unreadCount || 0,
      } satisfies Thread;
    }).sort(
      (a, b) =>
        new Date(b.latest.createdAt).getTime() -
        new Date(a.latest.createdAt).getTime()
    );
  }, [messages, routes]);

  useEffect(() => {
    if (!selectedKey && threads[0]) setSelectedKey(threads[0].key);
    if (selectedKey && !threads.some((thread) => thread.key === selectedKey)) {
      setSelectedKey(threads[0]?.key || '');
    }
  }, [selectedKey, threads]);

  const filteredThreads = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return threads;
    return threads.filter((thread) =>
      [thread.title, thread.latest.phoneE164, thread.latest.body]
        .join(' ')
        .toLowerCase()
        .includes(needle)
    );
  }, [query, threads]);

  const selected = threads.find((thread) => thread.key === selectedKey) || null;

  const chooseThread = async (thread: Thread) => {
    setSelectedKey(thread.key);
    if (
      !thread.route ||
      !thread.unreadCount ||
      (thread.route.ownerUserId
        ? thread.route.ownerUserId !== currentUserId
        : !canViewAll)
    ) return;
    setRoutes((current) =>
      current.map((route) =>
        route.id === thread.route!.id ? { ...route, unreadCount: 0 } : route
      )
    );
    await fetch('/api/sms/threads/read', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationKey: thread.route.id }),
    });
  };

  const assignThread = async (ownerUserId: string) => {
    if (!selected?.route) return;
    try {
      const response = await fetch('/api/sms/threads/assign', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationKey: selected.route.id,
          ownerUserId: ownerUserId || null,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Assignment failed');
      toast.success(ownerUserId ? 'Conversation assigned' : 'Conversation unassigned');
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Assignment failed');
    }
  };

  const sendReply = async () => {
    if (!selected || !reply.trim()) return;
    setSending(true);
    try {
      const message = selected.latest;
      if (!message.candidateId && !message.contactId) {
        throw new Error('Open this person and link the phone before replying.');
      }
      const response = await fetch('/api/sms/send', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candidateId: message.candidateId,
          contactId: message.contactId,
          companyId: message.companyId,
          phone: message.phoneE164,
          body: reply.trim(),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Reply failed');
      setReply('');
      toast.success(data.simulated ? 'Reply logged in simulated mode' : 'Reply sent');
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Reply failed');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-5" data-ink-on-light>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-600">
            Conversations
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">
            Texting inbox
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Candidate and contact replies are routed to the user who owns the record.
          </p>
        </div>
        <Button variant="outline" onClick={load} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </header>

      {canViewAll && (
        <div className="flex w-fit rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
          {([
            ['my', 'My texts'],
            ['all', 'All company'],
            ['unassigned', 'Unassigned'],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setScope(value)}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                scope === value
                  ? 'bg-slate-950 text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      <section className="grid min-h-[650px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:grid-cols-[340px_1fr]">
        <aside className="border-b border-slate-200 bg-slate-50/80 lg:border-b-0 lg:border-r">
          <div className="border-b border-slate-200 p-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search people or messages"
                className="bg-white pl-9"
              />
            </div>
          </div>
          <div className="max-h-[590px] overflow-y-auto p-2">
            {loading && messages.length === 0 && (
              <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading texts
              </div>
            )}
            {!loading && filteredThreads.length === 0 && (
              <div className="px-4 py-12 text-center text-sm text-slate-500">
                No text conversations yet.
              </div>
            )}
            {filteredThreads.map((thread) => (
              <button
                key={thread.key}
                type="button"
                onClick={() => chooseThread(thread)}
                className={`mb-1 w-full rounded-xl px-3 py-3 text-left transition ${
                  selectedKey === thread.key
                    ? 'bg-slate-950 text-white shadow-sm'
                    : 'text-slate-900 hover:bg-white'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{thread.title}</p>
                    <p className={`text-xs ${selectedKey === thread.key ? 'text-slate-300' : 'text-slate-500'}`}>
                      {thread.subtitle} · {thread.latest.phoneE164}
                    </p>
                  </div>
                  <span className={`shrink-0 text-[10px] ${selectedKey === thread.key ? 'text-slate-300' : 'text-slate-400'}`}>
                    {new Date(thread.latest.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <span className={`truncate text-[10px] ${selectedKey === thread.key ? 'text-slate-300' : 'text-slate-500'}`}>
                    Owner: {thread.ownerLabel}
                  </span>
                  {thread.unreadCount > 0 && (
                    <span className="rounded-full bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold text-slate-950">
                      {thread.unreadCount}
                    </span>
                  )}
                </div>
                <p className={`mt-2 truncate text-xs ${selectedKey === thread.key ? 'text-slate-200' : 'text-slate-600'}`}>
                  {thread.latest.direction === 'outbound' ? 'You: ' : ''}
                  {thread.latest.body}
                </p>
              </button>
            ))}
          </div>
        </aside>

        <div className="flex min-h-[650px] flex-col bg-[radial-gradient(circle_at_top_right,_#f5f3ff,_transparent_38%),linear-gradient(#fff,#f8fafc)]">
          {!selected ? (
            <div className="m-auto text-center text-slate-500">
              <MessageSquare className="mx-auto mb-3 h-10 w-10 text-slate-300" />
              Choose a conversation to read and reply.
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white/85 px-5 py-4 backdrop-blur">
                <div>
                  <h2 className="font-semibold text-slate-950">{selected.title}</h2>
                  <p className="text-xs text-slate-500">
                    {selected.latest.phoneE164} · Owner: {selected.ownerLabel}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {canViewAll && selected.route && (
                    <select
                      value={selected.route.ownerUserId || ''}
                      onChange={(event) => assignThread(event.target.value)}
                      className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700"
                      aria-label="Assign conversation owner"
                    >
                      <option value="">Unassigned</option>
                      {members.map((member) => (
                        <option key={member.id} value={member.id}>
                          {member.full_name || member.email}
                        </option>
                      ))}
                    </select>
                  )}
                  {profileHref(selected.latest) && (
                    <Link
                      href={profileHref(selected.latest)!}
                      className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      <UserRound className="h-4 w-4" /> View profile
                    </Link>
                  )}
                </div>
              </div>
              <div className="flex-1 space-y-3 overflow-y-auto p-5">
                {selected.messages.map((message) => (
                  <div
                    key={message.id}
                    className={`max-w-[78%] rounded-2xl px-4 py-2.5 text-sm shadow-sm ${
                      message.direction === 'outbound'
                        ? 'ml-auto rounded-br-sm bg-slate-950 text-white'
                        : 'mr-auto rounded-bl-sm border border-slate-200 bg-white text-slate-900'
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{message.body}</p>
                    <p className={`mt-1 text-[10px] ${message.direction === 'outbound' ? 'text-slate-300' : 'text-slate-400'}`}>
                      {new Date(message.createdAt).toLocaleString()} · {message.status}
                    </p>
                  </div>
                ))}
              </div>
              <div className="border-t border-slate-200 bg-white p-4">
                <Textarea
                  value={reply}
                  onChange={(event) => setReply(event.target.value)}
                  placeholder="Write a quick reply..."
                  rows={3}
                  maxLength={1500}
                />
                <div className="mt-3 flex items-center justify-between gap-3">
                  <span className="text-xs text-slate-400">{reply.length}/1500</span>
                  <Button onClick={sendReply} disabled={sending || !reply.trim()}>
                    {sending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="mr-2 h-4 w-4" />
                    )}
                    Send reply
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
