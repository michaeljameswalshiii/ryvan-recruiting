import { notFound } from "next/navigation";
import ContactDetailClient from "@/components/contact/ContactDetailClient";
import { getClientById, getAllClients } from "@/lib/db/repositories/client-repository";
import { getSessionTenantId } from "@/lib/server-auth";

interface Props {
  params: Promise<{ contactId: string }>;
  searchParams: { companyId?: string };
}

export default async function ContactDetailPage({ params, searchParams }: Props) {
  const { contactId } = await params;
  const tenantId = await getSessionTenantId();
  
  if (!tenantId) notFound();

  let contact: any = null;
  let companyName = "";
  let companyId = searchParams.companyId || "";

  // Try direct lookup via companyId if provided
  if (companyId) {
    const client = await getClientById(tenantId, companyId);
    if (client?.contacts) {
      contact = client.contacts.find((c: any) => c.id === contactId);
      companyName = client.name || "";
    }
  }

  // Fallback: Search across all companies
  if (!contact) {
    const clients = await getAllClients(tenantId);
    
    for (const client of clients) {
      if (client.contacts && client.contacts.length > 0) {
        const found = client.contacts.find((c: any) => c.id === contactId);
        if (found) {
          contact = found;
          companyName = client.name || "";
          companyId = client.id;
          break;
        }
      }
    }
  }

  if (!contact) {
    console.error(`Contact not found: ${contactId}`);
    notFound();
  }

  // Prepare data for client component
  const contactData = {
    ...contact,
    companyName,
    companyId,
  };

return <ContactDetailClient contactId={contact.id} />;
}
