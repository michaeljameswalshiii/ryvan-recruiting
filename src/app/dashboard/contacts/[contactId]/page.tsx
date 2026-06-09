import { notFound } from "next/navigation";
import { ContactDetailClient } from "@/components/contact/ContactDetailClient";
import { getAllClients } from "@/lib/db/repositories/client-repository";
import { getSessionTenantId } from "@/lib/server-auth";

interface Props {
  params: { contactId: string };
}

export default async function ContactDetailPage({ params }: Props) {
  // Get tenant from session
  const tenantId = await getSessionTenantId();
  if (!tenantId) {
    notFound();
  }

  const { contactId } = params;

  // Get all clients to search for the contact
  const clients = await getAllClients(tenantId);
  
  // Find the contact by searching through all clients' contacts
  let contact: any = null;
  let companyId: string = "";
  let companyName: string = "";
  
  for (const client of clients) {
    if (client.contacts && client.contacts.length > 0) {
      const foundContact = client.contacts.find((c: any) => c.id === contactId);
      if (foundContact) {
        contact = foundContact;
        companyId = client.id;
        companyName = client.name;
        break;
      }
    }
  }

  if (!contact) {
    notFound();
  }

  // Map contact to compatible format for client component
  const contactData = {
    id: contact.id || "",
    name: contact.name || "",
    email: contact.email || "",
    phone: contact.phone || "",
    title: contact.title || "",
    isPrimary: contact.isPrimary || false,
    notes: contact.notes || "",
    createdAt: contact.createdAt || "",
    updatedAt: contact.updatedAt || "",
    // Company info
    companyId: companyId,
    companyName: companyName || "",
    // Additional fields that might be on the contact
    linkedin: (contact as any).linkedin || "",
    location: (contact as any).location || "",
    source: (contact as any).source || "",
  };

  return <ContactDetailClient contact={contactData} />;
}
