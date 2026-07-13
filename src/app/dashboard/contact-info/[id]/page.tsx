'use client';

import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useClients } from '@/lib/hooks/query-client';
import { useUpdateContact } from '@/lib/hooks/contact-mutations';
import { Button } from '@/components/ui/button';
import { getDisplayPhone, getDisplayPhoneType } from '@/lib/contacts/phone';
import {
  logContactActivity,
  getContactActivities,
} from '@/lib/actions/contact-actions';
import { toast } from 'sonner';
import { Loader2, Plus } from 'lucide-react';

/** Same activity / note types as the original contact ActivityModal */
const NOTE_TYPES = [
  // OUTREACH & COMMUNICATION
  '01 Left Voicemail',
  '02 Email Sent',
  '03 Email Received',
  '04 Text Sent',
  '05 Text Received',
  '06 LinkedIn Message Sent',
  '07 Conversation Engaged',
  '08 No Answer',
  // BUSINESS DEVELOPMENT
  '09 Initial Outreach',
  '10 Qualification Call',
  '11 Discovery Call',
  '12 Demo / Presentation',
  '13 Proposal Sent',
  '14 Proposal Review',
  '15 Contract Sent',
  '16 Contract Signed',
  // MEETINGS & FOLLOW-UP
  '17 Meeting Scheduled',
  '18 Meeting Completed',
  '19 Follow-up Needed',
  '20 Follow-up Completed',
  // OTHER
  '21 Note',
  '22 Other',
];

export default function ContactDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const id = params.id as string;
  const companyIdParam = searchParams.get('companyId') || '';

  const { data: clientsData, isLoading, refetch } = useClients();
  const updateContact = useUpdateContact();

  const [contact, setContact] = useState<any>(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<any>({});
  const [saving, setSaving] = useState(false);

  // Notes / activity log
  const [activities, setActivities] = useState<any[]>([]);
  const [activitiesLoading, setActivitiesLoading] = useState(true);
  const [noteType, setNoteType] = useState(NOTE_TYPES[20]); // "21 Note"
  const [newNote, setNewNote] = useState('');
  const [addingNote, setAddingNote] = useState(false);

  useEffect(() => {
    if (!clientsData) return;

    const companies = Array.isArray(clientsData) ? clientsData : clientsData?.clients || [];

    let foundContact: any = null;
    let foundCompany: any = null;

    // Prefer companyId from query when present
    if (companyIdParam) {
      const company = companies.find(
        (c: any) => String(c.id) === String(companyIdParam) || String(c.PK) === String(companyIdParam)
      );
      if (company) {
        const match = (company.contacts || []).find((c: any) => String(c.id) === String(id));
        if (match) {
          foundContact = match;
          foundCompany = company;
        }
      }
    }

    if (!foundContact) {
      for (const company of companies) {
        const companyContacts = Array.isArray(company.contacts) ? company.contacts : [];
        const match = companyContacts.find((c: any) => String(c.id) === String(id));
        if (match) {
          foundContact = match;
          foundCompany = company;
          break;
        }
      }
    }

    if (foundContact) {
      const contactData = {
        ...foundContact,
        companyName: foundCompany?.name || foundCompany?.companyName || '—',
        clientId: foundCompany?.id || foundCompany?.PK,
        companyId: foundCompany?.id || foundCompany?.PK,
      };
      setContact(contactData);
      setFormData({
        name: contactData.name || '',
        title: contactData.title || '',
        email: contactData.email || '',
        phone: getDisplayPhone(contactData),
        notes: contactData.notes || '',
        isPrimary: !!contactData.isPrimary,
      });
    }
  }, [id, clientsData, companyIdParam]);

  const fetchActivities = useCallback(async () => {
    if (!id) {
      setActivitiesLoading(false);
      return;
    }
    setActivitiesLoading(true);
    try {
      // Prefer API route (works even if server action export path differs)
      const res = await fetch(`/api/data/contacts/${id}/notes?t=${Date.now()}`);
      if (res.ok) {
        const data = await res.json();
        setActivities(Array.isArray(data.events) ? data.events : data.activities || []);
      } else {
        // Fallback to server action
        const events = await getContactActivities(id);
        setActivities(Array.isArray(events) ? events : []);
      }
    } catch (err) {
      console.error('Failed to load contact activities', err);
      try {
        const events = await getContactActivities(id);
        setActivities(Array.isArray(events) ? events : []);
      } catch {
        setActivities([]);
      }
    } finally {
      setActivitiesLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchActivities();
  }, [fetchActivities]);

  const displayPhone = getDisplayPhone(contact);
  const displayPhoneType = getDisplayPhoneType(contact);

  const handleLogNote = async () => {
    if (!newNote.trim() || !id) return;
    if (!noteType) {
      toast.error('Select a note type');
      return;
    }

    setAddingNote(true);
    try {
      // Try API first
      const res = await fetch(`/api/data/contacts/${id}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: noteType,
          content: newNote.trim(),
          companyId: contact?.clientId || companyIdParam || undefined,
        }),
      });

      if (!res.ok) {
        // Fallback to server action
        await logContactActivity({
          contactId: id,
          companyId: contact?.clientId || companyIdParam || undefined,
          type: noteType,
          content: newNote.trim(),
        });
      }

      toast.success('Note logged successfully');
      setNewNote('');
      setNoteType(NOTE_TYPES[20]);
      await fetchActivities();
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || 'Failed to log note');
    } finally {
      setAddingNote(false);
    }
  };

  const handleSave = async () => {
    if (!contact?.clientId || !contact?.id) {
      toast.error('Missing company or contact ID');
      return;
    }
    if (!formData.name?.trim()) {
      toast.error('Name is required');
      return;
    }

    setSaving(true);
    try {
      await updateContact.mutateAsync({
        clientId: contact.clientId,
        contactId: contact.id,
        contactData: {
          name: formData.name.trim(),
          title: formData.title || '',
          email: formData.email || '',
          phone: formData.phone || '',
          notes: formData.notes || '',
          isPrimary: !!formData.isPrimary,
        },
      });
      setIsEditing(false);
      await refetch();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save contact');
    } finally {
      setSaving(false);
    }
  };

  const handleCall = () => {
    if (!displayPhone) {
      toast.error('No phone number on file');
      return;
    }
    window.location.href = `tel:${displayPhone}`;
  };

  const handleEmail = () => {
    if (!contact?.email) {
      toast.error('No email on file');
      return;
    }
    window.location.href = `mailto:${contact.email}`;
  };

  const renderActivityList = () => {
    if (activitiesLoading) {
      return (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      );
    }

    if (!activities.length) {
      return (
        <p className="text-muted-foreground text-center py-8">
          No activity yet. Log the first note above.
        </p>
      );
    }

    return (
      <div className="space-y-4">
        {activities.map((act: any, index: number) => (
          <div
            key={act.id || act.SK || index}
            className="border-l-4 border-blue-200 pl-4 py-2"
          >
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground mb-1">
              <span className="inline-flex items-center rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium">
                {act.type || act.metadata?.noteType || 'Note'}
              </span>
              <span>
                {act.createdAt
                  ? new Date(act.createdAt).toLocaleString()
                  : act.timestamp
                    ? new Date(act.timestamp).toLocaleString()
                    : 'Recent'}
              </span>
              {act.createdBy && act.createdBy !== 'current-user' && act.createdBy !== 'system' && (
                <span>· {act.createdBy}</span>
              )}
            </div>
            <p className="text-sm whitespace-pre-wrap">
              {act.content || act.description || act.metadata?.noteText || act.title || '—'}
            </p>
          </div>
        ))}
      </div>
    );
  };

  const renderNoteComposer = () => (
    <div className="flex flex-col sm:flex-row gap-3 mb-6">
      <select
        value={noteType}
        onChange={(e) => setNoteType(e.target.value)}
        className="w-full sm:w-64 h-10 rounded-md border border-input bg-background px-3 text-sm"
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
        placeholder="Add note detail here..."
        className="flex-1 min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm"
      />
      <Button
        onClick={handleLogNote}
        disabled={!newNote.trim() || addingNote}
        className="sm:self-start"
      >
        {addingNote ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Plus className="mr-2 h-4 w-4" />
        )}
        Log
      </Button>
    </div>
  );

  if (isLoading) {
    return <div className="p-8 max-w-7xl mx-auto">Loading contact...</div>;
  }

  if (!contact) {
    return (
      <div className="p-8 max-w-7xl mx-auto">
        <Link
          href="/dashboard/contact-info"
          className="text-blue-600 hover:underline mb-8 inline-block"
        >
          ← Back to Contacts
        </Link>
        <div className="text-center py-20">
          <h2 className="text-2xl font-semibold">Contact not found...</h2>
          <p className="text-muted-foreground mt-2">
            The contact ID may be invalid or deleted.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <Link
        href="/dashboard/contact-info"
        className="text-blue-600 hover:underline mb-8 inline-block"
      >
        ← Back to Contacts
      </Link>

      {/* Header */}
      <div className="flex items-start gap-6 mb-10">
        <div className="w-24 h-24 bg-blue-600 text-white rounded-full flex items-center justify-center text-5xl font-bold">
          {contact.name?.[0] || '?'}
        </div>
        <div className="flex-1 pt-2">
          <div className="flex items-center gap-3">
            <h1 className="text-5xl font-bold">{contact.name}</h1>
            {contact.isPrimary && (
              <span className="bg-amber-100 text-amber-800 px-4 py-1 rounded-full text-sm">
                Primary
              </span>
            )}
            <span className="bg-green-100 text-green-700 px-4 py-1 rounded-full text-sm">
              Active
            </span>
          </div>
          <p className="text-2xl text-muted-foreground mt-1">
            {contact.title} • {contact.companyName}
          </p>
        </div>
        <div className="flex gap-3 pt-4">
          <Button onClick={handleCall} disabled={!displayPhone}>
            Call
          </Button>
          <Button variant="outline" onClick={() => setIsEditing(!isEditing)}>
            Edit
          </Button>
          <Button onClick={handleEmail} disabled={!contact.email}>
            Send Email
          </Button>
        </div>
      </div>

      {/* Contact Info Bar */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 bg-card border rounded-2xl p-8 mb-12">
        <div>
          <p className="text-xs text-muted-foreground">EMAIL</p>
          <p className="font-medium break-all">
            {contact.email ? (
              <a href={`mailto:${contact.email}`} className="hover:underline text-blue-600">
                {contact.email}
              </a>
            ) : (
              '—'
            )}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">PHONE</p>
          <p className="font-medium">
            {displayPhone ? (
              <>
                <a href={`tel:${displayPhone}`} className="hover:underline text-blue-600">
                  {displayPhone}
                </a>
                {displayPhoneType ? (
                  <span className="ml-2 text-xs text-muted-foreground capitalize">
                    ({displayPhoneType})
                  </span>
                ) : null}
              </>
            ) : (
              '—'
            )}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">COMPANY</p>
          {contact.clientId ? (
            <Link
              href={`/dashboard/companies/${contact.clientId}?tab=contacts`}
              className="font-medium text-blue-600 hover:underline"
            >
              {contact.companyName}
            </Link>
          ) : (
            <p className="font-medium">{contact.companyName}</p>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b mb-10">
        <div className="flex gap-10 text-lg">
          {['overview', 'timeline', 'jobs', 'company'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`pb-4 border-b-2 font-medium capitalize ${
                activeTab === tab
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            <div className="bg-card border rounded-3xl p-8">
              <h3 className="font-semibold mb-6">Contact Details</h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Name</span>
                  <span className="font-medium">{contact.name}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Title</span>
                  <span className="font-medium">{contact.title || '—'}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Preferred phone</span>
                  <span className="font-medium">{displayPhone || '—'}</span>
                </div>
                {contact.notes && (
                  <div>
                    <span className="text-muted-foreground block mb-1">Static notes</span>
                    <p className="font-medium whitespace-pre-wrap">{contact.notes}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Notes & Activity Log — note types + Log */}
            <div className="bg-card border rounded-3xl p-8">
              <h3 className="font-semibold mb-6">Notes & Activity Log</h3>
              {renderNoteComposer()}
              {renderActivityList()}
            </div>
          </div>

          <div className="bg-card border rounded-3xl p-8 h-fit">
            <h3 className="font-semibold mb-6">Quick Stats</h3>
            <div className="space-y-4 text-sm">
              <div className="flex justify-between">
                <span>Company</span>
                <span>{contact.companyName}</span>
              </div>
              <div className="flex justify-between">
                <span>Activities</span>
                <span>{activities.length}</span>
              </div>
              <div className="flex justify-between">
                <span>Contact ID</span>
                <span className="font-mono text-xs">{contact.id}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'timeline' && (
        <div className="bg-card border rounded-3xl p-8">
          <h3 className="font-semibold mb-6">Full Timeline</h3>
          {renderNoteComposer()}
          {renderActivityList()}
        </div>
      )}

      {activeTab === 'jobs' && (
        <div className="bg-card border rounded-3xl p-8 text-muted-foreground">
          Open Jobs coming soon...
        </div>
      )}

      {activeTab === 'company' && (
        <div className="bg-card border rounded-3xl p-8">
          {contact.clientId ? (
            <Link
              href={`/dashboard/companies/${contact.clientId}?tab=contacts`}
              className="text-blue-600 hover:underline"
            >
              Open company contacts →
            </Link>
          ) : (
            <p className="text-muted-foreground">No company linked.</p>
          )}
        </div>
      )}

      {/* Edit Modal */}
      {isEditing && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-background rounded-3xl p-8 w-full max-w-md shadow-xl">
            <h3 className="text-2xl font-semibold mb-6">Edit Contact</h3>
            <input
              type="text"
              value={formData.name || ''}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full p-3 border rounded-xl mb-4 bg-background"
              placeholder="Name"
            />
            <input
              type="text"
              value={formData.title || ''}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full p-3 border rounded-xl mb-4 bg-background"
              placeholder="Title"
            />
            <input
              type="email"
              value={formData.email || ''}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="w-full p-3 border rounded-xl mb-4 bg-background"
              placeholder="Email"
            />
            <input
              type="tel"
              value={formData.phone || ''}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              className="w-full p-3 border rounded-xl mb-4 bg-background"
              placeholder="Phone"
            />
            <textarea
              value={formData.notes || ''}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className="w-full p-3 border rounded-xl mb-4 bg-background min-h-[80px]"
              placeholder="Static notes field on contact record"
            />
            <label className="flex items-center gap-2 mb-6 text-sm">
              <input
                type="checkbox"
                checked={!!formData.isPrimary}
                onChange={(e) => setFormData({ ...formData, isPrimary: e.target.checked })}
              />
              Primary contact
            </label>
            <div className="flex gap-3">
              <Button onClick={handleSave} className="flex-1" disabled={saving}>
                {saving ? 'Saving...' : 'Save Changes'}
              </Button>
              <Button
                variant="outline"
                onClick={() => setIsEditing(false)}
                className="flex-1"
                disabled={saving}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
