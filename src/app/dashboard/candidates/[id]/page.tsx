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
  // Note: DynamoDB uses snake_case, client component expects camelCase
  const candidateData = {
    id: candidate.id || "",
    name: candidate.name || "",
    email: candidate.email || "",
    phone: candidate.phone || "",
    title: candidate.title || "",
    location: candidate.location || "Orlando, FL",
    status: candidate.status || "Identified",
    source: candidate.source || "",
    createdAt: candidate.created_at || "",
    // Additional fields from Lead (map snake_case to camelCase)
    linkedin: candidate.linkedin_url || "",
    resumeUrl: candidate.resume_url || "",
    resumeFileName: candidate.resume_file_name || "",
    // All parsed fields
    skills: typeof candidate.skills === 'string' ? candidate.skills.split(',').map(s => s.trim()).filter(Boolean) : (candidate.skills || []),
  };

  return <CandidateDetailClient candidate={candidateData} />;
}
