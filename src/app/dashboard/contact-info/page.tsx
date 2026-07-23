'use client';

import { useEffect, useMemo, useState } from 'react';
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
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DEFAULT_PAGE_SIZE,
  PaginationBar,
  paginateItems,
} from '@/components/ui/pagination-bar';
import { useClients } from '@/lib/hooks/query-client';
import { useAddContact, useRemoveContact } from '@/lib/hooks/contact-mutations';
import { getDisplayPhone } from '@/lib/contacts/phone';

type SortKey = 'name' | 'company' | 'added' | 'last_activity';

type ContactBucket =
  | 'all'
  | 'primary'
  | 'with_email'
  | 'with_phone'
  | 'missing_email'
  | 'missing_phone';

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

  const [search, setSearch] = useState('');
  const [bucket, setBucket] = useState<ContactBucket>('all');
  const [sortKey, setSortKey] = useState<SortKey>('last_activity');
  const [page, setPage] = useState(1);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [newContact, setNewContact] = useState({
    name: '',
    title: '',
    email: '',
    phone: '',
    clientId: '',
  });

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
          raw: contact,
        });
      }
    }
    return rows;
  }, [companies]);

  const stats = useMemo(() => {
    const counts = {
      all: enriched.length,
      primary: 0,
      with_email: 0,
      with_phone: 0,
      missing_email: 0,
      missing_phone: 0,
    };
    for (const c of enriched) {
      if (c.isPrimary) counts.primary++;
      if (c.email) counts.with_email++;
      else counts.missing_email++;
      if (c.phone) counts.with_phone++;
      else counts.missing_phone++;
    }
    return counts;
  }, [enriched]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = enriched.filter((c) => {
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
      const hay = [c.name, c.title, c.email, c.phone, c.companyName]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
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
  }, [enriched, search, bucket, sortKey]);

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

  const detailHref = (c: { id: string; clientId: string }) =>
    `/dashboard/contact-info/${c.id}?companyId=${c.clientId}`;

  const statCards: {
    key: ContactBucket;
    label: string;
    sub: string;
    count: number;
    ring: string;
    bg: string;
    text: string;
  }[] = [
    {
      key: 'all',
      label: 'All Contacts',
      sub: 'Click to show all',
      count: stats.all,
      ring: 'ring-blue-200',
      bg: 'bg-white',
      text: 'text-gray-900',
    },
    {
      key: 'primary',
      label: 'Primary',
      sub: 'Main contacts',
      count: stats.primary,
      ring: 'ring-amber-100',
      bg: 'bg-amber-50/80',
      text: 'text-amber-900',
    },
    {
      key: 'with_email',
      label: 'With Email',
      sub: 'Reachable by email',
      count: stats.with_email,
      ring: 'ring-sky-100',
      bg: 'bg-sky-50/80',
      text: 'text-sky-900',
    },
    {
      key: 'with_phone',
      label: 'With Phone',
      sub: 'Reachable by phone',
      count: stats.with_phone,
      ring: 'ring-emerald-100',
      bg: 'bg-emerald-50/80',
      text: 'text-emerald-900',
    },
    {
      key: 'missing_email',
      label: 'Missing Email',
      sub: 'Needs email',
      count: stats.missing_email,
      ring: 'ring-rose-100',
      bg: 'bg-rose-50/70',
      text: 'text-rose-900',
    },
    {
      key: 'missing_phone',
      label: 'Missing Phone',
      sub: 'Needs phone',
      count: stats.missing_phone,
      ring: 'ring-violet-100',
      bg: 'bg-violet-50/80',
      text: 'text-violet-900',
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
    <div className="min-w-0 max-w-full space-y-5">
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

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {statCards.map((card) => {
          const active = bucket === card.key;
          return (
            <button
              key={card.key}
              type="button"
              onClick={() => setBucket(card.key)}
              className={`text-left rounded-2xl border px-4 py-3.5 shadow-sm transition-all ${card.bg} ${
                active
                  ? `ring-2 ${card.ring} border-blue-300 shadow-md`
                  : 'border-gray-200 hover:border-gray-300 hover:shadow'
              }`}
            >
              <div className={`text-2xl font-semibold tabular-nums ${card.text}`}>{card.count}</div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-600 mt-1">
                {card.label}
              </div>
              <div className="text-[11px] text-gray-400 mt-0.5">{card.sub}</div>
            </button>
          );
        })}
      </div>

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
        <div className="flex items-center gap-3">
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
        <div className="min-w-0 max-w-full bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto max-w-full">
            <table className="w-full table-fixed min-w-[720px]">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/80">
                  <th className="text-left px-3 py-3 text-[11px] font-semibold uppercase tracking-wider text-gray-500 w-[22%]">
                    Contact
                  </th>
                  <th className="text-left px-3 py-3 text-[11px] font-semibold uppercase tracking-wider text-gray-500 w-[16%]">
                    Company
                  </th>
                  <th className="text-left px-3 py-3 text-[11px] font-semibold uppercase tracking-wider text-gray-500 w-[18%]">
                    Email
                  </th>
                  <th className="text-left px-3 py-3 text-[11px] font-semibold uppercase tracking-wider text-gray-500 w-[14%]">
                    Phone
                  </th>
                  <th className="text-left px-3 py-3 text-[11px] font-semibold uppercase tracking-wider text-gray-500 w-[10%] hidden lg:table-cell">
                    Added
                  </th>
                  <th className="text-left px-3 py-3 text-[11px] font-semibold uppercase tracking-wider text-gray-500 w-[12%] hidden xl:table-cell">
                    Last Activity
                  </th>
                  <th className="text-right px-3 py-3 text-[11px] font-semibold uppercase tracking-wider text-gray-500 w-[8%]">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paged.slice.map((c) => {
                  const rowKey = `${c.clientId}-${c.id}`;
                  return (
                    <tr key={rowKey} className="hover:bg-gray-50/80 transition-colors">
                      <td className="px-3 py-3.5 max-w-0">
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
                                className="font-medium text-sm text-blue-600 hover:text-blue-700 hover:underline truncate"
                              >
                                {c.name}
                              </Link>
                              {c.isPrimary && (
                                <span className="inline-flex items-center gap-0.5 rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 shrink-0">
                                  <Star className="h-2.5 w-2.5" />
                                  Primary
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-gray-500 truncate">
                              {c.title || '—'}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="px-3 py-3.5 max-w-0">
                        {c.clientId ? (
                          <Link
                            href={`/dashboard/companies/${c.clientId}`}
                            className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:underline min-w-0 max-w-full"
                          >
                            <Building2 className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                            <span className="truncate">{c.companyName}</span>
                          </Link>
                        ) : (
                          <span className="text-sm text-gray-600 truncate block">{c.companyName}</span>
                        )}
                      </td>

                      <td className="px-3 py-3.5 max-w-0">
                        {c.email ? (
                          <a
                            href={`mailto:${c.email}`}
                            className="inline-flex items-center gap-1.5 text-sm text-gray-700 hover:text-blue-600 min-w-0 max-w-full"
                          >
                            <Mail className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                            <span className="truncate">{c.email}</span>
                          </a>
                        ) : (
                          <span className="text-sm text-gray-400 italic">—</span>
                        )}
                      </td>

                      <td className="px-3 py-3.5 max-w-0">
                        {c.phone ? (
                          <a
                            href={`tel:${c.phone}`}
                            className="inline-flex items-center gap-1.5 text-sm text-gray-700 hover:text-blue-600 min-w-0 max-w-full"
                            title={c.phone}
                          >
                            <Phone className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                            <span className="truncate">{c.phone}</span>
                          </a>
                        ) : (
                          <span className="text-sm text-gray-400 italic">—</span>
                        )}
                      </td>

                      <td className="px-3 py-3.5 text-sm text-gray-600 whitespace-nowrap hidden lg:table-cell">
                        {formatShortDate(c.added)}
                      </td>

                      <td className="px-3 py-3.5 text-sm text-gray-600 whitespace-nowrap hidden xl:table-cell">
                        {formatRelativeActivity(c.lastActivity)}
                      </td>

                      <td className="px-3 py-3.5 text-right">
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
                            onClick={() =>
                              setOpenMenuId((id) => (id === rowKey ? null : rowKey))
                            }
                            title="More actions"
                          >
                            <MoreHorizontal className="h-4 w-4 text-gray-500" />
                          </Button>
                          {openMenuId === rowKey && (
                            <div className="absolute right-0 top-9 z-20 w-44 rounded-lg border border-gray-200 bg-white shadow-lg py-1 text-left">
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
          </div>
        </div>
      )}
    </div>
  );
}
