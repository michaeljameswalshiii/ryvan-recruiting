'use client';

/**
 * Hiring manager / contact for a job req.
 * Pick from company contacts, clear, or open company to add a new contact.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Building2,
  Loader2,
  Mail,
  Phone,
  User,
  UserCircle2,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { useClient, useClients } from '@/lib/hooks/query-client';
import { useUpdateJob } from '@/lib/hooks/query-job';
import { toast } from 'sonner';

export type HiringManagerFields = {
  hiringManagerContactId?: string;
  hiringManagerName?: string;
  hiringManagerTitle?: string;
  hiringManagerEmail?: string;
  hiringManagerPhone?: string;
};

type ContactOption = {
  id: string;
  name: string;
  title?: string;
  email?: string;
  phone?: string;
  isPrimary?: boolean;
};

function contactsFromCompany(company: any): ContactOption[] {
  const list = Array.isArray(company?.contacts) ? company.contacts : [];
  return list
    .filter((c: any) => c && (c.id || c.name))
    .map((c: any) => ({
      id: String(c.id || c.contactId || ''),
      name: String(c.name || 'Unnamed'),
      title: c.title || '',
      email: c.email || '',
      phone:
        c.phone ||
        c.preferredPhone ||
        (Array.isArray(c.phones)
          ? c.phones.find((p: any) => p?.isPreferred)?.number ||
            c.phones[0]?.number ||
            ''
          : '') ||
        '',
      isPrimary: !!c.isPrimary,
    }))
    .filter((c: ContactOption) => !!c.id)
    .sort((a: ContactOption, b: ContactOption) => {
      if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
}

function findCompanyInList(
  allCompanies: any,
  companyId?: string
): any | null {
  if (!companyId) return null;
  const list = Array.isArray(allCompanies)
    ? allCompanies
    : Array.isArray(allCompanies?.clients)
      ? allCompanies.clients
      : [];
  return (
    list.find(
      (c: any) =>
        String(c?.id) === String(companyId) ||
        String(c?.PK) === String(companyId)
    ) || null
  );
}

type Props = {
  jobId: string;
  companyId?: string;
  companyName?: string;
  job: HiringManagerFields & { id?: string };
  /** Compact for sidebar; default full card */
  compact?: boolean;
};

export function JobHiringManagerCard({
  jobId,
  companyId,
  companyName,
  job,
  compact,
}: Props) {
  const updateJob = useUpdateJob();
  const { data: companyFromId } = useClient(companyId || '');
  const { data: allCompanies } = useClients();

  const company = useMemo(() => {
    if (companyFromId && Array.isArray(companyFromId.contacts)) {
      return companyFromId;
    }
    const fromList = findCompanyInList(allCompanies, companyId);
    if (fromList) return fromList;
    return companyFromId || null;
  }, [companyFromId, allCompanies, companyId]);

  const contacts = useMemo(() => contactsFromCompany(company), [company]);
  const [saving, setSaving] = useState(false);

  const currentId = job.hiringManagerContactId || '';
  const hasHm =
    !!(job.hiringManagerName || job.hiringManagerEmail || currentId);

  const applyContact = async (contactId: string) => {
    if (!jobId) return;
    setSaving(true);
    try {
      if (!contactId) {
        await updateJob.mutateAsync({
          jobId,
          jobData: {
            hiringManagerContactId: '',
            hiringManagerName: '',
            hiringManagerTitle: '',
            hiringManagerEmail: '',
            hiringManagerPhone: '',
          } as any,
        });
        return;
      }
      const c = contacts.find((x) => x.id === contactId);
      if (!c) {
        toast.error('Contact not found on this company');
        return;
      }
      await updateJob.mutateAsync({
        jobId,
        jobData: {
          hiringManagerContactId: c.id,
          hiringManagerName: c.name,
          hiringManagerTitle: c.title || '',
          hiringManagerEmail: c.email || '',
          hiringManagerPhone: c.phone || '',
        } as any,
      });
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update hiring manager');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section
      className={`bg-white border border-gray-200 rounded-2xl shadow-sm ${
        compact ? 'p-4' : 'p-5'
      }`}
    >
      <div className="flex items-center justify-between gap-2 mb-3">
        <h2 className="text-sm font-semibold tracking-wide text-gray-800 uppercase flex items-center gap-2">
          <UserCircle2 className="h-4 w-4 text-gray-500" />
          Hiring manager
        </h2>
        {hasHm && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-gray-500"
            disabled={saving}
            onClick={() => void applyContact('')}
            title="Clear hiring manager"
          >
            <X className="h-3.5 w-3.5 mr-1" />
            Clear
          </Button>
        )}
      </div>

      {!companyId ? (
        <p className="text-xs text-gray-500">
          Link this job to a company first, then pick a contact as hiring
          manager.
        </p>
      ) : (
        <>
          {hasHm ? (
            <div className="rounded-xl border border-violet-100 bg-violet-50/60 px-3 py-3 mb-3">
              <div className="flex items-start gap-2">
                <div className="h-9 w-9 shrink-0 rounded-full bg-violet-600 text-white flex items-center justify-center text-xs font-semibold">
                  {(job.hiringManagerName || '?')
                    .split(/\s+/)
                    .map((p) => p[0])
                    .join('')
                    .slice(0, 2)
                    .toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="font-medium text-sm text-gray-900 truncate">
                    {job.hiringManagerName || 'Contact'}
                  </div>
                  {job.hiringManagerTitle ? (
                    <div className="text-xs text-gray-600 truncate">
                      {job.hiringManagerTitle}
                    </div>
                  ) : null}
                  <div className="mt-1 flex flex-col gap-0.5 text-xs">
                    {job.hiringManagerEmail ? (
                      <a
                        href={`mailto:${job.hiringManagerEmail}`}
                        className="inline-flex items-center gap-1 text-blue-600 hover:underline truncate"
                      >
                        <Mail className="h-3 w-3 shrink-0" />
                        {job.hiringManagerEmail}
                      </a>
                    ) : null}
                    {job.hiringManagerPhone ? (
                      <a
                        href={`tel:${job.hiringManagerPhone}`}
                        className="inline-flex items-center gap-1 text-gray-700 hover:underline"
                      >
                        <Phone className="h-3 w-3 shrink-0" />
                        {job.hiringManagerPhone}
                      </a>
                    ) : null}
                  </div>
                  {currentId ? (
                    <Link
                      href={`/dashboard/contact-info/${currentId}`}
                      className="mt-1.5 inline-flex text-[11px] text-violet-700 hover:underline"
                    >
                      Open contact
                    </Link>
                  ) : null}
                </div>
              </div>
            </div>
          ) : (
            <p className="text-xs text-gray-500 mb-3">
              No hiring manager on this req yet. Choose a company contact below.
            </p>
          )}

          <label className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 block mb-1">
            {hasHm ? 'Change contact' : 'Select contact'}
          </label>
          <div className="flex gap-2 items-center">
            <SearchableSelect
              className="flex-1"
              value={currentId}
              disabled={saving || contacts.length === 0}
              onValueChange={(v) => void applyContact(v)}
              placeholder={
                contacts.length === 0
                  ? 'No contacts on company'
                  : 'Select hiring manager…'
              }
              searchPlaceholder="Search contacts…"
              options={contacts.map((c) => ({
                value: c.id,
                label: c.name + (c.isPrimary ? ' (Primary)' : ''),
                description: c.title || undefined,
                keywords: [c.name, c.title, c.email, c.phone]
                  .filter(Boolean)
                  .join(' '),
              }))}
            />
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin text-gray-400 shrink-0" />
            ) : null}
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="outline" size="sm" className="h-8 text-xs" asChild>
              <Link
                href={
                  companyId
                    ? `/dashboard/companies/${companyId}?tab=contacts`
                    : '/dashboard/companies'
                }
              >
                <User className="h-3.5 w-3.5 mr-1.5" />
                {contacts.length === 0 ? 'Add contact on company' : 'Manage contacts'}
              </Link>
            </Button>
            {companyId ? (
              <Button variant="ghost" size="sm" className="h-8 text-xs" asChild>
                <Link href={`/dashboard/companies/${companyId}`}>
                  <Building2 className="h-3.5 w-3.5 mr-1.5" />
                  {companyName || 'Company'}
                </Link>
              </Button>
            ) : null}
          </div>
        </>
      )}
    </section>
  );
}

/** Controlled picker for create/edit forms (no auto-save). */
export function HiringManagerSelect({
  companyId,
  valueContactId,
  onChange,
  disabled,
}: {
  companyId?: string;
  valueContactId?: string;
  onChange: (fields: HiringManagerFields) => void;
  disabled?: boolean;
}) {
  const { data: companyFromId, isLoading: loadingDetail } = useClient(
    companyId || ''
  );
  const { data: allCompanies, isLoading: loadingList } = useClients();

  const company = useMemo(() => {
    // Prefer detail (freshest), fall back to list match
    if (companyFromId && Array.isArray(companyFromId.contacts)) {
      return companyFromId;
    }
    const fromList = findCompanyInList(allCompanies, companyId);
    if (fromList) return fromList;
    return companyFromId || null;
  }, [companyFromId, allCompanies, companyId]);

  const contacts = useMemo(() => contactsFromCompany(company), [company]);
  const loading = !!(companyId && (loadingDetail || loadingList));

  if (!companyId) {
    return (
      <p className="text-xs text-muted-foreground">
        Select a company first to choose a contact.
      </p>
    );
  }

  return (
    <div className="space-y-1.5">
      <SearchableSelect
        value={valueContactId || ''}
        disabled={disabled || loading || contacts.length === 0}
        placeholder={
          contacts.length === 0
            ? loading
              ? 'Loading contacts…'
              : 'No contacts on company'
            : 'Select hiring manager…'
        }
        searchPlaceholder="Search contacts…"
        options={contacts.map((c) => ({
          value: c.id,
          label: c.name + (c.isPrimary ? ' (Primary)' : ''),
          description: c.title || undefined,
          keywords: [c.name, c.title, c.email, c.phone]
            .filter(Boolean)
            .join(' '),
        }))}
        onValueChange={(id) => {
          if (!id) {
            onChange({
              hiringManagerContactId: '',
              hiringManagerName: '',
              hiringManagerTitle: '',
              hiringManagerEmail: '',
              hiringManagerPhone: '',
            });
            return;
          }
          const c = contacts.find((x) => x.id === id);
          if (!c) return;
          onChange({
            hiringManagerContactId: c.id,
            hiringManagerName: c.name,
            hiringManagerTitle: c.title || '',
            hiringManagerEmail: c.email || '',
            hiringManagerPhone: c.phone || '',
          });
        }}
      />
      {!loading && contacts.length === 0 && (
        <Link
          href={`/dashboard/companies/${companyId}?tab=contacts`}
          className="text-xs text-blue-600 hover:underline"
        >
          Add a contact on the company first
        </Link>
      )}
      {valueContactId && contacts.some((c) => c.id === valueContactId) && (
        <p className="text-xs text-muted-foreground">
          Selected:{' '}
          <span className="font-medium text-foreground">
            {contacts.find((c) => c.id === valueContactId)?.name}
          </span>
        </p>
      )}
    </div>
  );
}
