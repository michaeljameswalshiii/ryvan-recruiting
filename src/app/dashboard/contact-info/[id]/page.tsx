'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useClients } from '@/lib/hooks/query-client';
import { useUpdateContact } from '@/lib/hooks/contact-mutations';
import { Button } from '@/components/ui/button';
import { getDisplayPhone, getDisplayPhoneType } from '@/lib/contacts/phone';
import { toast } from 'sonner';

export default function ContactDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const { data: clientsData, isLoading, refetch } = useClients();
  const updateContact = useUpdateContact();

  const [contact, setContact] = useState<any>(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<any>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!clientsData) return;

    const companies = Array.isArray(clientsData) ? clientsData : clientsData?.clients || [];

    let foundContact: any = null;
    let foundCompany: any = null;

    for (const company of companies) {
      const companyContacts = Array.isArray(company.contacts) ? company.contacts : [];
      const match = companyContacts.find((c: any) => String(c.id) === String(id));
      if (match) {
        foundContact = match;
        foundCompany = company;
        break;
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
  }, [id, clientsData]);

  const displayPhone = getDisplayPhone(contact);
  const displayPhoneType = getDisplayPhoneType(contact);

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

      {/* Contact Info Bar — multi-phone structure */}
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
          {Array.isArray(contact.phones) && contact.phones.length > 1 && (
            <ul className="mt-2 text-sm text-muted-foreground space-y-1">
              {contact.phones
                .filter((p: any) => p?.number)
                .map((p: any) => (
                  <li key={p.id || p.number}>
                    <a href={`tel:${p.number}`} className="hover:underline">
                      {p.number}
                    </a>
                    {p.type ? ` · ${p.type}` : ''}
                    {p.isPreferred ? ' · preferred' : ''}
                  </li>
                ))}
            </ul>
          )}
        </div>
        <div>
          <p className="text-xs text-muted-foreground">COMPANY</p>
          {contact.clientId ? (
            <Link
              href={`/dashboard/companies/${contact.clientId}`}
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
          <div className="lg:col-span-2 bg-card border rounded-3xl p-8">
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
                  <span className="text-muted-foreground block mb-1">Notes</span>
                  <p className="font-medium whitespace-pre-wrap">{contact.notes}</p>
                </div>
              )}
            </div>
          </div>
          <div className="bg-card border rounded-3xl p-8">
            <h3 className="font-semibold mb-6">Quick Stats</h3>
            <div className="space-y-4 text-sm">
              <div className="flex justify-between">
                <span>Company</span>
                <span>{contact.companyName}</span>
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
        <div className="bg-card border rounded-3xl p-8 text-muted-foreground">
          Timeline coming soon...
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
              href={`/dashboard/companies/${contact.clientId}`}
              className="text-blue-600 hover:underline"
            >
              Open company profile →
            </Link>
          ) : (
            <p className="text-muted-foreground">No company linked.</p>
          )}
        </div>
      )}

      {/* Edit Modal — real DynamoDB save */}
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
              placeholder="Notes"
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
