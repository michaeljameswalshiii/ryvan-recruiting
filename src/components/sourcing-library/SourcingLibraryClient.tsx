'use client';

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Building2,
  Loader2,
  Mail,
  Phone,
  RefreshCw,
  Search,
  UserRound,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FilterStatCards } from '@/components/ui/filter-stat-cards';
import {
  DataListTable,
  LIST_PAGE_CLASS,
  LIST_TABLE_CLASS,
  listTd,
  listTdActions,
  listTdNameFlush,
  listTh,
  listThNameFlush,
  listThRight,
} from '@/components/ui/data-list-table';
import {
  DEFAULT_PAGE_SIZE,
  PaginationBar,
  paginateItems,
} from '@/components/ui/pagination-bar';

type Kind = 'people' | 'companies';
type RoleFilter = 'all' | 'candidate' | 'contact';

type PersonRow = {
  id: string;
  name: string;
  title?: string;
  company?: string;
  location?: string;
  roles: Array<'candidate' | 'contact'>;
  hasEmail: boolean;
  hasPhone: boolean;
  hasLinkedIn: boolean;
  sources: string[];
  sightingCount: number;
  lastSeenAt: string;
};

type CompanyRow = {
  id: string;
  name: string;
  website?: string;
  domain?: string;
  city?: string;
  state?: string;
  location?: string;
  industry?: string;
  sources: string[];
  sightingCount: number;
  lastSeenAt: string;
};

type Detail = {
  email?: string;
  phone?: string;
  linkedinUrl?: string;
  website?: string;
  sightings?: Array<{
    at: string;
    surface: string;
    source?: string;
    query?: string;
    title?: string;
    location?: string;
  }>;
};

function formatWhen(iso?: string) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function sourceLabel(source?: string) {
  const s = String(source || '').toLowerCase();
  if (s === 'apollo') return 'Apollo';
  if (s === 'pdl') return 'People Data Labs';
  if (s === 'llm' || s === 'web') return 'AI';
  if (s === 'list_builder') return 'List builder';
  return source || 'Search';
}

export function SourcingLibraryClient() {
  const searchParams = useSearchParams();
  const initialQuery = (searchParams.get('q') || '').trim();
  const [kind, setKind] = useState<Kind>('people');
  const [role, setRole] = useState<RoleFilter>('all');
  const [query, setQuery] = useState(initialQuery);
  const [draft, setDraft] = useState(initialQuery);
  const [people, setPeople] = useState<PersonRow[]>([]);
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [stats, setStats] = useState({
    total: 0,
    candidates: 0,
    contacts: 0,
    withEmail: 0,
    companies: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [importingId, setImportingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const peopleUrl = `/api/market-source?kind=people&role=all&q=${encodeURIComponent(query)}&page=1&pageSize=2000`;
      const companiesUrl = `/api/market-source?kind=companies&q=${encodeURIComponent(query)}&page=1&pageSize=2000`;
      const [peopleRes, companiesRes] = await Promise.all([
        fetch(peopleUrl, { credentials: 'include' }),
        fetch(companiesUrl, { credentials: 'include' }),
      ]);
      const peopleData = await peopleRes.json().catch(() => ({}));
      const companyData = await companiesRes.json().catch(() => ({}));
      if (!peopleRes.ok) throw new Error(peopleData.error || 'Failed to load people');
      if (!companiesRes.ok) throw new Error(companyData.error || 'Failed to load companies');
      setPeople(Array.isArray(peopleData.items) ? peopleData.items : []);
      setCompanies(Array.isArray(companyData.items) ? companyData.items : []);
      setStats({
        total: Number(peopleData.total || 0),
        candidates: Number(peopleData.candidates || 0),
        contacts: Number(peopleData.contacts || 0),
        withEmail: Number(peopleData.withEmail || 0),
        companies: Number(companyData.total || 0),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load library');
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setPage(1);
    setOpenId(null);
    setDetail(null);
  }, [kind, role, query]);

  const openDetail = async (id: string) => {
    if (openId === id) {
      setOpenId(null);
      setDetail(null);
      return;
    }
    setOpenId(id);
    setDetail(null);
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/market-source?id=${encodeURIComponent(id)}`, {
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to load record');
      setDetail(data.record || null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not open record');
    } finally {
      setDetailLoading(false);
    }
  };

  const importRow = async (
    id: string,
    as: 'candidate' | 'contact' | 'company'
  ) => {
    setImportingId(id);
    try {
      const res = await fetch('/api/market-source/import', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, as }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not add to your CRM');
      toast.success(data.message || 'Added');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not add');
    } finally {
      setImportingId(null);
    }
  };

  const visiblePeople =
    role === 'all'
      ? people
      : people.filter((row) => (row.roles || []).includes(role));
  const pagedPeople = useMemo(
    () => paginateItems(visiblePeople, page, DEFAULT_PAGE_SIZE),
    [visiblePeople, page]
  );
  const pagedCompanies = useMemo(
    () => paginateItems(companies, page, DEFAULT_PAGE_SIZE),
    [companies, page]
  );
  const paged = kind === 'people' ? pagedPeople : pagedCompanies;

  return (
    <div className={LIST_PAGE_CLASS}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
            Sourcing library
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-300">
            Shared names from Apollo, AI, and list-builder searches — before anyone
            added them to a tenant. Your candidates, contacts, and companies stay private.
          </p>
        </div>
        <Button variant="outline" onClick={() => void load()} disabled={loading}>
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Refresh
        </Button>
      </div>

      <FilterStatCards
        cards={[
          { key: 'people', label: 'People', sub: 'Search hits', count: stats.total, tone: 'sky' },
          { key: 'candidates', label: 'Candidates', sub: 'Talent', count: stats.candidates, tone: 'violet' },
          { key: 'contacts', label: 'Contacts', sub: 'Hiring side', count: stats.contacts, tone: 'amber' },
          { key: 'companies', label: 'Companies', sub: 'Accounts', count: stats.companies, tone: 'emerald' },
        ]}
        activeKey={
          kind === 'companies'
            ? 'companies'
            : role === 'candidate'
              ? 'candidates'
              : role === 'contact'
                ? 'contacts'
                : 'people'
        }
        onSelect={(key) => {
          if (key === 'companies') {
            setKind('companies');
            return;
          }
          setKind('people');
          if (key === 'candidates') setRole('candidate');
          else if (key === 'contacts') setRole('contact');
          else setRole('all');
        }}
      />

      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          setQuery(draft.trim());
        }}
      >
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Search name, title, company, city…"
            className="pl-9"
          />
        </div>
        <Button type="submit">Search</Button>
      </form>

      {error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </p>
      ) : null}

      <DataListTable>
        <table className={LIST_TABLE_CLASS}>
          <thead>
            <tr>
              <th className={listThNameFlush}>
                {kind === 'people' ? 'Person' : 'Company'}
              </th>
              <th className={listTh}>
                {kind === 'people' ? 'Title / company' : 'Location'}
              </th>
              <th className={listTh}>Source</th>
              <th className={listTh}>Seen</th>
              <th className={listTh}>Last seen</th>
              <th className={listThRight}>Add</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className={listTd} colSpan={6}>
                  <span className="inline-flex items-center gap-2 text-sm text-slate-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading shared search hits…
                  </span>
                </td>
              </tr>
            ) : paged.slice.length === 0 ? (
              <tr>
                <td className={`${listTd} text-sm text-slate-500`} colSpan={6}>
                  No shared search hits yet. Run a Fill Job or list builder, or
                  backfill historical searches.
                </td>
              </tr>
            ) : kind === 'people' ? (
              pagedPeople.slice.map((row) => (
                <Fragment key={row.id}>
                  <tr
                    className="group cursor-pointer border-t border-gray-100 hover:bg-gray-50"
                    onClick={() => void openDetail(row.id)}
                  >
                    <td className={listTdNameFlush()}>
                      <div className="flex items-center gap-2">
                        <UserRound className="h-4 w-4 shrink-0 text-slate-400" />
                        <div className="min-w-0">
                          <div className="truncate font-semibold text-slate-900">
                            {row.name}
                          </div>
                          <div className="truncate text-[11px] text-slate-500">
                            {(row.roles || []).join(' · ') || 'person'}
                            {row.hasEmail ? ' · email' : ''}
                            {row.hasPhone ? ' · phone' : ''}
                            {row.hasLinkedIn ? ' · LinkedIn' : ''}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className={listTd}>
                      <div className="truncate text-sm text-slate-800">
                        {row.title || '—'}
                      </div>
                      <div className="truncate text-[11px] text-slate-500">
                        {[row.company, row.location].filter(Boolean).join(' · ') || '—'}
                      </div>
                    </td>
                    <td className={listTd}>
                      <div className="truncate text-sm text-slate-700">
                        {(row.sources || []).map(sourceLabel).join(', ') || '—'}
                      </div>
                    </td>
                    <td className={listTd}>
                      <span className="text-sm text-slate-700">{row.sightingCount}</span>
                    </td>
                    <td className={listTd}>
                      <span className="text-sm text-slate-700">
                        {formatWhen(row.lastSeenAt)}
                      </span>
                    </td>
                    <td className={listTdActions(false)}>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={importingId === row.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          void importRow(
                            row.id,
                            row.roles?.includes('contact') &&
                              !row.roles?.includes('candidate')
                              ? 'contact'
                              : 'candidate'
                          );
                        }}
                      >
                        {importingId === row.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          'Add'
                        )}
                      </Button>
                    </td>
                  </tr>
                  {openId === row.id ? (
                    <tr key={`${row.id}-detail`} className="bg-slate-50">
                      <td className={listTd} colSpan={6}>
                        {detailLoading ? (
                          <span className="inline-flex items-center gap-2 text-sm text-slate-500">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Loading…
                          </span>
                        ) : (
                          <div className="space-y-2 text-sm text-slate-700">
                            <div className="flex flex-wrap gap-4">
                              {detail?.email ? (
                                <span className="inline-flex items-center gap-1">
                                  <Mail className="h-3.5 w-3.5" />
                                  {detail.email}
                                </span>
                              ) : null}
                              {detail?.phone ? (
                                <span className="inline-flex items-center gap-1">
                                  <Phone className="h-3.5 w-3.5" />
                                  {detail.phone}
                                </span>
                              ) : null}
                              {detail?.linkedinUrl ? (
                                <a
                                  href={`https://${detail.linkedinUrl}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-blue-700 underline"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {detail.linkedinUrl}
                                </a>
                              ) : null}
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <Button
                                size="sm"
                                onClick={() => void importRow(row.id, 'candidate')}
                              >
                                Add as candidate
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => void importRow(row.id, 'contact')}
                              >
                                Add as contact
                              </Button>
                            </div>
                            {(detail?.sightings || []).length > 0 ? (
                              <div>
                                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                                  Search hits
                                </div>
                                <ul className="space-y-1">
                                  {(detail?.sightings || []).map((s, i) => (
                                    <li key={`${s.at}-${i}`} className="text-[13px]">
                                      {formatWhen(s.at)} · {sourceLabel(s.source)} ·{' '}
                                      {s.query || s.title || s.surface}
                                      {s.location ? ` · ${s.location}` : ''}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            ) : null}
                          </div>
                        )}
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              ))
            ) : (
              pagedCompanies.slice.map((row) => (
                <Fragment key={row.id}>
                  <tr
                    className="group cursor-pointer border-t border-gray-100 hover:bg-gray-50"
                    onClick={() => void openDetail(row.id)}
                  >
                    <td className={listTdNameFlush()}>
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 shrink-0 text-slate-400" />
                        <div className="min-w-0">
                          <div className="truncate font-semibold text-slate-900">
                            {row.name}
                          </div>
                          <div className="truncate text-[11px] text-slate-500">
                            {row.domain || row.website || '—'}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className={listTd}>
                      <div className="truncate text-sm text-slate-800">
                        {row.location ||
                          [row.city, row.state].filter(Boolean).join(', ') ||
                          '—'}
                      </div>
                      <div className="truncate text-[11px] text-slate-500">
                        {row.industry || '—'}
                      </div>
                    </td>
                    <td className={listTd}>
                      <div className="truncate text-sm text-slate-700">
                        {(row.sources || []).map(sourceLabel).join(', ') || '—'}
                      </div>
                    </td>
                    <td className={listTd}>
                      <span className="text-sm text-slate-700">{row.sightingCount}</span>
                    </td>
                    <td className={listTd}>
                      <span className="text-sm text-slate-700">
                        {formatWhen(row.lastSeenAt)}
                      </span>
                    </td>
                    <td className={listTdActions(false)}>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={importingId === row.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          void importRow(row.id, 'company');
                        }}
                      >
                        {importingId === row.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          'Add'
                        )}
                      </Button>
                    </td>
                  </tr>
                  {openId === row.id ? (
                    <tr className="bg-slate-50">
                      <td className={listTd} colSpan={6}>
                        {detailLoading ? (
                          <span className="inline-flex items-center gap-2 text-sm text-slate-500">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Loading…
                          </span>
                        ) : (
                          <div className="space-y-2 text-sm text-slate-700">
                            {detail?.website ? (
                              <a
                                href={
                                  detail.website.startsWith('http')
                                    ? detail.website
                                    : `https://${detail.website}`
                                }
                                target="_blank"
                                rel="noreferrer"
                                className="text-blue-700 underline"
                              >
                                {detail.website}
                              </a>
                            ) : null}
                            {(detail?.sightings || []).length > 0 ? (
                              <ul className="space-y-1">
                                {(detail?.sightings || []).map((s, i) => (
                                  <li key={`${s.at}-${i}`} className="text-[13px]">
                                    {formatWhen(s.at)} · {sourceLabel(s.source)} ·{' '}
                                    {s.query || s.title || s.surface}
                                  </li>
                                ))}
                              </ul>
                            ) : null}
                          </div>
                        )}
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              ))
            )}
          </tbody>
        </table>
      </DataListTable>

      <PaginationBar
        page={paged.page}
        totalPages={paged.totalPages}
        total={paged.total}
        onPageChange={setPage}
        itemLabel={kind === 'people' ? 'people' : 'companies'}
        className="rounded-xl border border-gray-100 bg-white px-3 py-2 shadow-sm"
      />
    </div>
  );
}
