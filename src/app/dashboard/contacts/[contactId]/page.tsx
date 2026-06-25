﻿import { notFound } from "next/navigation";
import ContactDetailClient from "@/components/contact/ContactDetailClient";
import { getClientByIdAction } from "@/lib/actions/client-actions";
import { getAllJobs } from "@/lib/db/repositories/job-repository";
import { getSessionTenantId, getSessionUserId } from "@/lib/server-auth";

export const revalidate = 0;

interface Props {
  params: Promise<{ contactId: string }>;
}

export default async function ContactDetailPage({ params }: Props) {
  const { contactId } = await params;

  // Get tenant resolved properly via session
  let tenantId = await getSessionTenantId();
  const userId = await getSessionUserId();

  // If no tenantId but user is logged in, use default tenant
  if (!tenantId && userId) {
    tenantId = `tenant-${userId}`;
  }

  // Try multiple tenant formats to find the contact (handles legacy data migration)
  const tenantsToTry: string[] = [];
  
  if (tenantId) tenantsToTry.push(tenantId);
  if (userId) {
    const userTenant = `tenant-${userId}`;
    if (!tenantsToTry.includes(userTenant)) tenantsToTry.push(userTenant);
    if (!tenantsToTry.includes(userId)) tenantsToTry.push(userId);
  }
  if (!tenantsToTry.includes('default')) tenantsToTry.push('default');
  
  const uniqueTenants = [...new Set(tenantsToTry)].filter(Boolean);

  let contact: any = null;
  let companyName = "";
  let companyId = "";
  let clientData: any = null;

  // Search across clients for the contact (until we have dedicated getContactById)
  for (const tenant of uniqueTenants) {
    const result = await getClientByIdAction(contactId);
    
    if (result.client) {
      // Check if this client has the contact
      const found = result.client.contacts?.find((c: any) => c.id === contactId);
      if (found) {
        contact = found;
        companyName = result.client.name || "";
        companyId = result.client.id;
        clientData = result.client;
        break;
      }
    }
  }

  // If not found via getClientByIdAction, try the old approach of iterating all clients
  if (!contact) {
    for (const tenant of uniqueTenants) {
      const { getAllClients } = await import("@/lib/db/repositories/client-repository");
      const clients = await getAllClients(tenant);
      
      for (const client of clients) {
        const found = client.contacts?.find((c: any) => c.id === contactId);
        if (found && client.id) {
          contact = found;
          companyName = client.name ?? "";
          companyId = client.id;
          clientData = client;
          break;
        }
      }
      if (contact) break;
    }
  }

  if (!contact) {
    notFound();
  }

  // Get jobs for this company
  let companyJobs: any[] = [];
  for (const tenant of uniqueTenants) {
    try {
      const allJobs = await getAllJobs(tenant);
      companyJobs = allJobs
        .filter((job: any) => job.companyId === companyId && job.status !== "Closed")
        .sort((a: any, b: any) => {
          const timeA = a.created_at || a.createdAt ? new Date(a.created_at || a.createdAt).getTime() : 0;
          const timeB = b.created_at || b.createdAt ? new Date(b.created_at || b.createdAt).getTime() : 0;
          return timeB - timeA;
        })
        .slice(0, 10)
        .map((job: any) => JSON.parse(JSON.stringify(job)));
      if (companyJobs.length > 0) break;
    } catch {
      // Continue to next tenant if there's an error
      continue;
    }
  }

  // Add company info to contact
  const contactData = {
    ...JSON.parse(JSON.stringify(contact)),
    companyName,
    companyId,
  };

  return (
    <ContactDetailClient 
      contact={contactData} 
      companyJobs={companyJobs} 
      companyName={companyName}
    />
  );
}
