import { notFound } from "next/navigation";
import ContactDetailClient from "@/components/contact/ContactDetailClient";
import { getAllClients } from "@/lib/db/repositories/client-repository";
import { getSessionTenantId } from "@/lib/server-auth";

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

  // Force fresh data - no cache
  const clients = await getAllClients(tenantId);

  for (const client of clients) {
    const found = client.contacts?.find((c: any) => c.id === contactId);
    if (found) {
      contact = found;
      companyName = client.name || "";
      companyId = client.id;
      break;
    }
  }

  if (!contact) {
    console.error(`Contact not found: ${contactId}`);
    notFound();
  }

  const contactData = {
    ...contact,
    companyId,
    companyName,
    notes: Array.isArray(contact.notes) ? contact.notes : [],
  };

  return <ContactDetailClient contact={contactData} />;
}
