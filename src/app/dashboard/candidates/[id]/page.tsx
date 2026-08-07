import { notFound } from "next/navigation";
import { CandidateDetailClient } from "@/components/candidate/CandidateDetailClient";
import { getLeadById } from "@/lib/db/repositories/lead-repository";
import { getSessionTenantId } from "@/lib/server-auth";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ jobId?: string }>;
}

export default async function CandidateDetailPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { jobId } = await searchParams;

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
    avatarUrl: (c.avatar_url || c.avatarUrl || "") as string,
    resumeUrl: (c.resume_url || c.resumeUrl || "") as string,
    resumeFileName: (c.resume_file_name || c.resumeFileName || "") as string,
    // Prefer explicit key; careers applies store the S3 key in resume_url
    resumeKey: (c.resume_key ||
      c.resumeKey ||
      c.resume_s3_key ||
      (typeof c.resume_url === "string" &&
      c.resume_url &&
      !c.resume_url.startsWith("http")
        ? c.resume_url
        : "") ||
      "") as string,
    summary: (c.summary || "") as string,
    /** Profile notes field (includes careers apply message) */
    notes: (c.notes || "") as string,
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

  return (
    <CandidateDetailClient
      candidate={candidateData}
      initialJobId={jobId || ""}
    />
  );
}
