import { notFound } from "next/navigation";
import ContactDetailClient from "@/components/contact/ContactDetailClient";
import { getAllClients } from "@/lib/db/repositories/client-repository";
import { getAllJobs } from "@/lib/db/repositories/job-repository";
import { getSessionTenantId } from "@/lib/server-auth";

export default async function ContactDetailPage({ params }: { params: { contactId: string } }) {
  const tenantId = await getSessionTenantId();
  if (!tenantId) notFound();

  const clients = await getAllClients(tenantId);
  
  let contact: any = null;
  let companyId = "";

  for (const client of clients) {
    const found = client.contacts?.find((c: any) => c.id === params.contactId);
    if (found) {
      contact = found;
      companyId = client.id;
      break;
    }
  }

  if (!contact) notFound();

  const allJobs = await getAllJobs(tenantId);
  const companyJobs = allJobs.filter((job: any) => job.companyId === companyId);

  return <ContactDetailClient contact={contact} companyJobs={companyJobs} />;
}
