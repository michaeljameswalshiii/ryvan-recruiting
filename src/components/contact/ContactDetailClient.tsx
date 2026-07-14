'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Mail,
  Phone,
  MapPin,
  Pencil,
  Trash2,
  Loader2,
  Building2,
  Briefcase,
  ChevronRight,
  Star,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { useRemoveContact } from '@/lib/hooks/query-client';
import { useUpdateContact } from '@/lib/hooks/contact-mutations';
import {
  logContactActivity,
  getContactActivities,
} from '@/lib/actions/contact-actions';
import { getDisplayPhone, getDisplayPhoneType } from '@/lib/contacts/phone';
import { SendEmailModal } from '@/components/email/send-email-modal';

/** Contact activity types (BD-focused, matches prior contact tooling) */
const NOTE_TYPES = [
  '01 Left Voicemail',
  '02 Email Sent',
  '03 Email Received',
  '04 Text Sent',
  '05 Text Received',
  '06 LinkedIn Message Sent',
  '07 Conversation Engaged',
  '08 No Answer',
  '09 Initial Outreach',
  '10 Qualification Call',
  '11 Discovery Call',
  '12 Demo / Presentation',
  '13 Proposal Sent',
  '14 Proposal Review',
  '15 Contract Sent',
  '16 Contract Signed',
  '17 Meeting Scheduled',
  '18 Meeting Completed',
  '19 Follow-up Needed',
  '20 Follow-up Completed',
  '21 Note',
  '22 Other',
];

function getInitials(name: string) {
  if (!name) return '?';
  return name
    .split(/\s+/)
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function formatDateTime(value?: string) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

function formatShortDate(value?: string) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return '—';
  }
}

function noteTypeBadgeClass(label: string) {
  const l = String(label || '').toLowerCase();
  if (l.includes('email')) return 'bg-blue-100 text-blue-800 border-blue-200';
  if (l.includes('meeting') || l.includes('demo'))
    return 'bg-violet-100 text-violet-800 border-violet-200';
  if (l.includes('proposal') || l.includes('contract'))
    return 'bg-amber-100 text-amber-900 border-amber-200';
  if (l.includes('conversation') || l.includes('call') || l.includes('qualification'))
    return 'bg-emerald-100 text-emerald-800 border-emerald-200';
  if (l.includes('voicemail') || l.includes('no answer') || l.includes('text'))
    return 'bg-slate-100 text-slate-700 border-slate-200';
  if (l.includes('linkedin')) return 'bg-sky-100 text-sky-800 border-sky-200';
  return 'bg-indigo-50 text-indigo-800 border-indigo-100';
}

function Field({
  label,
  value,
  href,
}: {
  label: string;
  value?: string;
  href?: string;
}) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-0.5">
        {label}
      </div>
      {href && value && value !== '—' ? (
        <a
          href={href}
          target={href.startsWith('http') ? '_blank' : undefined}
          rel="noreferrer"
          className="text-sm text-blue-600 hover:underline break-all"
        >
          {value}
        </a>
      ) : (
        <div className="text-sm text-gray-900 break-words">{value || '—'}</div>
      )}
    </div>
  );
}

interface ContactDetailClientProps {
  contact: any;
  companyJobs?: any[];
  companyName?: string;
}

export default function ContactDetailClient({
  contact: rawContact,
  companyJobs: rawJobs = [],
  companyName: propCompanyName,
}: ContactDetailClientProps) {
  const router = useRouter();
  const contact = rawContact || {};
  const companyName =
    propCompanyName || contact.companyName || contact.company?.name || 'Unknown Company';
  const companyId = contact.companyId || contact.clientId || '';
  const contactId = contact.id || '';
  const companyJobs = Array.isArray(rawJobs) ? rawJobs : [];

  const displayPhone = getDisplayPhone(contact);
  const displayPhoneType = getDisplayPhoneType(contact);

  const [activeTab, setActiveTab] = useState<
    'overview' | 'timeline' | 'jobs' | 'company'
  >('overview');
  const [activities, setActivities] = useState<any[]>([]);
  const [activitiesLoading, setActivitiesLoading] = useState(true);
  const [noteType, setNoteType] = useState('21 Note');
  const [newNote, setNewNote] = useState('');
  const [addingNote, setAddingNote] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const [form, setForm] = useState({
    name: contact.name || '',
    title: contact.title || '',
    email: contact.email || '',
    phone: displayPhone || '',
    notes: typeof contact.notes === 'string' ? contact.notes : '',
    isPrimary: !!contact.isPrimary,
  });
  const [showEditModal, setShowEditModal] = useState(false);
  const [saving, setSaving] = useState(false);

  const removeContact = useRemoveContact();
  const updateContact = useUpdateContact();

  const fetchActivities = useCallback(async () => {
    if (!contactId) {
      setActivitiesLoading(false);
      return;
    }
    setActivitiesLoading(true);
    try {
      const res = await fetch(
        `/api/data/contacts/${contactId}/notes?t=${Date.now()}`
      );
      if (res.ok) {
        const data = await res.json();
        setActivities(
          Array.isArray(data.events)
            ? data.events
            : data.activities || []
        );
      } else {
        const events = await getContactActivities(contactId);
        setActivities(Array.isArray(events) ? events : []);
      }
    } catch {
      try {
        const events = await getContactActivities(contactId);
        setActivities(Array.isArray(events) ? events : []);
      } catch {
        setActivities([]);
      }
    } finally {
      setActivitiesLoading(false);
    }
  }, [contactId]);

  useEffect(() => {
    fetchActivities();
  }, [fetchActivities]);

  // Sync form when contact prop changes
  useEffect(() => {
    setForm({
      name: contact.name || '',
      title: contact.title || '',
      email: contact.email || '',
      phone: getDisplayPhone(contact) || '',
      notes: typeof contact.notes === 'string' ? contact.notes : '',
      isPrimary: !!contact.isPrimary,
    });
  }, [contact]);

  const getActivityType = (act: any) =>
    act.type || act.metadata?.noteType || act.metadata?.noteTypeLabel || 'Note';

  const getActivityBody = (act: any) =>
    act.content ||
    act.description ||
    act.metadata?.noteText ||
    act.title ||
    '—';

  const handleLogNote = async () => {
    if (!newNote.trim() || !contactId) return;
    setAddingNote(true);
    try {
      const res = await fetch(`/api/data/contacts/${contactId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: noteType,
          content: newNote.trim(),
          companyId: companyId || undefined,
        }),
      });
      if (!res.ok) {
        await logContactActivity({
          contactId,
          companyId: companyId || undefined,
          type: noteType,
          content: newNote.trim(),
        });
      }
      toast.success('Note logged');
      setNewNote('');
      await fetchActivities();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to log note');
    } finally {
      setAddingNote(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyId || !contactId) {
      toast.error('Missing company or contact ID');
      return;
    }
    if (!form.name.trim()) {
      toast.error('Name is required');
      return;
    }
    setSaving(true);
    try {
      await updateContact.mutateAsync({
        clientId: companyId,
        contactId,
        contactData: {
          name: form.name.trim(),
          title: form.title || '',
          email: form.email || '',
          phone: form.phone || '',
          notes: form.notes || '',
          isPrimary: !!form.isPrimary,
        },
      });
      setShowEditModal(false);
      toast.success('Contact updated');
      // Soft-update local display
      contact.name = form.name.trim();
      contact.title = form.title;
      contact.email = form.email;
      contact.notes = form.notes;
      contact.isPrimary = form.isPrimary;
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!companyId || !contactId) return;
    try {
      await removeContact.mutateAsync({
        clientId: companyId,
        contactId,
      });
      toast.success('Contact deleted');
      router.push('/dashboard/contact-info');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to delete');
    } finally {
      setShowDeleteConfirm(false);
    }
  };

  const companyHref = companyId
    ? `/dashboard/companies/${companyId}`
    : null;

  const tabs = [
    { id: 'overview' as const, label: 'Overview' },
    { id: 'timeline' as const, label: 'Timeline' },
    { id: 'jobs' as const, label: 'Open Jobs' },
    { id: 'company' as const, label: 'Company' },
  ];

  const phone = form.phone || displayPhone;
  const email = form.email || contact.email || '';

  return (
    <div className="max-w-[1400px] mx-auto space-y-5 pb-10">
      {/* ── Header ───────────────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
          <div className="flex items-start gap-4 min-w-0">
            <div className="h-16 w-16 shrink-0 rounded-full bg-emerald-600 text-white flex items-center justify-center text-xl font-semibold shadow-sm">
              {getInitials(form.name || contact.name)}
            </div>
            <div className="min-w-0 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-semibold tracking-tight text-gray-900 truncate">
                  {form.name || contact.name || 'Unknown'}
                </h1>
                {(form.isPrimary || contact.isPrimary) && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                    <Star className="h-3 w-3" /> Primary
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600">
                <span className="font-medium text-gray-800">
                  {form.title || contact.title || 'No title'}
                </span>
                {companyName && (
                  companyHref ? (
                    <Link
                      href={companyHref}
                      className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-blue-700 hover:underline"
                    >
                      {companyName}
                    </Link>
                  ) : (
                    <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-700">
                      {companyName}
                    </span>
                  )
                )}
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-600">
                {email && (
                  <a
                    href={`mailto:${email}`}
                    className="inline-flex items-center gap-1.5 text-blue-600 hover:underline"
                  >
                    <Mail className="h-3.5 w-3.5" />
                    {email}
                  </a>
                )}
                {phone && (
                  <a
                    href={`tel:${phone}`}
                    className="inline-flex items-center gap-1.5"
                  >
                    <Phone className="h-3.5 w-3.5 text-gray-400" />
                    {phone}
                    {displayPhoneType ? (
                      <span className="text-xs text-gray-400 capitalize">
                        ({displayPhoneType})
                      </span>
                    ) : null}
                  </a>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (!phone) {
                  toast.error('No phone on file');
                  return;
                }
                window.location.href = `tel:${phone}`;
              }}
              disabled={!phone}
            >
              <Phone className="h-3.5 w-3.5 mr-1.5" />
              Call
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowEditModal(true)}
            >
              <Pencil className="h-3.5 w-3.5 mr-1.5" />
              Edit
            </Button>
            <Button
              size="sm"
              className="bg-blue-600 hover:bg-blue-700"
              onClick={() => setEmailOpen(true)}
              disabled={!email}
            >
              <Mail className="h-3.5 w-3.5 mr-1.5" />
              Send Email
            </Button>
            {showDeleteConfirm ? (
              <>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleDelete}
                  disabled={removeContact.isPending}
                >
                  {removeContact.isPending ? 'Deleting…' : 'Confirm'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowDeleteConfirm(false)}
                >
                  Cancel
                </Button>
              </>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="text-red-600"
                onClick={() => setShowDeleteConfirm(true)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="mt-5 border-b border-gray-100">
          <nav className="flex gap-1 overflow-x-auto">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveTab(t.id)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                  activeTab === t.id
                    ? 'border-blue-600 text-blue-700'
                    : 'border-transparent text-gray-500 hover:text-gray-800'
                }`}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* ── Overview ─────────────────────────────────────────────── */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
          <div className="xl:col-span-7 space-y-5">
            {/* Contact information */}
            <section className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
                  Contact Information
                </h2>
                <span className="text-xs text-gray-400">
                  {contact.createdAt
                    ? `Added ${formatShortDate(contact.createdAt)}`
                    : null}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4 text-sm">
                <Field label="Full Name" value={form.name || contact.name} />
                <Field
                  label="Email"
                  value={email || '—'}
                  href={email ? `mailto:${email}` : undefined}
                />
                <Field label="Phone" value={phone || '—'} />
                <Field label="Phone Type" value={displayPhoneType || '—'} />
                <Field label="Title" value={form.title || contact.title || '—'} />
                <Field
                  label="Company"
                  value={companyName}
                  href={companyHref || undefined}
                />
                <Field
                  label="Primary"
                  value={form.isPrimary || contact.isPrimary ? 'Yes' : 'No'}
                />
                <Field label="Contact ID" value={contactId || '—'} />
              </div>
              {(form.notes || (typeof contact.notes === 'string' && contact.notes)) && (
                <div className="mt-5 pt-4 border-t border-gray-100">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1">
                    Static notes
                  </div>
                  <p className="text-sm text-gray-800 whitespace-pre-wrap">
                    {form.notes || contact.notes}
                  </p>
                </div>
              )}
            </section>

            {/* Notes & activity */}
            <section className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 mb-4">
                Notes & Activity Log
              </h2>
              <div className="flex flex-col sm:flex-row gap-2 mb-5">
                <select
                  value={noteType}
                  onChange={(e) => setNoteType(e.target.value)}
                  className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm shadow-sm sm:w-56"
                >
                  {NOTE_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <Input
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder="Add note detail here..."
                  className="flex-1 bg-white"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleLogNote();
                    }
                  }}
                />
                <Button
                  onClick={handleLogNote}
                  disabled={!newNote.trim() || addingNote}
                  className="bg-blue-600 hover:bg-blue-700 shrink-0"
                >
                  {addingNote ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    'Log'
                  )}
                </Button>
              </div>

              {activitiesLoading ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                </div>
              ) : activities.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-8">
                  No activity yet. Log the first note above.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-gray-100">
                  <table className="w-full text-sm min-w-[520px]">
                    <thead>
                      <tr className="bg-gray-50/80 border-b border-gray-100 text-left">
                        <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 w-36">
                          Date
                        </th>
                        <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 w-44">
                          Action Type
                        </th>
                        <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                          Note
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {activities.map((act: any, index: number) => {
                        const label = getActivityType(act);
                        return (
                          <tr
                            key={act.id || act.SK || index}
                            className="hover:bg-gray-50/60"
                          >
                            <td className="px-3 py-3 text-xs text-gray-500 whitespace-nowrap align-top">
                              {formatDateTime(
                                act.createdAt || act.timestamp || act.created_at
                              )}
                            </td>
                            <td className="px-3 py-3 align-top">
                              <span
                                className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${noteTypeBadgeClass(label)}`}
                              >
                                {label}
                              </span>
                            </td>
                            <td className="px-3 py-3 text-sm text-gray-800 align-top">
                              {getActivityBody(act)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>

          {/* Right column */}
          <div className="xl:col-span-5 space-y-5">
            <section className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 mb-4">
                Quick Stats
              </h2>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between gap-3">
                  <span className="text-gray-500">Company</span>
                  {companyHref ? (
                    <Link
                      href={companyHref}
                      className="font-medium text-blue-600 hover:underline text-right"
                    >
                      {companyName}
                    </Link>
                  ) : (
                    <span className="font-medium text-right">{companyName}</span>
                  )}
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Activities</span>
                  <span className="font-medium tabular-nums">
                    {activities.length}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Open jobs at company</span>
                  <span className="font-medium tabular-nums">
                    {companyJobs.length}
                  </span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-gray-500">Contact ID</span>
                  <span className="font-mono text-xs text-gray-600 truncate max-w-[180px]">
                    {contactId}
                  </span>
                </div>
              </div>
            </section>

            {companyJobs.length > 0 && (
              <section className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
                    Open Jobs at {companyName}
                  </h2>
                  <Link
                    href={companyHref || '/dashboard/jobs'}
                    className="text-xs font-medium text-blue-600 hover:underline"
                  >
                    View all
                  </Link>
                </div>
                <div className="space-y-2">
                  {companyJobs.slice(0, 5).map((job: any) => (
                    <Link
                      key={job.id}
                      href={`/dashboard/jobs/${job.id}`}
                      className="flex items-center justify-between gap-2 rounded-xl border border-gray-100 px-3 py-2.5 hover:bg-gray-50"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-gray-900 truncate">
                          {job.title || 'Untitled job'}
                        </div>
                        <div className="text-xs text-gray-500">
                          {job.status || 'Open'}
                          {job.location ? ` · ${job.location}` : ''}
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />
                    </Link>
                  ))}
                </div>
              </section>
            )}

            <section className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 mb-3">
                Quick links
              </h2>
              <div className="space-y-2">
                {companyHref && (
                  <Link
                    href={companyHref}
                    className="flex items-center gap-3 rounded-xl border border-gray-100 px-3 py-2.5 hover:bg-gray-50 text-sm font-medium text-gray-800"
                  >
                    <Building2 className="h-4 w-4 text-blue-600" />
                    Open company page
                  </Link>
                )}
                <Link
                  href="/dashboard/contact-info"
                  className="flex items-center gap-3 rounded-xl border border-gray-100 px-3 py-2.5 hover:bg-gray-50 text-sm font-medium text-gray-800"
                >
                  <Users className="h-4 w-4 text-emerald-600" />
                  All contacts
                </Link>
                <Link
                  href="/dashboard/jobs"
                  className="flex items-center gap-3 rounded-xl border border-gray-100 px-3 py-2.5 hover:bg-gray-50 text-sm font-medium text-gray-800"
                >
                  <Briefcase className="h-4 w-4 text-violet-600" />
                  Browse jobs
                </Link>
              </div>
            </section>
          </div>
        </div>
      )}

      {/* ── Timeline ─────────────────────────────────────────────── */}
      {activeTab === 'timeline' && (
        <section className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5">
          <h2 className="text-base font-semibold text-gray-900 mb-4">
            Full Timeline
          </h2>
          <div className="flex flex-col sm:flex-row gap-2 mb-5">
            <select
              value={noteType}
              onChange={(e) => setNoteType(e.target.value)}
              className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm shadow-sm sm:w-56"
            >
              {NOTE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <Input
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              placeholder="Add note detail here..."
              className="flex-1 bg-white"
            />
            <Button
              onClick={handleLogNote}
              disabled={!newNote.trim() || addingNote}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {addingNote ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Log'}
            </Button>
          </div>
          {activitiesLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : activities.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-10">
              No timeline events yet.
            </p>
          ) : (
            <div className="space-y-3">
              {activities.map((act: any, index: number) => {
                const label = getActivityType(act);
                return (
                  <div
                    key={act.id || act.SK || index}
                    className="flex gap-4 rounded-xl border border-gray-100 p-4"
                  >
                    <div className="w-36 shrink-0 text-xs text-gray-500">
                      {formatDateTime(
                        act.createdAt || act.timestamp || act.created_at
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium mb-2 ${noteTypeBadgeClass(label)}`}
                      >
                        {label}
                      </span>
                      <p className="text-sm text-gray-800 whitespace-pre-wrap">
                        {getActivityBody(act)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* ── Jobs ─────────────────────────────────────────────────── */}
      {activeTab === 'jobs' && (
        <section className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-gray-900">
              Open Jobs at {companyName}
            </h2>
            <Button
              size="sm"
              variant="outline"
              onClick={() => router.push('/dashboard/jobs')}
            >
              <Briefcase className="h-4 w-4 mr-1.5" /> Browse jobs
            </Button>
          </div>
          {companyJobs.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-12">
              No open jobs for this company.
            </p>
          ) : (
            <div className="space-y-2">
              {companyJobs.map((job: any) => (
                <Link
                  key={job.id}
                  href={`/dashboard/jobs/${job.id}`}
                  className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 px-4 py-3 hover:bg-gray-50"
                >
                  <div>
                    <div className="font-medium text-gray-900">
                      {job.title || 'Untitled job'}
                    </div>
                    <div className="text-xs text-gray-500">
                      {job.status || 'Open'}
                      {job.location ? ` · ${job.location}` : ''}
                      {job.employmentType ? ` · ${job.employmentType}` : ''}
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-gray-400" />
                </Link>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ── Company ──────────────────────────────────────────────── */}
      {activeTab === 'company' && (
        <section className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5">
          <h2 className="text-base font-semibold text-gray-900 mb-3">Company</h2>
          {companyHref ? (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                This contact is linked to{' '}
                <span className="font-medium text-gray-900">{companyName}</span>.
              </p>
              <Link
                href={companyHref}
                className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-800 hover:bg-blue-100"
              >
                <Building2 className="h-4 w-4" />
                Open company detail page
                <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
          ) : (
            <p className="text-sm text-gray-500">No company linked.</p>
          )}
        </section>
      )}

      {/* Edit modal */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full max-h-[90vh] overflow-auto shadow-xl">
            <div className="p-6">
              <h2 className="text-xl font-semibold mb-1">Edit Contact</h2>
              <p className="text-sm text-muted-foreground mb-4">
                Update this contact&apos;s details.
              </p>
              <form onSubmit={handleSave} className="space-y-3">
                {(
                  [
                    ['name', 'Full Name'],
                    ['title', 'Title'],
                    ['email', 'Email'],
                    ['phone', 'Phone'],
                  ] as const
                ).map(([key, label]) => (
                  <div key={key}>
                    <label className="text-sm font-medium block mb-1">
                      {label}
                    </label>
                    <Input
                      value={(form as any)[key] || ''}
                      onChange={(e) =>
                        setForm({ ...form, [key]: e.target.value })
                      }
                    />
                  </div>
                ))}
                <div>
                  <label className="text-sm font-medium block mb-1">Notes</label>
                  <textarea
                    value={form.notes || ''}
                    onChange={(e) =>
                      setForm({ ...form, notes: e.target.value })
                    }
                    className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={!!form.isPrimary}
                    onChange={(e) =>
                      setForm({ ...form, isPrimary: e.target.checked })
                    }
                  />
                  Primary contact
                </label>
                <div className="flex gap-3 pt-3">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={() => setShowEditModal(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={saving}
                    className="flex-1 bg-blue-600 hover:bg-blue-700"
                  >
                    {saving ? 'Saving…' : 'Save Changes'}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      <SendEmailModal
        open={emailOpen}
        onOpenChange={setEmailOpen}
        candidate={
          email ? { email, name: form.name || contact.name } : null
        }
        onSend={async (subject, body) => {
          const res = await fetch('/api/email/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              to: email,
              subject,
              text: body,
              html: body.replace(/\n/g, '<br/>'),
            }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok || data.success === false) {
            throw new Error(data.error || 'Failed to send email');
          }
          await fetch(`/api/data/contacts/${contactId}/notes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: '02 Email Sent',
              content: `Email sent: ${subject}`,
              companyId: companyId || undefined,
            }),
          }).catch(() => {});
          await fetchActivities();
        }}
      />
    </div>
  );
}
