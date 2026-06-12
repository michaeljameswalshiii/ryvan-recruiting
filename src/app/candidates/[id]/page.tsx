/**
 * Candidate Detail Page
 * Fetches candidate data including linkedJobs with stages
 * 
 * @serverOnly
 */

import { redirect } from "next/navigation";
import { getSessionTenantId } from "@/lib/server-auth";
import { getLeadById } from "@/lib/db/repositories/lead-repository";
import { getStageLabel, getStageColor } from "@/lib/schemas/lead";
import CandidateDetailClient from "@/components/candidate/CandidateDetailClient";

interface PageProps {
  params: Promise<{ id: string }>;
}

/**
 * Get stage label from linkedJobs for display
 * Priority: first linked job's stage, fallback to legacy status
 */
function getPrimaryStageDisplay(lead: any): { label: string; color: string } {
  // NEW: Read from linkedJobs array
  if (lead.linkedJobs && lead.linkedJobs.length > 0) {
    const firstJob = lead.linkedJobs[0];
    if (firstJob.stage) {
      return {
        label: getStageLabel(firstJob.stage),
        color: getStageColor(firstJob.stage),
      };
    }
  }
  
  // Fallback to legacy status
  return {
    label: lead.status || "New",
    color: "gray",
  };
}

/**
 * Server Component - Fetches candidate data and renders client component
 */
export default async function CandidateDetailPage({ params }: PageProps) {
  const { id } = await params;
  
  // Get tenant for auth
  const tenantId = await getSessionTenantId();
  
  if (!tenantId) {
    redirect("/login");
  }

  // Get lead from repository - includes linkedJobs with stages
  const lead = await getLeadById(tenantId, id);
  
  if (!lead) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold">Candidate Not Found</h1>
        <p className="text-muted-foreground mt-2">
          The candidate you're looking for doesn't exist or has been deleted.
        </p>
      </div>
    );
  }

  // Get primary stage for header display
  const stageDisplay = getPrimaryStageDisplay(lead);

  // Transform lead data for client component
  const candidateData = {
    id: lead.id,
    tenantId: lead.tenant_id,
    name: lead.name,
    email: lead.email || "",
    phone: lead.phone || "",
    title: lead.title || "",
    company: (lead as any).company,
    location: lead.location || "",
    fullAddress: (lead as any).full_address,
    salaryRequirements: (lead as any).salary_requirements,
    linkedin: lead.linkedin_url || "",
    resumeUrl: lead.resume_url || "",
    resumeFileName: (lead as any).resume_file_name,
    source: lead.source || "",
    status: stageDisplay.label, // Use linkedJobs stage for display
    stageColor: stageDisplay.color,
    summary: (lead as any).summary,
    skills: (lead as any).skills || [],
    experience: (lead as any).experience || [],
    education: (lead as any).education || [],
    certifications: (lead as any).certifications || [],
    notes: lead.notes || "",
    createdAt: lead.created_at || new Date().toISOString(),
    modifiedAt: lead.modified_at,
    // NEW: Include linkedJobs for application-centric model
    linkedJobs: lead.linkedJobs || [],
    // Legacy: also include linkedJobIds for backward compatibility
    linkedJobIds: lead.linkedJobIds || [],
  };

  return <CandidateDetailClient candidate={candidateData} />;
}
