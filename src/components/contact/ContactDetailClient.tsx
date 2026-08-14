'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Mail,
  Phone,
  Pencil,
  Trash2,
  Loader2,
  Building2,
  Briefcase,
  ChevronRight,
  Star,
  Users,
  Linkedin,
  ExternalLink,
  Check,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DEFAULT_PAGE_SIZE,
  PaginationBar,
  paginateItems,
} from '@/components/ui/pagination-bar';
import { toast } from 'sonner';
import { useRemoveContact } from '@/lib/hooks/query-client';
import { useUpdateContact } from '@/lib/hooks/contact-mutations';
import {
  logContactActivity,
  getContactActivities,
} from '@/lib/actions/contact-actions';
import {
  getDisplayPhone,
  getDisplayPhoneType,
  getPhoneByType,
  phonesFromWorkAndMobile,
} from '@/lib/contacts/phone';
import { SendEmailModal } from '@/components/email/send-email-modal';
import {
  CONTACT_ACTIVITY_TYPES,
  normalizeContactActivityType,
  stripActivityTypePrefix,
} from '@/lib/contacts/activity-types';
import { ExpandableNoteText } from '@/components/shared/ExpandableNoteText';
import { FormatActivityNoteButton } from '@/components/shared/FormatActivityNoteButton';
import { EntitySmsPanel } from '@/components/shared/EntitySmsPanel';
import { EntityFilesPanel } from '@/components/shared/EntityFilesPanel';
import {
  actionBarBlue,
  actionBarBtn,
} from '@/components/shared/EntityActionBar';
import { CopyTextButton } from '@/components/shared/CopyTextButton';
import { AccountRepPill } from '@/components/shared/AccountRepPill';
import {
  ACTIVITY_BADGE_BASE_CLASS,
  activityBadgeStyle,
} from '@/lib/ui/activity-badge-colors';
import { toWebsiteHref } from '@/lib/ui/website-href';
import {
  formatFollowUpDate,
  inferLastBooked,
  inferLastContacted,
  inferNextFollowUp,
  isFollowUpOverdue,
  toDateInputValue,
} from '@/lib/contacts/follow-up';

/** Contact activity types (canonical order) */
const NOTE_TYPES = [...CONTACT_ACTIVITY_TYPES];

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

// Badge colors: shared palette — see activity-badge-colors.ts


interface ContactDetailClientProps {
  contact: any;
  companyJobs?: any[];
  companyName?: string;
  companyWebsite?: string;
}

export default function ContactDetailClient({
  contact: rawContact,
  companyJobs: rawJobs = [],
  companyName: propCompanyName,
  companyWebsite: propCompanyWebsite,
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
  const initialWorkPhone =
    getPhoneByType(contact, 'work') ||
    (displayPhoneType === 'work' || displayPhoneType === 'office' || !displayPhoneType
      ? displayPhone
      : '');
  const initialMobilePhone =
    getPhoneByType(contact, 'mobile') ||
    getPhoneByType(contact, 'cell') ||
    (displayPhoneType === 'mobile' || displayPhoneType === 'cell' ? displayPhone : '');

  const [activeTab, setActiveTab] = useState<
    'overview' | 'timeline' | 'jobs' | 'company' | 'files'
  >('overview');
  const [activities, setActivities] = useState<any[]>([]);
  const [activitiesLoading, setActivitiesLoading] = useState(true);
  const [activityPage, setActivityPage] = useState(1);
  const [noteType, setNoteType] = useState('Conversation');
  const [newNote, setNewNote] = useState('');
  const [addingNote, setAddingNote] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const [form, setForm] = useState({
    name: contact.name || '',
    title: contact.title || '',
    email: contact.email || '',
    workPhone: initialWorkPhone || '',
    mobilePhone: initialMobilePhone || '',
    notes: typeof contact.notes === 'string' ? contact.notes : '',
    isPrimary: !!contact.isPrimary,
    linkedin_url:
      contact.linkedin_url || contact.linkedin || contact.linkedinUrl || '',
  });
  const [showEditModal, setShowEditModal] = useState(false);
  const [saving, setSaving] = useState(false);

  /** Inline LinkedIn paste/save in header (same pattern as candidates) */
  const [editingLinkedIn, setEditingLinkedIn] = useState(false);
  const [linkedinDraft, setLinkedinDraft] = useState('');
  const [savingLinkedIn, setSavingLinkedIn] = useState(false);
  const [followUpDraft, setFollowUpDraft] = useState(
    toDateInputValue(contact.next_follow_up || contact.nextFollowUp)
  );
  const [followUpManual, setFollowUpManual] = useState(
    contact.next_follow_up_manual === true || contact.nextFollowUpManual === true
  );
  const [savingFollowUp, setSavingFollowUp] = useState(false);

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
        setActivityPage(1);
      } else {
        const events = await getContactActivities(contactId);
        setActivities(Array.isArray(events) ? events : []);
        setActivityPage(1);
      }
    } catch {
      try {
        const events = await getContactActivities(contactId);
        setActivities(Array.isArray(events) ? events : []);
        setActivityPage(1);
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

  const sortedActivities = useMemo(() => {
    return [...activities].sort((a, b) => {
      const ta = new Date(
        a.createdAt || a.timestamp || a.created_at || 0
      ).getTime();
      const tb = new Date(
        b.createdAt || b.timestamp || b.created_at || 0
      ).getTime();
      return tb - ta;
    });
  }, [activities]);

  const pagedActivities = useMemo(
    () => paginateItems(sortedActivities, activityPage, DEFAULT_PAGE_SIZE),
    [sortedActivities, activityPage]
  );

  // Sync form when contact prop changes
  useEffect(() => {
    const work =
      getPhoneByType(contact, 'work') ||
      (() => {
        const t = getDisplayPhoneType(contact);
        const p = getDisplayPhone(contact);
        return t === 'work' || t === 'office' || !t ? p : '';
      })();
    const mobile =
      getPhoneByType(contact, 'mobile') ||
      getPhoneByType(contact, 'cell') ||
      (() => {
        const t = getDisplayPhoneType(contact);
        const p = getDisplayPhone(contact);
        return t === 'mobile' || t === 'cell' ? p : '';
      })();
    setForm({
      name: contact.name || '',
      title: contact.title || '',
      email: contact.email || '',
      workPhone: work || '',
      mobilePhone: mobile || '',
      notes: typeof contact.notes === 'string' ? contact.notes : '',
      isPrimary: !!contact.isPrimary,
      linkedin_url:
        contact.linkedin_url || contact.linkedin || contact.linkedinUrl || '',
    });
  }, [contact]);

  const normalizeLinkedInUrl = (raw: string): string => {
    const s = raw.trim();
    if (!s) return '';
    if (/^https?:\/\//i.test(s)) return s;
    if (/^(www\.)?linkedin\.com\//i.test(s)) {
      return `https://${s.replace(/^www\./i, 'www.')}`;
    }
    if (/^[\w-]+$/.test(s)) {
      return `https://www.linkedin.com/in/${s}`;
    }
    return s;
  };

  const saveLinkedInUrl = async (value: string) => {
    if (!companyId || !contactId) {
      toast.error('Missing company or contact ID');
      return;
    }
    const linkedin_url = normalizeLinkedInUrl(value);
    setSavingLinkedIn(true);
    try {
      await updateContact.mutateAsync({
        clientId: companyId,
        contactId,
        contactData: { linkedin_url },
      });
      setForm((prev) => ({ ...prev, linkedin_url }));
      contact.linkedin_url = linkedin_url;
      setEditingLinkedIn(false);
      setLinkedinDraft('');
      toast.success(linkedin_url ? 'LinkedIn saved' : 'LinkedIn cleared');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save LinkedIn');
    } finally {
      setSavingLinkedIn(false);
    }
  };

  const getActivityType = (act: any) =>
    normalizeContactActivityType(
      act.type || act.metadata?.noteType || act.metadata?.noteTypeLabel || 'Other'
    );

  const getActivityBody = (act: any) => {
    const text =
      act.metadata?.noteText ||
      act.content ||
      act.description ||
      '';
    // If content is empty or only echoes the action type, show a dash
    const t = String(text || '').trim();
    const typeLabel = normalizeContactActivityType(
      act.type || act.metadata?.noteType || ''
    );
    if (
      !t ||
      t === String(act.type || '').trim() ||
      stripActivityTypePrefix(t) === typeLabel
    ) {
      return '—';
    }
    return t;
  };

  const handleLogNote = async () => {
    if (!contactId) return;
    // Detail text optional — activity type alone is enough (e.g. No Answer)
    setAddingNote(true);
    try {
      const content = newNote.trim();
      const res = await fetch(`/api/data/contacts/${contactId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: noteType,
          content,
          companyId: companyId || undefined,
        }),
      });
      if (!res.ok) {
        await logContactActivity({
          contactId,
          companyId: companyId || undefined,
          type: noteType,
          content: content || noteType,
        });
      }
      toast.success('Activity logged');
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
      const linkedin_url = normalizeLinkedInUrl(form.linkedin_url || '');
      const phones = phonesFromWorkAndMobile({
        workPhone: form.workPhone,
        mobilePhone: form.mobilePhone,
        preferred: form.mobilePhone?.trim() && !form.workPhone?.trim() ? 'mobile' : 'work',
      });
      await updateContact.mutateAsync({
        clientId: companyId,
        contactId,
        contactData: {
          name: form.name.trim(),
          title: form.title || '',
          email: form.email || '',
          phones,
          phone: phones[0]?.number || '',
          notes: form.notes || '',
          isPrimary: !!form.isPrimary,
          linkedin_url,
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
      contact.linkedin_url = linkedin_url;
      contact.phones = phones;
      contact.phone = phones[0]?.number || '';
      contact.preferredPhone = phones.find((p) => p.isPreferred)?.number || phones[0]?.number;
      contact.preferredPhoneType =
        phones.find((p) => p.isPreferred)?.type || phones[0]?.type || 'work';
      setForm((prev) => ({ ...prev, linkedin_url }));
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
  const companyWebsiteHref = toWebsiteHref(
    propCompanyWebsite ||
      contact.companyWebsite ||
      contact.companyDomain ||
      contact.company_url ||
      contact.domain
  );

  const lastContacted = useMemo(
    () => inferLastContacted(activities),
    [activities]
  );
  const lastBooked = useMemo(() => inferLastBooked(activities), [activities]);
  const inferredFollowUp = useMemo(
    () => inferNextFollowUp(activities),
    [activities]
  );
  const nextFollowUp = followUpManual ? followUpDraft : followUpDraft || inferredFollowUp;
  const followUpOverdue = isFollowUpOverdue(nextFollowUp);

  useEffect(() => {
    if (followUpManual) return;
    setFollowUpDraft(inferredFollowUp);
  }, [inferredFollowUp, followUpManual]);

  const saveFollowUp = async (value: string, manual: boolean) => {
    if (!companyId || !contactId) {
      toast.error('Missing company or contact ID');
      return;
    }
    setSavingFollowUp(true);
    try {
      await updateContact.mutateAsync({
        clientId: companyId,
        contactId,
        contactData: {
          next_follow_up: value || '',
          next_follow_up_manual: manual,
        },
      });
      contact.next_follow_up = value || '';
      contact.next_follow_up_manual = manual;
      setFollowUpDraft(value);
      setFollowUpManual(manual);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save follow-up');
    } finally {
      setSavingFollowUp(false);
    }
  };

  const tabs = [
    { id: 'overview' as const, label: 'Overview' },
    { id: 'timeline' as const, label: 'Timeline' },
    { id: 'jobs' as const, label: 'Open Jobs' },
    { id: 'company' as const, label: 'Company' },
    { id: 'files' as const, label: 'Files' },
  ];

  const workPhone = form.workPhone || getPhoneByType(contact, 'work');
  const mobilePhone =
    form.mobilePhone ||
    getPhoneByType(contact, 'mobile') ||
    getPhoneByType(contact, 'cell');
  const phone = workPhone || mobilePhone || displayPhone;
  /** Prefer mobile/cell for SMS when available */
  const smsPhone =
    (mobilePhone || '').trim() ||
    (workPhone || '').trim() ||
    (displayPhone || '').trim() ||
    '';
  const email = form.email || contact.email || '';

  return (
    <div className="w-full min-w-0 space-y-5 pb-10">
      {/* ── Header ───────────────────────────────────────────────── */}
      <div data-ink-on-light className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5">
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
                <CopyTextButton
                  value={form.name || contact.name}
                  label="name"
                />
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
                  <span className="inline-flex items-center gap-0.5">
                    <a
                      href={`mailto:${email}`}
                      className="inline-flex items-center gap-1.5 text-blue-600 hover:underline"
                    >
                      <Mail className="h-3.5 w-3.5" />
                      {email}
                    </a>
                    <CopyTextButton value={email} label="email" />
                  </span>
                )}
                {workPhone && (
                  <span className="inline-flex items-center gap-0.5">
                    <a
                      href={`tel:${workPhone}`}
                      className="inline-flex items-center gap-1.5"
                    >
                      <Phone className="h-3.5 w-3.5 text-gray-400" />
                      {workPhone}
                      <span className="text-xs text-gray-400">Work</span>
                    </a>
                    <CopyTextButton value={workPhone} label="work phone" />
                  </span>
                )}
                {mobilePhone && (
                  <span className="inline-flex items-center gap-0.5">
                    <a
                      href={`tel:${mobilePhone}`}
                      className="inline-flex items-center gap-1.5"
                    >
                      <Phone className="h-3.5 w-3.5 text-gray-400" />
                      {mobilePhone}
                      <span className="text-xs text-gray-400">Cell</span>
                    </a>
                    <CopyTextButton value={mobilePhone} label="cell phone" />
                  </span>
                )}
                {!workPhone && !mobilePhone && phone && (
                  <span className="inline-flex items-center gap-0.5">
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
                    <CopyTextButton value={phone} label="phone" />
                  </span>
                )}
                {editingLinkedIn ? (
                  <form
                    className="inline-flex items-center gap-1.5 min-w-0 max-w-full"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void saveLinkedInUrl(linkedinDraft);
                    }}
                  >
                    <Linkedin className="h-3.5 w-3.5 text-[#0A66C2] shrink-0" />
                    <Input
                      autoFocus
                      value={linkedinDraft}
                      onChange={(e) => setLinkedinDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                          e.preventDefault();
                          setEditingLinkedIn(false);
                          setLinkedinDraft('');
                        }
                      }}
                      placeholder="Paste LinkedIn URL…"
                      disabled={savingLinkedIn}
                      className="h-7 w-[min(100%,18rem)] sm:w-72 text-xs px-2"
                    />
                    <Button
                      type="submit"
                      size="sm"
                      variant="ghost"
                      disabled={savingLinkedIn}
                      className="h-7 w-7 p-0 text-green-700 hover:bg-green-50"
                      title="Save LinkedIn"
                    >
                      {savingLinkedIn ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Check className="h-3.5 w-3.5" />
                      )}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={savingLinkedIn}
                      onClick={() => {
                        setEditingLinkedIn(false);
                        setLinkedinDraft('');
                      }}
                      className="h-7 w-7 p-0 text-gray-500"
                      title="Cancel"
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </form>
                ) : form.linkedin_url ? (
                  <span className="inline-flex items-center gap-1">
                    <a
                      href={
                        /^https?:\/\//i.test(form.linkedin_url)
                          ? form.linkedin_url
                          : `https://${form.linkedin_url}`
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-[#0A66C2] hover:underline"
                      title={form.linkedin_url}
                    >
                      <Linkedin className="h-3.5 w-3.5" />
                      LinkedIn
                      <ExternalLink className="h-3 w-3 opacity-60" />
                    </a>
                    <button
                      type="button"
                      onClick={() => {
                        setLinkedinDraft(form.linkedin_url || '');
                        setEditingLinkedIn(true);
                      }}
                      className="inline-flex h-6 w-6 items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                      title="Edit LinkedIn URL"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setLinkedinDraft('');
                      setEditingLinkedIn(true);
                    }}
                    className="inline-flex items-center gap-1.5 text-gray-400 hover:text-[#0A66C2] hover:underline"
                    title="Add LinkedIn profile URL"
                  >
                    <Linkedin className="h-3.5 w-3.5" />
                    Add LinkedIn
                  </button>
                )}
              </div>
            </div>
          </div>
          {contact?.id ? (
            <AccountRepPill
              objectType="contact"
              objectId={String(contact.id)}
              label="Account Rep"
            />
          ) : null}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-4">
          <button
            type="button"
            className={actionBarBlue}
            onClick={() => setEmailOpen(true)}
            disabled={!email}
          >
            <Mail className="h-3.5 w-3.5" />
            Email
          </button>
          <button
            type="button"
            className={actionBarBtn}
            disabled={!phone}
            onClick={() => {
              if (!phone) return;
              window.location.href = `tel:${phone}`;
            }}
          >
            <Phone className="h-3.5 w-3.5" />
            Call
          </button>
          <a
            href={smsPhone ? `sms:${smsPhone}` : undefined}
            className={`${actionBarBtn} ${!smsPhone ? 'pointer-events-none opacity-50' : ''}`}
          >
            Text
          </a>
          {form.linkedin_url ? (
            <a
              href={
                /^https?:\/\//i.test(form.linkedin_url)
                  ? form.linkedin_url
                  : `https://${form.linkedin_url}`
              }
              target="_blank"
              rel="noopener noreferrer"
              className={actionBarBtn}
            >
              <Linkedin className="h-3.5 w-3.5" />
              LinkedIn
            </a>
          ) : (
            <button
              type="button"
              className={actionBarBtn}
              onClick={() => {
                setLinkedinDraft('');
                setEditingLinkedIn(true);
              }}
            >
              <Linkedin className="h-3.5 w-3.5" />
              Add LinkedIn
            </button>
          )}
          <button
            type="button"
            className={actionBarBtn}
            onClick={() => {
              setActiveTab('overview');
              window.setTimeout(() => {
                document
                  .querySelector<HTMLTextAreaElement>(
                    'textarea[placeholder="Optional note detail..."]'
                  )
                  ?.focus();
              }, 50);
            }}
          >
            Add Note
          </button>
          <button
            type="button"
            className={actionBarBtn}
            onClick={() => setShowEditModal(true)}
          >
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </button>
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
            <button
              type="button"
              className={`${actionBarBtn} text-red-600`}
              onClick={() => setShowDeleteConfirm(true)}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="mt-4 border-b border-gray-100">
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
        <div className="grid grid-cols-1 items-stretch gap-5 xl:grid-cols-12">
          <div className="flex h-full min-h-0 flex-col xl:col-span-7">
            {/* Notes & activity — primary content (header already shows contact identity) */}
            <section
              data-ink-on-light
              className="flex h-full min-h-[280px] flex-col bg-white border border-gray-200 rounded-2xl shadow-sm p-5"
            >
              <div className="flex items-center justify-between gap-3 mb-4">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
                  Notes & Activity Log
                </h2>
                {contact.createdAt && (
                  <span className="text-xs text-gray-400 shrink-0">
                    Added {formatShortDate(contact.createdAt)}
                  </span>
                )}
              </div>
              {(form.notes ||
                (typeof contact.notes === 'string' && contact.notes.trim())) && (
                <div className="mb-4 rounded-xl border border-amber-100 bg-amber-50/70 px-3 py-2.5">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-amber-800/70 mb-0.5">
                    Profile notes
                  </div>
                  <p className="text-sm text-amber-950 whitespace-pre-wrap">
                    {form.notes || contact.notes}
                  </p>
                </div>
              )}
              <div className="mb-5 grid grid-cols-1 items-stretch gap-2 sm:grid-cols-[14rem_minmax(0,1fr)_auto]">
                <select
                  value={noteType}
                  onChange={(e) => setNoteType(e.target.value)}
                  className="h-[76px] w-full rounded-lg border border-gray-200 bg-white px-3 text-sm shadow-sm"
                >
                  {NOTE_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <textarea
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder="Optional note detail..."
                  rows={3}
                  className="h-[76px] min-h-[76px] w-full min-w-0 resize-y rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      handleLogNote();
                    }
                  }}
                />
                <div className="flex items-stretch gap-2 sm:flex-col">
                  <FormatActivityNoteButton
                    value={newNote}
                    onChange={setNewNote}
                    disabled={addingNote}
                  />
                  <Button
                    onClick={handleLogNote}
                    disabled={addingNote}
                    className="h-10 bg-blue-600 hover:bg-blue-700 shrink-0 sm:mt-auto"
                  >
                    {addingNote ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      'Log'
                    )}
                  </Button>
                </div>
              </div>

              {activitiesLoading ? (
                <div className="flex flex-1 items-center justify-center py-10">
                  <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                </div>
              ) : sortedActivities.length === 0 ? (
                <p className="flex flex-1 items-center justify-center text-sm text-gray-500 text-center py-8">
                  No activity yet. Log the first note above.
                </p>
              ) : (
                <div className="min-h-0 flex-1 space-y-3">
                  <PaginationBar
                    page={pagedActivities.page}
                    totalPages={pagedActivities.totalPages}
                    total={pagedActivities.total}
                    onPageChange={setActivityPage}
                    itemLabel={
                      pagedActivities.total === 1 ? 'activity' : 'activities'
                    }
                  />
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
                      {pagedActivities.slice.map((act: any, index: number) => {
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
                                className={ACTIVITY_BADGE_BASE_CLASS}
                                style={activityBadgeStyle(label)}
                              >
                                {label}
                              </span>
                            </td>
                            <td className="px-3 py-3 align-top">
                              <ExpandableNoteText text={getActivityBody(act)} />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                </div>
              )}
            </section>
          </div>

          {/* Right column — same top/bottom as notes card */}
          <div className="flex h-full min-h-0 flex-col gap-5 xl:col-span-5">
            {contactId && companyId ? (
              <EntitySmsPanel
                entity="contact"
                entityId={contactId}
                companyId={companyId}
                phone={smsPhone}
                entityName={form.name || contact.name}
              />
            ) : null}
            <section data-ink-on-light className="flex-1 bg-white border border-gray-200 rounded-2xl shadow-sm p-5">
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
                <div className="flex justify-between">
                  <span className="text-gray-500">Primary contact</span>
                  <span className="font-medium">
                    {form.isPrimary || contact.isPrimary ? 'Yes' : 'No'}
                  </span>
                </div>
                {contact.createdAt && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Added</span>
                    <span className="font-medium">
                      {formatShortDate(contact.createdAt)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between gap-3">
                  <span className="text-gray-500">Last contacted</span>
                  <span className="font-medium">
                    {formatFollowUpDate(lastContacted)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-gray-500 shrink-0">Next follow-up</span>
                  <div className="flex min-w-0 items-center justify-end gap-2">
                    <input
                      type="date"
                      value={nextFollowUp}
                      disabled={savingFollowUp}
                      onChange={(e) => {
                        const value = e.target.value;
                        void saveFollowUp(value, !!value);
                      }}
                      className="h-8 max-w-[10.5rem] rounded-md border border-gray-200 bg-white px-2 text-xs font-medium text-gray-900"
                      title={
                        followUpManual
                          ? 'Manual date — clear to use notes again'
                          : 'Filled from notes (last activity + 7 days, or a date in the note). Edit to override.'
                      }
                    />
                    {followUpOverdue ? (
                      <span className="text-[11px] font-semibold text-rose-600">
                        Overdue
                      </span>
                    ) : null}
                    {followUpManual ? (
                      <button
                        type="button"
                        className="text-[11px] font-medium text-blue-600 hover:underline"
                        disabled={savingFollowUp}
                        onClick={() => void saveFollowUp('', false)}
                      >
                        Auto
                      </button>
                    ) : null}
                  </div>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-gray-500">Last booked</span>
                  <span className="font-medium">
                    {formatFollowUpDate(lastBooked)}
                  </span>
                </div>
              </div>
            </section>

            {companyJobs.length > 0 && (
              <section data-ink-on-light className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5">
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

            <section data-ink-on-light className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 mb-3">
                Quick links
              </h2>
              <div className="space-y-2">
                {companyWebsiteHref ? (
                  <a
                    href={companyWebsiteHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 rounded-xl border border-gray-100 px-3 py-2.5 hover:bg-gray-50 text-sm font-medium text-gray-800"
                  >
                    <ExternalLink className="h-4 w-4 text-blue-600" />
                    Open company page
                  </a>
                ) : companyHref ? (
                  <Link
                    href={companyHref}
                    className="flex items-center gap-3 rounded-xl border border-gray-100 px-3 py-2.5 hover:bg-gray-50 text-sm font-medium text-gray-800"
                  >
                    <Building2 className="h-4 w-4 text-blue-600" />
                    Open company record
                  </Link>
                ) : null}
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
        <section data-ink-on-light className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5">
          <h2 className="text-base font-semibold text-gray-900 mb-4">
            Full Timeline
          </h2>
          <div className="mb-5 grid grid-cols-1 items-stretch gap-2 sm:grid-cols-[14rem_minmax(0,1fr)_auto]">
            <select
              value={noteType}
              onChange={(e) => setNoteType(e.target.value)}
              className="h-[76px] w-full rounded-lg border border-gray-200 bg-white px-3 text-sm shadow-sm"
            >
              {NOTE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <textarea
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              placeholder="Optional note detail..."
              rows={3}
              className="h-[76px] min-h-[76px] w-full min-w-0 resize-y rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  handleLogNote();
                }
              }}
            />
            <div className="flex items-stretch gap-2 sm:flex-col">
              <FormatActivityNoteButton
                value={newNote}
                onChange={setNewNote}
                disabled={addingNote}
              />
              <Button
                onClick={handleLogNote}
                disabled={addingNote}
                className="h-10 bg-blue-600 hover:bg-blue-700 shrink-0 sm:mt-auto"
              >
                {addingNote ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Log'}
              </Button>
            </div>
          </div>
          {activitiesLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : sortedActivities.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-10">
              No timeline events yet.
            </p>
          ) : (
            <div className="space-y-3">
              <PaginationBar
                page={pagedActivities.page}
                totalPages={pagedActivities.totalPages}
                total={pagedActivities.total}
                onPageChange={setActivityPage}
                itemLabel={
                  pagedActivities.total === 1 ? 'activity' : 'activities'
                }
              />
              {pagedActivities.slice.map((act: any, index: number) => {
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
                        className={`${ACTIVITY_BADGE_BASE_CLASS} mb-2`}
                        style={activityBadgeStyle(label)}
                      >
                        {label}
                      </span>
                      <ExpandableNoteText text={getActivityBody(act)} />
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
        <section data-ink-on-light className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5">
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
        <section data-ink-on-light className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5">
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

      {activeTab === 'files' && contactId ? (
        <EntityFilesPanel
          entityType="contact"
          entityId={contactId}
          companyId={companyId || undefined}
        />
      ) : null}

      {/* Edit modal — always light surface (readable in dark theme) */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div
            role="dialog"
            aria-modal="true"
            data-ink-on-light
            className="bg-white rounded-2xl max-w-md w-full max-h-[90vh] overflow-auto shadow-xl text-slate-900"
          >
            <div className="p-6">
              <h2 className="text-xl font-semibold mb-1 text-slate-900">
                Edit Contact
              </h2>
              <p className="text-sm text-slate-600 mb-4">
                Update this contact&apos;s details.
              </p>
              <form onSubmit={handleSave} className="space-y-3">
                {(
                  [
                    ['name', 'Full Name'],
                    ['title', 'Title'],
                    ['email', 'Email'],
                    ['linkedin_url', 'LinkedIn URL'],
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
                      placeholder={
                        key === 'linkedin_url'
                          ? 'https://linkedin.com/in/...'
                          : undefined
                      }
                    />
                  </div>
                ))}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-medium block mb-1">
                      Work Phone
                    </label>
                    <Input
                      type="tel"
                      value={form.workPhone || ''}
                      onChange={(e) =>
                        setForm({ ...form, workPhone: e.target.value })
                      }
                      placeholder="Direct / office line"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium block mb-1">
                      Cell / Mobile
                    </label>
                    <Input
                      type="tel"
                      value={form.mobilePhone || ''}
                      onChange={(e) =>
                        setForm({ ...form, mobilePhone: e.target.value })
                      }
                      placeholder="Personal cell"
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground -mt-1">
                  Many hiring managers use cell instead of their direct work
                  line — store both when available.
                </p>
                <div>
                  <label className="text-sm font-medium block mb-1 text-slate-800">
                    Notes
                  </label>
                  <textarea
                    value={form.notes || ''}
                    onChange={(e) =>
                      setForm({ ...form, notes: e.target.value })
                    }
                    className="w-full min-h-[80px] rounded-md border border-slate-300 bg-white text-slate-900 px-3 py-2 text-sm placeholder:text-slate-500"
                  />
                </div>
                <label className="flex items-center gap-2 text-sm text-slate-800">
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
                    className="flex-1 border-slate-300 bg-white text-slate-900 hover:bg-slate-50 hover:text-slate-900"
                    onClick={() => setShowEditModal(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={saving}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
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
              type: 'EM Sent',
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
