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
  const companyJobs = allJobs
    .filter((job: any) => job.companyId === companyId && job.status !== "Closed")
    .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 10)
    .map((job: any) => ({
      ...job,
      createdAt: job.createdAt instanceof Date ? job.createdAt.toISOString() : job.createdAt,
      updatedAt: job.updatedAt instanceof Date ? job.updatedAt.toISOString() : job.updatedAt,
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
