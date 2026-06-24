import { notFound } from "next/navigation";
import { CandidateDetailClient } from "@/components/candidate/CandidateDetailClient";
import { getLeadById } from "@/lib/db/repositories/lead-repository";
import { getSessionTenantId } from "@/lib/server-auth";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function CandidateDetailPage({ params }: Props) {
  const { id } = await params;
  
  // Get tenant from session
  const tenantId = await getSessionTenantId();
  if (!tenantId) {
    notFound();
  }

  // Get candidate directly from repository (server-side)
  const candidate = await getLeadById(tenantId, id);
  if (!candidate) {
    notFound();
  }

// Map Lead to compatible format for client component
  // Note: DynamoDB uses snake_case, client component expects camelCase
  // Defensive: ensure all values are strings or arrays, never objects
  const candidateData = {
    id: (candidate.id || "") as string,
    name: (candidate.name || "") as string,
    email: (candidate.email || "") as string,
    phone: (candidate.phone || "") as string,
    title: (candidate.title || "") as string,
    location: (candidate.location || "Orlando, FL") as string,
    status: (candidate.status || "Identified") as string,
    source: (candidate.source || "") as string,
    createdAt: (candidate.created_at || "") as string,
    // Additional fields from Lead (map snake_case to camelCase)
    linkedin: (candidate.linkedin_url || "") as string,
    resumeUrl: (candidate.resume_url || "") as string,
    resumeFileName: (candidate.resume_file_name || "") as string,
    // All parsed fields - ensure array
    skills: Array.isArray(candidate.skills) 
      ? candidate.skills.filter((s: any) => typeof s === 'string') 
      : typeof candidate.skills === 'string' 
        ? candidate.skills.split(',').map((s: string) => s.trim()).filter(Boolean)
        : [],
  };

  return <CandidateDetailClient candidate={candidateData} />;
}
