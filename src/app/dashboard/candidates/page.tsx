import { notFound } from "next/navigation";
import CandidateDetailClient from "@/components/candidate/CandidateDetailClient"; // ← Default import (this is the important fix)

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

  // Pass clean data to the client component
  const candidateData = {
    id: candidate.id || "",
    name: candidate.name || "",
    email: candidate.email || "",
    phone: candidate.phone || "",
    title: candidate.title || "",
    location: candidate.location || "Orlando, FL",
    resumeUrl: candidate.resumeUrl || "",
    resumeFileName: candidate.resumeFileName || "",
  };

  return <CandidateDetailClient candidate={candidateData} />;
}
