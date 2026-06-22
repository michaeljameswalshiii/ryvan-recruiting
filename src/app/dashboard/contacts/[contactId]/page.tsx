﻿import { notFound } from "next/navigation";
import ContactDetailClient from "@/components/contact/ContactDetailClient";
import { getAllClients } from "@/lib/db/repositories/client-repository";
import { getAllJobs } from "@/lib/db/repositories/job-repository";

export const revalidate = 0;

interface Props {
  params: Promise<{ contactId: string }>;
}

export default async function ContactDetailPage({ params }: Props) {
  const { contactId } = await params;
  // Use hardcoded default tenant (same pattern that worked before)
  const tenantId = "default-tenant";

  let contact: any = null;
  let companyName = "";
  let companyId: string = "";

  const clients = await getAllClients(tenantId);

  for (const client of clients) {
    const found = client.contacts?.find((c: any) => c.id === contactId);
    if (found && client.id) {
      contact = found;
      companyName = client.name ?? "";
      companyId = client.id;
      break;
    }
  }

  if (!contact) notFound();

  const allJobs = await getAllJobs(tenantId);

  // === FIXED: Safe sorting without leaking Date objects ===
  const companyJobs = allJobs
    .filter((job: any) => job.companyId === companyId && job.status !== "Closed")
    .sort((a: any, b: any) => {
      const timeA = a.created_at || a.createdAt ? new Date(a.created_at || a.createdAt).getTime() : 0;
      const timeB = b.created_at || b.createdAt ? new Date(b.created_at || b.createdAt).getTime() : 0;
      return timeB - timeA;
    })
    .slice(0, 10)
    .map((job: any) => JSON.parse(JSON.stringify(job))); // Ultimate safe conversion

  const contactData = JSON.parse(JSON.stringify(contact));

  return <ContactDetailClient contact={contactData} companyJobs={companyJobs} />;
}
