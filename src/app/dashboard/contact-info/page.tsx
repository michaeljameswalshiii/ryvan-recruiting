'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Plus,
  RefreshCw,
  Search,
  MoreHorizontal,
  Trash2,
  Pencil,
  Eye,
  Mail,
  Phone,
  Building2,
  Star,
  UserRound,
  MapPin,
  Check,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SimpleDialog } from '@/components/ui/simple-dialog';
import {
  DEFAULT_PAGE_SIZE,
  PaginationBar,
  paginateItems,
} from '@/components/ui/pagination-bar';
import { FilterStatCards } from '@/components/ui/filter-stat-cards';
import { useClients } from '@/lib/hooks/query-client';
import { useAddContact, useRemoveContact, useUpdateContact } from '@/lib/hooks/contact-mutations';
import { getDisplayPhone } from '@/lib/contacts/phone';
import { useListColumns } from '@/lib/ui/use-list-columns';
import { useAssignmentOwners } from '@/lib/hooks/use-assignment-owners';
import {
  DataListTable,
  LIST_PAGE_CLASS,
  LIST_TABLE_CLASS,
  ListColumnPicker,
  listTd,
  listTdActions,
  listTh,
  listThRight,
} from '@/components/ui/data-list-table';
import { recordMatchesQuery } from '@/lib/tags';

type SortKey = 'name' | 'company' | 'added' | 'last_activity';

type ContactBucket =
  | 'all'
  | 'primary'
  | 'with_email'
  | 'with_phone'
  | 'missing_email'
  | 'missing_phone';

type ContactColumnId =
  | 'company'
  | 'email'
  | 'phone'
  | 'added'
  | 'last_activity'
  | 'owner'
  | 'location';

const CONTACT_COLUMN_DEFS: {
  id: ContactColumnId;
  label: string;
  defaultOn: boolean;
  isNew?: boolean;
}[] = [
  { id: 'company', label: 'Company', defaultOn: true },
  { id: 'owner', label: 'Owner', defaultOn: true, isNew: true },
  { id: 'location', label: 'Location', defaultOn: true, isNew: true },
  { id: 'email', label: 'Email', defaultOn: true },
  { id: 'phone', label: 'Phone', defaultOn: true },
  { id: 'added', label: 'Added', defaultOn: false },
  { id: 'last_activity', label: 'Last Activity', defaultOn: true },
];

const CONTACT_COLUMNS_KEY = 'trio.contacts.tableColumns.v3';

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function avatarColor(name: string) {
  const palette = [
    'bg-blue-600',
    'bg-indigo-600',
    'bg-violet-600',
    'bg-emerald-600',
    'bg-teal-600',
    'bg-orange-600',
    'bg-rose-600',
    'bg-cyan-600',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash + name.charCodeAt(i) * 17) % palette.length;
  return palette[hash];
}

function formatShortDate(value?: string) {
  if (!value) return '—';
  try {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return '—';
  }
}

type ContactField = 'email' | 'phone';
type EditTarget = { rowKey: string; field: ContactField; mode: 'inline' | 'dialog' };

function isLikelyEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isLikelyPhone(value: string) {
  return value.replace(/\D/g, '').length >= 7;
}

function phoneUpdatePayload(raw: unknown, next: string) {
  const contact = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const existing = Array.isArray(contact.phones)
    ? contact.phones.filter(
        (p): p is { number?: string; isPreferred?: boolean } =>
          !!p && typeof p === 'object' && typeof (p as { number?: string }).number === 'string'
      )
    : [];
  const kept = existing.filter((p) => (p.number || '').trim());
  if (kept.length === 0) return { phone: next };
  if (!next) return { phone: '', phones: [] };
  const preferredIdx = kept.findIndex((p) => p.isPreferred);
  const idx = preferredIdx >= 0 ? preferredIdx : 0;
  return {
    phone: next,
    phones: kept.map((p, i) => (i === idx ? { ...p, number: next } : p)),
  };
}

function InlineContactField({
  kind,
  value,
  editing,
  draft,
  saving,
  onStart,
  onDraft,
  onSave,
  onCancel,
}: {
  kind: ContactField;
  value: string;
  editing: boolean;
  draft: string;
  saving: boolean;
  onStart: () => void;
  onDraft: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  if (editing) {
    return (
      <form
        className="flex min-w-[12rem] max-w-[18rem] items-center gap-1"
        onSubmit={(e) => {
          e.preventDefault();
          onSave();
        }}
      >
        <Input
          autoFocus
          type={kind === 'email' ? 'email' : 'tel'}
          value={draft}
          disabled={saving}
          onChange={(e) => onDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              onCancel();
            }
          }}
          onBlur={() => {
            if (!saving) onSave();
          }}
          placeholder={kind === 'email' ? 'name@company.com' : 'Phone number'}
          aria-label={kind === 'email' ? 'Email' : 'Phone'}
          className="h-8 bg-white text-sm"
        />
        <Button
          type="submit"
          size="sm"
          variant="ghost"
          className="h-8 w-8 shrink-0 p-0"
          disabled={saving}
          title="Save"
        >
          <Check className="h-3.5 w-3.5 text-emerald-600" />
        </Button>
      </form>
    );
  }

  if (value) {
    return (
      <div className="group/field flex min-w-0 max-w-full items-center gap-1">
        <a
          href={kind === 'email' ? `mailto:${value}` : `tel:${value}`}
          className="inline-flex min-w-0 max-w-full items-center gap-1.5 text-sm text-gray-700 hover:text-blue-600"
          title={value}
        >
          {kind === 'email' ? (
            <Mail className="h-3.5 w-3.5 shrink-0 text-gray-400" />
          ) : (
            <Phone className="h-3.5 w-3.5 shrink-0 text-gray-400" />
          )}
          <span className="truncate">{value}</span>
        </a>
        <button
          type="button"
          onClick={onStart}
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-gray-400 opacity-0 hover:bg-gray-100 hover:text-blue-600 group-hover/field:opacity-100 focus:opacity-100"
          title={`Edit ${kind}`}
        >
          <Pencil className="h-3 w-3" />
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onStart}
      className="inline-flex items-center gap-1 text-xs font-medium text-gray-400 hover:text-blue-600"
    >
      <Plus className="h-3 w-3" />
      Add {kind}
    </button>
  );
}

function formatRelativeActivity(value?: string) {
  if (!value) return '—';
  try {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    const now = new Date();
    const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startThat = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const diffDays = Math.round((startToday.getTime() - startThat.getTime()) / 86400000);
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return '—';
  }
}

export default function ContactInfoPage() {
  const router = useRouter();
  const { data: clientsData, isLoading, error, refetch } = useClients();
  const addContact = useAddContact();
  const removeContact = useRemoveContact();
  const updateContact = useUpdateContact();

  const [search, setSearch] = useState('');
  const [bucket, setBucket] = useState<ContactBucket>('all');
  const [sortKey, setSortKey] = useState<SortKey>('last_activity');
  const [page, setPage] = useState(1);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [editing, setEditing] = useState<EditTarget | null>(null);
  const [draft, setDraft] = useState('');
  const [savingField, setSavingField] = useState(false);
  const [overrides, setOverrides] = useState<
    Record<string, Partial<Record<ContactField, string>>>
  >({});
  const savingFieldRef = useRef(false);
  const [showForm, setShowForm] = useState(false);
  const [newContact, setNewContact] = useState({
    name: '',
    title: '',
    email: '',
    phone: '',
    clientId: '',
  });
  const columns = useListColumns(CONTACT_COLUMNS_KEY, CONTACT_COLUMN_DEFS);
  const { data: ownerMap = {} } = useAssignmentOwners('contact');

  const companies = useMemo(() => {
    if (Array.isArray(clientsData)) return clientsData;
    if (clientsData && Array.isArray((clientsData as any).clients)) {
      return (clientsData as any).clients;
    }
    return [];
  }, [clientsData]);

  const enriched = useMemo(() => {
    const rows: Array<{
      id: string;
      clientId: string;
      companyName: string;
      name: string;
      title: string;
      email: string;
      phone: string;
      isPrimary: boolean;
      added?: string;
      lastActivity?: string;
      location: string;
      ownerName: string;
      raw: any;
    }> = [];

    for (const company of companies) {
      const contacts = Array.isArray(company.contacts) ? company.contacts : [];
      for (const contact of contacts) {
        if (!contact?.id && !contact?.name) continue;
        const phone = getDisplayPhone(contact);
        const added = contact.createdAt || contact.created_at;
        const lastActivity =
          contact.updatedAt || contact.updated_at || contact.modified_at || added;
        rows.push({
          id: contact.id || `${company.id}-${contact.name}`,
          clientId: company.id || company.PK,
          companyName: company.name || company.companyName || '—',
          name: contact.name || 'Unknown',
          title: contact.title || '',
          email: (contact.email || '').trim(),
          phone,
          isPrimary: !!contact.isPrimary,
          added,
          lastActivity,
          location:
            [contact.city, contact.state].filter(Boolean).join(', ') ||
            [company.city, company.state].filter(Boolean).join(', '),
          ownerName:
            ownerMap[String(contact.id)]?.name ||
            contact.ownerName ||
            contact.accountOwner ||
            contact.createdByName ||
            '',
          raw: contact,
        });
      }
    }
    return rows;
  }, [companies, ownerMap]);

  const displayRows = useMemo(() => {
    return enriched.map((c) => {
      const rowKey = `${c.clientId}-${c.id}`;
      const patch = overrides[rowKey];
      if (!patch) return c;
      return {
        ...c,
        email: patch.email ?? c.email,
        phone: patch.phone ?? c.phone,
      };
    });
  }, [enriched, overrides]);

  const stats = useMemo(() => {
    const counts = {
      all: displayRows.length,
      primary: 0,
      with_email: 0,
      with_phone: 0,
      missing_email: 0,
      missing_phone: 0,
    };
    for (const c of displayRows) {
      if (c.isPrimary) counts.primary++;
      if (c.email) counts.with_email++;
      else counts.missing_email++;
      if (c.phone) counts.with_phone++;
      else counts.missing_phone++;
    }
    return counts;
  }, [displayRows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = displayRows.filter((c) => {
      switch (bucket) {
        case 'primary':
          if (!c.isPrimary) return false;
          break;
        case 'with_email':
          if (!c.email) return false;
          break;
        case 'with_phone':
          if (!c.phone) return false;
          break;
        case 'missing_email':
          if (c.email) return false;
          break;
        case 'missing_phone':
          if (c.phone) return false;
          break;
        default:
          break;
      }
      if (!q) return true;
      return recordMatchesQuery({
        query: search,
        fields: [c.name, c.title, c.email, c.phone, c.companyName, c.ownerName, c.location],
        tags: Array.isArray(c.raw?.tags) ? c.raw.tags : [],
      });
    });

    list = [...list].sort((a, b) => {
      switch (sortKey) {
        case 'company':
          return a.companyName.localeCompare(b.companyName) || a.name.localeCompare(b.name);
        case 'added':
          return new Date(b.added || 0).getTime() - new Date(a.added || 0).getTime();
        case 'last_activity':
          return (
            new Date(b.lastActivity || 0).getTime() - new Date(a.lastActivity || 0).getTime()
          );
        case 'name':
        default:
          return a.name.localeCompare(b.name);
      }
    });

    return list;
  }, [displayRows, search, bucket, sortKey]);

  useEffect(() => {
    setPage(1);
  }, [search, bucket, sortKey]);

  const paged = useMemo(
    () => paginateItems(filtered, page, DEFAULT_PAGE_SIZE),
    [filtered, page]
  );

  const handleAdd = async () => {
    if (!newContact.clientId || !newContact.name.trim()) {
      alert('Company and name are required');
      return;
    }
    try {
      await addContact.mutateAsync({
        clientId: newContact.clientId,
        contactData: {
          name: newContact.name.trim(),
          title: newContact.title.trim(),
          email: newContact.email.trim(),
          phone: newContact.phone.trim(),
        },
      });
      setNewContact({ name: '', title: '', email: '', phone: '', clientId: '' });
      setShowForm(false);
      refetch();
    } catch (err: any) {
      alert(err?.message || 'Failed to add contact');
    }
  };

  const handleDelete = async (clientId: string, contactId: string, name: string) => {
    if (!confirm(`Delete ${name}?`)) return;
    try {
      await removeContact.mutateAsync({ clientId, contactId });
      setOpenMenuId(null);
      refetch();
    } catch (err: any) {
      alert(err?.message || 'Failed to delete contact');
    }
  };

  const startFieldEdit = (
    rowKey: string,
    field: ContactField,
    current: string,
    mode: 'inline' | 'dialog' = 'inline'
  ) => {
    setOpenMenuId(null);
    setEditing({ rowKey, field, mode });
    setDraft(current);
  };

  const cancelFieldEdit = () => {
    if (savingField) return;
    setEditing(null);
    setDraft('');
  };

  const saveFieldEdit = async (
    contact: { id: string; clientId: string; email: string; phone: string; raw: unknown }
  ) => {
    if (!editing || savingField) return;
    const next = draft.trim();
    const current = editing.field === 'email' ? contact.email : contact.phone;
    if (next === current) {
      cancelFieldEdit();
      return;
    }
    if (editing.field === 'email' && next && !isLikelyEmail(next)) {
      toast.error('Enter a valid email');
      return;
    }
    if (editing.field === 'phone' && next && !isLikelyPhone(next)) {
      toast.error('Enter a valid phone number');
      return;
    }

    const rowKey = `${contact.clientId}-${contact.id}`;
    if (savingFieldRef.current) return;
    savingFieldRef.current = true;
    setSavingField(true);
    try {
      await updateContact.mutateAsync({
        clientId: contact.clientId,
        contactId: contact.id,
        contactData:
          editing.field === 'email'
            ? { email: next }
            : phoneUpdatePayload(contact.raw, next),
      });
      setOverrides((prev) => ({
        ...prev,
        [rowKey]: { ...prev[rowKey], [editing.field]: next },
      }));
      setEditing(null);
      setDraft('');
    } catch {
      // useUpdateContact already toasts
    } finally {
      savingFieldRef.current = false;
      setSavingField(false);
    }
  };

  const detailHref = (c: { id: string; clientId: string }) =>
    `/dashboard/contact-info/${c.id}?companyId=${c.clientId}`;

  const editingRow = editing
    ? displayRows.find((c) => `${c.clientId}-${c.id}` === editing.rowKey)
    : undefined;

  const statCards = [
    {
      key: 'all',
      label: 'All Contacts',
      sub: 'Click to show all',
      count: stats.all,
      tone: 'neutral' as const,
    },
    {
      key: 'primary',
      label: 'Primary',
      sub: 'Main contacts',
      count: stats.primary,
      tone: 'indigo' as const,
    },
    {
      key: 'with_email',
      label: 'With Email',
      sub: 'Reachable by email',
      count: stats.with_email,
      tone: 'sky' as const,
    },
    {
      key: 'with_phone',
      label: 'With Phone',
      sub: 'Reachable by phone',
      count: stats.with_phone,
      tone: 'emerald' as const,
    },
    {
      key: 'missing_email',
      label: 'Missing Email',
      sub: 'Needs email',
      count: stats.missing_email,
      tone: 'rose' as const,
    },
    {
      key: 'missing_phone',
      label: 'Missing Phone',
      sub: 'Needs phone',
      count: stats.missing_phone,
      tone: 'violet' as const,
    },
  ];

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Contacts</h1>
          <p className="text-sm text-gray-500">Manage business contacts across companies</p>
        </div>
        <div className="flex items-center justify-center py-16 text-gray-500">
          <RefreshCw className="h-6 w-6 animate-spin" />
          <span className="ml-3">Loading contacts...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-start gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Contacts</h1>
            <p className="text-sm text-gray-500">Manage business contacts across companies</p>
          </div>
          <Button onClick={() => refetch()} variant="outline">
            <RefreshCw className="mr-2 h-4 w-4" /> Retry
          </Button>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center">
          <div className="text-red-600 text-lg font-semibold mb-2">Error Loading Contacts</div>
          <p className="text-red-600 text-sm">{(error as Error).message}</p>
          <Button onClick={() => refetch()} className="mt-4">
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={LIST_PAGE_CLASS}>
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Contacts</h1>
          <p className="text-sm text-gray-500">
            Manage business contacts — click any card to filter
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowForm((v) => !v)}>
            {showForm ? 'Cancel' : 'Quick add'}
          </Button>
          <Button
            size="sm"
            onClick={() => router.push('/dashboard/contacts/new')}
            className="bg-blue-600 hover:bg-blue-700"
          >
            <Plus className="mr-2 h-4 w-4" />
            Add Contact
          </Button>
        </div>
      </div>

      {showForm && (
        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Quick add contact</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
            <select
              value={newContact.clientId}
              onChange={(e) => setNewContact({ ...newContact, clientId: e.target.value })}
              className="h-10 border border-gray-200 rounded-lg px-3 text-sm bg-white"
            >
              <option value="">Company *</option>
              {[...companies]
                .sort((a: any, b: any) =>
                  String(a.name || '').localeCompare(String(b.name || ''))
                )
                .map((company: any) => (
                  <option key={company.id || company.PK} value={company.id || company.PK}>
                    {company.name || company.companyName || company.id}
                  </option>
                ))}
            </select>
            <Input
              value={newContact.name}
              onChange={(e) => setNewContact({ ...newContact, name: e.target.value })}
              placeholder="Name *"
              className="bg-white"
            />
            <Input
              value={newContact.title}
              onChange={(e) => setNewContact({ ...newContact, title: e.target.value })}
              placeholder="Title"
              className="bg-white"
            />
            <Input
              value={newContact.email}
              onChange={(e) => setNewContact({ ...newContact, email: e.target.value })}
              placeholder="Email"
              className="bg-white"
            />
            <div className="flex gap-2">
              <Input
                value={newContact.phone}
                onChange={(e) => setNewContact({ ...newContact, phone: e.target.value })}
                placeholder="Phone"
                className="bg-white"
              />
              <Button
                onClick={handleAdd}
                disabled={addContact.isPending}
                className="bg-blue-600 hover:bg-blue-700 shrink-0"
              >
                {addContact.isPending ? '…' : 'Add'}
              </Button>
            </div>
          </div>
        </div>
      )}

      <FilterStatCards
        cards={statCards}
        activeKey={bucket}
        onSelect={(key) => setBucket(key as ContactBucket)}
        className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3"
      />

      {/* Search / sort */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search contacts..."
            className="pl-9 bg-white"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white shadow-sm"
            aria-label="Sort contacts"
          >
            <option value="name">Sort: Name</option>
            <option value="company">Sort: Company</option>
            <option value="added">Sort: Date Added</option>
            <option value="last_activity">Sort: Last Activity</option>
          </select>
          <ListColumnPicker
            defs={CONTACT_COLUMN_DEFS}
            order={columns.order}
            col={columns.col}
            toggle={columns.toggle}
            move={columns.move}
            reorder={columns.reorder}
            reset={columns.reset}
            open={columns.open}
            setOpen={(next) => {
              setOpenMenuId(null);
              columns.setOpen(next);
            }}
            alwaysOnNote="Contact name and Actions always stay on. Use the arrows to change order."
          />
          <span className="text-xs text-gray-500 whitespace-nowrap">
            {filtered.length} contact{filtered.length === 1 ? '' : 's'}
            {filtered.length > DEFAULT_PAGE_SIZE
              ? ` · page ${paged.page}/${paged.totalPages}`
              : ''}
          </span>
        </div>
      </div>

      {filtered.length > 0 && (
        <PaginationBar
          page={paged.page}
          totalPages={paged.totalPages}
          total={paged.total}
          onPageChange={setPage}
          itemLabel={paged.total === 1 ? 'contact' : 'contacts'}
          className="rounded-xl border border-gray-100 bg-white px-3 py-2 shadow-sm"
        />
      )}

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center shadow-sm">
          <div className="mx-auto mb-4 h-12 w-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <UserRound className="h-6 w-6" />
          </div>
          <h2 className="text-xl font-semibold mb-2 text-gray-900">
            {enriched.length === 0 ? 'No Contacts Yet' : 'No matches'}
          </h2>
          <p className="text-gray-500 max-w-md mx-auto mb-6 text-sm">
            {enriched.length === 0
              ? 'Add contacts to companies so you can reach hiring managers and decision makers.'
              : 'Try a different search or clear the filter.'}
          </p>
          <div className="flex justify-center gap-2">
            {bucket !== 'all' && (
              <Button variant="outline" onClick={() => setBucket('all')}>
                Clear filter
              </Button>
            )}
            <Button onClick={() => setShowForm(true)} className="bg-blue-600 hover:bg-blue-700">
              <Plus className="mr-2 h-4 w-4" /> Add Contact
            </Button>
          </div>
        </div>
      ) : (
        <DataListTable>
            <table className={LIST_TABLE_CLASS}>
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/80">
                  <th className="sticky top-0 left-0 z-[11] bg-gray-50 text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-gray-500 w-[19rem] min-w-[19rem] overflow-hidden">
                    Contact
                  </th>
                  {columns.visibleIds.map((id) => (
                    <th
                      key={id}
                      className={
                        id === 'last_activity'
                          ? `${listTh} w-[5.25rem] max-w-[5.25rem] px-2`
                          : id === 'owner'
                            ? `${listTh} w-[3.25rem] max-w-[3.25rem] px-2 text-center`
                            : listTh
                      }
                    >
                      {CONTACT_COLUMN_DEFS.find((d) => d.id === id)?.label}
                    </th>
                  ))}
                  <th className={listThRight}>
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paged.slice.map((c) => {
                  const rowKey = `${c.clientId}-${c.id}`;
                  return (
                    <tr key={rowKey} className="group hover:bg-gray-50/80 transition-colors">
                      <td className="sticky left-0 z-[5] px-4 py-3.5 w-[19rem] min-w-[19rem] overflow-hidden bg-white group-hover:bg-gray-50/80">
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={`h-9 w-9 shrink-0 rounded-full ${avatarColor(c.name)} text-white flex items-center justify-center text-xs font-semibold`}
                          >
                            {getInitials(c.name)}
                          </div>
                          <div className="min-w-0 overflow-hidden">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <Link
                                href={detailHref(c)}
                                title={c.name}
                                className="font-medium text-sm text-blue-600 hover:text-blue-700 hover:underline whitespace-nowrap"
                              >
                                {c.name}
                              </Link>
                              {c.isPrimary && (
                                <Star
                                  className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-500"
                                  aria-label="Primary contact"
                                />
                              )}
                            </div>
                            <div className="text-xs text-gray-500 truncate">
                              {c.title || '—'}
                            </div>
                          </div>
                        </div>
                      </td>

                      {columns.visibleIds.map((colId) => {
                        switch (colId) {
                          case 'company':
                            return (
                              <td key={colId} className={listTd}>
                                {c.clientId ? (
                                  <Link
                                    href={`/dashboard/companies/${c.clientId}`}
                                    className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:underline min-w-0 max-w-full"
                                  >
                                    <Building2 className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                                    <span className="truncate">{c.companyName}</span>
                                  </Link>
                                ) : (
                                  <span className="text-sm text-gray-600 truncate block">
                                    {c.companyName}
                                  </span>
                                )}
                              </td>
                            );
                          case 'email':
                            return (
                              <td key={colId} className={listTd}>
                                <InlineContactField
                                  kind="email"
                                  value={c.email}
                                  editing={
                                    editing?.rowKey === rowKey &&
                                    editing.field === 'email' &&
                                    editing.mode === 'inline'
                                  }
                                  draft={draft}
                                  saving={savingField}
                                  onStart={() => startFieldEdit(rowKey, 'email', c.email)}
                                  onDraft={setDraft}
                                  onSave={() => void saveFieldEdit(c)}
                                  onCancel={cancelFieldEdit}
                                />
                              </td>
                            );
                          case 'phone':
                            return (
                              <td key={colId} className={listTd}>
                                <InlineContactField
                                  kind="phone"
                                  value={c.phone}
                                  editing={
                                    editing?.rowKey === rowKey &&
                                    editing.field === 'phone' &&
                                    editing.mode === 'inline'
                                  }
                                  draft={draft}
                                  saving={savingField}
                                  onStart={() => startFieldEdit(rowKey, 'phone', c.phone)}
                                  onDraft={setDraft}
                                  onSave={() => void saveFieldEdit(c)}
                                  onCancel={cancelFieldEdit}
                                />
                              </td>
                            );
                          case 'added':
                            return (
                              <td
                                key={colId}
                                className={`${listTd} text-sm text-gray-600 whitespace-nowrap`}
                              >
                                {formatShortDate(c.added)}
                              </td>
                            );
                          case 'last_activity':
                            return (
                              <td
                                key={colId}
                                className={`${listTd} w-[5.25rem] max-w-[5.25rem] px-2 text-xs text-gray-600 whitespace-nowrap`}
                              >
                                {formatRelativeActivity(c.lastActivity)}
                              </td>
                            );
                          case 'owner':
                            return (
                              <td
                                key={colId}
                                className={`${listTd} w-[3.25rem] max-w-[3.25rem] px-2`}
                              >
                                {c.ownerName ? (
                                  <span
                                    title={c.ownerName}
                                    className={`mx-auto h-7 w-7 rounded-full ${avatarColor(c.ownerName)} text-white text-[10px] font-semibold flex items-center justify-center`}
                                  >
                                    {getInitials(c.ownerName)}
                                  </span>
                                ) : (
                                  <span className="block text-center text-sm text-gray-400">—</span>
                                )}
                              </td>
                            );
                          case 'location':
                            return (
                              <td key={colId} className={`${listTd} text-sm text-gray-700`}>
                                {c.location ? (
                                  <span className="inline-flex items-center gap-1 min-w-0">
                                    <MapPin className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                                    <span className="truncate">{c.location}</span>
                                  </span>
                                ) : (
                                  '—'
                                )}
                              </td>
                            );
                          default:
                            return null;
                        }
                      })}

                      <td className={listTdActions(false)}>
                        <div className="relative inline-flex items-center gap-1 justify-end">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={() => router.push(detailHref(c))}
                            title="View"
                          >
                            <Eye className="h-4 w-4 text-gray-500" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={() => {
                              columns.setOpen(false);
                              setOpenMenuId((id) => (id === rowKey ? null : rowKey));
                            }}
                            title="More actions"
                          >
                            <MoreHorizontal className="h-4 w-4 text-gray-500" />
                          </Button>
                          {openMenuId === rowKey && (
                            <div className="absolute right-0 top-9 z-20 w-48 rounded-lg border border-gray-200 bg-white shadow-lg py-1 text-left">
                              <button
                                type="button"
                                className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50"
                                onClick={() => {
                                  setOpenMenuId(null);
                                  router.push(detailHref(c));
                                }}
                              >
                                <Eye className="h-3.5 w-3.5" /> View
                              </button>
                              <button
                                type="button"
                                className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50"
                                onClick={() => startFieldEdit(rowKey, 'email', c.email, 'dialog')}
                              >
                                <Mail className="h-3.5 w-3.5" />
                                {c.email ? 'Edit email' : 'Add email'}
                              </button>
                              <button
                                type="button"
                                className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50"
                                onClick={() => startFieldEdit(rowKey, 'phone', c.phone, 'dialog')}
                              >
                                <Phone className="h-3.5 w-3.5" />
                                {c.phone ? 'Edit phone' : 'Add phone'}
                              </button>
                              <button
                                type="button"
                                className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50"
                                onClick={() => {
                                  setOpenMenuId(null);
                                  router.push(
                                    `/dashboard/contacts/${c.id}/edit?companyId=${c.clientId}`
                                  );
                                }}
                              >
                                <Pencil className="h-3.5 w-3.5" /> Edit
                              </button>
                              <button
                                type="button"
                                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                                onClick={() => handleDelete(c.clientId, c.id, c.name)}
                              >
                                <Trash2 className="h-3.5 w-3.5" /> Delete
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
        </DataListTable>
      )}

      <SimpleDialog
        open={!!(editing?.mode === 'dialog' && editingRow)}
        onOpenChange={(open) => {
          if (!open) cancelFieldEdit();
        }}
        title={
          editing?.field === 'phone'
            ? editingRow?.phone
              ? 'Edit phone'
              : 'Add phone'
            : editingRow?.email
              ? 'Edit email'
              : 'Add email'
        }
        description={
          editingRow
            ? `${editingRow.name}${editingRow.companyName ? ` · ${editingRow.companyName}` : ''}`
            : undefined
        }
        footer={
          <>
            <Button type="button" variant="outline" onClick={cancelFieldEdit} disabled={savingField}>
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-blue-600 hover:bg-blue-700"
              disabled={savingField || !editingRow}
              onClick={() => editingRow && void saveFieldEdit(editingRow)}
            >
              {savingField ? 'Saving…' : 'Save'}
            </Button>
          </>
        }
      >
        <Input
          autoFocus
          type={editing?.field === 'phone' ? 'tel' : 'email'}
          value={draft}
          disabled={savingField}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              if (editingRow) void saveFieldEdit(editingRow);
            }
          }}
          placeholder={editing?.field === 'phone' ? 'Phone number' : 'name@company.com'}
        />
      </SimpleDialog>
    </div>
  );
}
