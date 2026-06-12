import { notFound } from "next/navigation";
import { ContactDetailClient } from "@/components/contact/ContactDetailClient";
import { getClientById } from "@/lib/db/repositories/client-repository";
import { getSessionTenantId } from "@/lib/server-auth";

interface Props {
  params: { contactId: string };
  searchParams: { companyId?: string };
}

export default async function ContactDetailPage({ params, searchParams }: Props) {
  // Get tenant from session
  const tenantId = await getSessionTenantId();
  if (!tenantId) {
    notFound();
  }

  const { contactId } = params;
  const companyIdParam = searchParams.companyId;

  let contact: any = null;
  let companyId = "";
  let companyName = "";

  // If companyId is provided, fetch that specific client (more efficient)
  if (companyIdParam) {
    const client = await getClientById(tenantId, companyIdParam);
    if (client && client.contacts && client.contacts.length > 0) {
      const foundContact = client.contacts.find((c: any) => c.id === contactId);
      if (foundContact) {
        contact = foundContact;
        companyId = client.id;
        companyName = client.name;
      }
    }
  }

  // Fallback: If not found via companyId, search all clients (less efficient but works)
  if (!contact && !companyIdParam) {
    console.log('[ContactDetailPage] No companyId provided, searching all clients');
    // Dynamic import to avoid issues
    const { getAllClients } = await import('@/lib/db/repositories/client-repository');
    const clients = await getAllClients(tenantId);
    
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
  }

  if (!contact) {
    console.log('[ContactDetailPage] Contact not found:', { contactId, companyIdParam });
    notFound();
  }

// Map contact to compatible format for client component
  const contactData = {
    id: contact.id || "",
    name: contact.name || "",
    email: contact.email || "",
    phone: contact.phone || "",
    phones: contact.phones || [],
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

  console.log('[ContactDetailPage] Found contact:', contactData.name, 'at company:', companyName);

  return <ContactDetailClient contact={contactData} />;
}
