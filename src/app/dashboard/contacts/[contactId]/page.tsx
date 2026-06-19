import { notFound } from "next/navigation";
import ContactDetailClient from "@/components/contact/ContactDetailClient";
import { getAllClients } from "@/lib/db/repositories/client-repository";
import { getAllJobs } from "@/lib/db/repositories/job-repository";
import { getSessionTenantId } from "@/lib/server-auth";

export const revalidate = 0;

interface Props {
  params: Promise<{ contactId: string }>;
}

export default async function ContactDetailPage({ params }: Props) {
  const { contactId } = await params;
  const tenantId = await getSessionTenantId();

  if (!tenantId) notFound();

  let contact: any = null;
  let companyName = "";
  let companyId = "";

  const clients = await getAllClients(tenantId);

  for (const client of clients) {
    const found = client.contacts?.find((c: any) => c.id === contactId);
    if (found) {
      contact = found;
      companyName = client.name ?? "";
      companyId = client.id;
      break;
    }
  }

  if (!contact) {
    console.error(`Contact not found: ${contactId}`);
    notFound();
  }

const allJobs = await getAllJobs(tenantId);
  // Use correct property names from Job schema: created_at and modified_at
  const companyJobs = allJobs
    .filter((job: any) => job.companyId === companyId && job.status !== "Closed")
    .sort((a: any, b: any) => new Date(b.created_at || b.createdAt).getTime() - new Date(a.created_at || a.createdAt).getTime())
    .slice(0, 10)
    .map((job: any) => ({
      ...job,
      // Handle both created_at (schema) and createdAt (fallback)
      created_at: job.created_at instanceof Date ? job.created_at.toISOString() : (job.created_at || job.createdAt),
      modified_at: job.modified_at instanceof Date ? job.modified_at.toISOString() : (job.modified_at || job.updatedAt),
    }));

  const contactData = {
    ...contact,
    companyId,
    companyName,
    notes: Array.isArray(contact.notes) ? contact.notes : [],
    createdAt: contact.createdAt instanceof Date ? contact.createdAt.toISOString() : contact.createdAt,
    updatedAt: contact.updatedAt instanceof Date ? contact.updatedAt.toISOString() : contact.updatedAt,
  };

  return <ContactDetailClient contact={contactData} companyJobs={companyJobs} />;
}
