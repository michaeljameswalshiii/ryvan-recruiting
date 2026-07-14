'use client';

import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useClients } from '@/lib/hooks/query-client';
import ContactDetailClient from '@/components/contact/ContactDetailClient';
import { Loader2 } from 'lucide-react';

/**
 * Contact Info detail — uses shared ContactDetailClient
 * (same aesthetics as Candidate detail).
 */
export default function ContactInfoDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const id = params.id as string;
  const companyIdParam = searchParams.get('companyId') || '';

  const { data: clientsData, isLoading } = useClients();
  const [companyJobs, setCompanyJobs] = useState<any[]>([]);

  const companies = useMemo(() => {
    if (Array.isArray(clientsData)) return clientsData;
    if (clientsData && Array.isArray((clientsData as any).clients)) {
      return (clientsData as any).clients;
    }
    return [];
  }, [clientsData]);

  const { contact, companyName, companyId } = useMemo(() => {
    let foundContact: any = null;
    let foundCompany: any = null;

    if (companyIdParam) {
      const company = companies.find(
        (c: any) =>
          String(c.id) === String(companyIdParam) ||
          String(c.PK) === String(companyIdParam)
      );
      if (company) {
        const match = (company.contacts || []).find(
          (c: any) => String(c.id) === String(id)
        );
        if (match) {
          foundContact = match;
          foundCompany = company;
        }
      }
    }

    if (!foundContact) {
      for (const company of companies) {
        const companyContacts = Array.isArray(company.contacts)
          ? company.contacts
          : [];
        const match = companyContacts.find(
          (c: any) => String(c.id) === String(id)
        );
        if (match) {
          foundContact = match;
          foundCompany = company;
          break;
        }
      }
    }

    if (!foundContact) {
      return { contact: null, companyName: '', companyId: '' };
    }

    const cid = foundCompany?.id || foundCompany?.PK || companyIdParam || '';
    return {
      contact: {
        ...foundContact,
        companyName: foundCompany?.name || foundCompany?.companyName || '—',
        clientId: cid,
        companyId: cid,
      },
      companyName: foundCompany?.name || foundCompany?.companyName || '—',
      companyId: cid,
    };
  }, [companies, id, companyIdParam]);

  // Load open jobs for company
  useEffect(() => {
    if (!companyId) {
      setCompanyJobs([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/data/jobs');
        if (!res.ok) return;
        const data = await res.json();
        const jobs = Array.isArray(data.jobs)
          ? data.jobs
          : Array.isArray(data)
            ? data
            : [];
        const open = jobs.filter(
          (j: any) =>
            String(j.companyId) === String(companyId) &&
            String(j.status || 'Open').toLowerCase() !== 'closed'
        );
        if (!cancelled) setCompanyJobs(open);
      } catch {
        if (!cancelled) setCompanyJobs([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-500">
        <Loader2 className="h-6 w-6 animate-spin mr-2" />
        Loading contact...
      </div>
    );
  }

  if (!contact) {
    return (
      <div className="max-w-7xl mx-auto py-8">
        <Link
          href="/dashboard/contact-info"
          className="text-blue-600 hover:underline mb-6 inline-block text-sm"
        >
          ← Back to Contacts
        </Link>
        <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center shadow-sm">
          <h2 className="text-xl font-semibold text-gray-900">
            Contact not found
          </h2>
          <p className="text-sm text-gray-500 mt-2">
            The contact ID may be invalid or deleted.
          </p>
        </div>
      </div>
    );
  }

  return (
    <ContactDetailClient
      contact={contact}
      companyJobs={companyJobs}
      companyName={companyName}
    />
  );
}
