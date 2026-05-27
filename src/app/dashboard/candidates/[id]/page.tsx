import { notFound } from "next/navigation";
import { CandidateDetailClient } from "@/components/candidate/CandidateDetailClient";
import { getLeadById } from "@/lib/db/repositories/lead-repository";
import { getSessionTenantId } from "@/lib/server-auth";

interface Props {
  params: { id: string };
}

export default async function CandidateDetailPage({ params }: Props) {
  // Get tenant from session
  const tenantId = await getSessionTenantId();
  if (!tenantId) {
    notFound();
  }

  // Get candidate directly from repository (server-side)
  const candidate = await getLeadById(tenantId, params.id);
  if (!candidate) {
    notFound();
  }

// Map Lead to compatible format for client component
  const candidateData = {
    id: candidate.id || "",
    name: candidate.name || "",
    email: candidate.email || "",
    phone: candidate.phone || "",
    title: candidate.title || "",
    company: candidate.location || "", // location maps to company display
    status: candidate.status || "identification",
    source: candidate.source || "",
    createdAt: candidate.created_at || "",
    // Additional fields from Lead
    linkedin: candidate.linkedin_url || "",
    resumeUrl: candidate.resume_url || "",
    notes: candidate.notes || "",
  };

  return <CandidateDetailClient candidate={candidateData} />;
}
