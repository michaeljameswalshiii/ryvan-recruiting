import { notFound } from "next/navigation";
import CandidateDetailClient from "@/components/candidate/CandidateDetailClient";   // ← Default import (important!)
import { getLeadById } from "@/lib/db/repositories/lead-repository";
import { getSessionTenantId } from "@/lib/server-auth";

interface Props {
  params: { id: string };
}

export default async function CandidateDetailPage({ params }: Props) {
  const tenantId = await getSessionTenantId();
  
  if (!tenantId) {
    notFound();
  }

  const candidate = await getLeadById(tenantId, params.id);

  if (!candidate) {
    notFound();
  }

  return <CandidateDetailClient candidate={candidate} />;
}
