'use client';

import { useEffect, useState } from 'react';
import { notFound, useParams } from 'next/navigation';
import ContactDetailClient from "@/components/contact/ContactDetailClient";
import { getAllClients } from "@/lib/db/repositories/client-repository";
import { getAllJobs } from "@/lib/db/repositories/job-repository";

// Temporary client-safe tenant ID (you can improve this later)
const getClientTenantId = () => {
  // For now, we'll use a default or session storage fallback
  // Replace this with your actual auth logic later
  return "default-tenant"; // ← Change this if you have a better way
};

export default function ContactDetailPage() {
  const params = useParams();
  const contactId = params.contactId as string;

  const [contactData, setContactData] = useState<any>(null);
  const [companyJobs, setCompanyJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        const tenantId = getClientTenantId();
        if (!tenantId) {
          setError("No tenant ID found");
          return;
        }

        const clients = await getAllClients(tenantId);
        let contact: any = null;
        let companyId = "";

        for (const client of clients) {
          const found = client.contacts?.find((c: any) => c.id === contactId);
          if (found) {
            contact = found;
            companyId = client.id;
            break;
          }
        }

        if (!contact) {
          notFound();
          return;
        }

        const allJobs = await getAllJobs(tenantId);
        const filteredJobs = allJobs
          .filter((job: any) => job.companyId === companyId && job.status !== "Closed")
          .slice(0, 10);

        setContactData(contact);
        setCompanyJobs(filteredJobs);
      } catch (err: any) {
        console.error("Error loading contact:", err);
        setError("Failed to load contact data");
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [contactId]);

  if (loading) return <div className="p-12 text-center text-lg">Loading contact...</div>;
  if (error) return <div className="p-12 text-center text-red-600">{error}</div>;
  if (!contactData) return <div className="p-12 text-center">Contact not found</div>;

  return <ContactDetailClient contact={contactData} companyJobs={companyJobs} />;
}
