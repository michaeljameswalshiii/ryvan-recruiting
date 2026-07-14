import { notFound } from "next/navigation";
import { CandidateDetailClient } from "@/components/candidate/CandidateDetailClient";
import { getLeadById } from "@/lib/db/repositories/lead-repository";
import { getSessionTenantId } from "@/lib/server-auth";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function CandidateDetailPage({ params }: Props) {
  const { id } = await params;

  const tenantId = await getSessionTenantId();
  if (!tenantId) {
    notFound();
  }

  const candidate = await getLeadById(tenantId, id);
  if (!candidate) {
    notFound();
  }

  const c = candidate as any;

  const candidateData = {
    id: (c.id || "") as string,
    name: (c.name || "") as string,
    email: (c.email || "") as string,
    phone: (c.phone || "") as string,
    title: (c.title || "") as string,
    location: (c.location || "") as string,
    fullAddress: (c.full_address || c.fullAddress || "") as string,
    salaryRequirements: (c.salary_requirements || c.salaryRequirements || "") as string,
    status: (c.status || "identification") as string,
    source: (c.source || "Manual") as string,
    createdAt: (c.created_at || c.createdAt || "") as string,
    modifiedAt: (c.modified_at || c.modifiedAt || "") as string,
    linkedin: (c.linkedin_url || c.linkedin || "") as string,
    resumeUrl: (c.resume_url || c.resumeUrl || "") as string,
    resumeFileName: (c.resume_file_name || c.resumeFileName || "") as string,
    resumeKey: (c.resume_key || c.resumeKey || c.resume_s3_key || "") as string,
    summary: (c.summary || "") as string,
    company: (c.company || c.companyName || c.current_company || "") as string,
    skills: Array.isArray(c.skills)
      ? c.skills.filter((s: any) => typeof s === "string")
      : typeof c.skills === "string"
        ? c.skills
            .split(",")
            .map((s: string) => s.trim())
            .filter(Boolean)
        : [],
    experience: Array.isArray(c.experience) ? c.experience : [],
    education: Array.isArray(c.education) ? c.education : [],
    certifications: Array.isArray(c.certifications) ? c.certifications : [],
    linkedJobs: Array.isArray(c.linkedJobs) ? c.linkedJobs : [],
  };

  return <CandidateDetailClient candidate={candidateData} />;
}
