/**
 * Candidate Edit Page
 * Edit an existing candidate
 */

import { notFound } from "next/navigation";
import { getLeadById } from "@/lib/db/repositories/lead-repository";
import { getSessionTenantId } from "@/lib/server-auth";
import CandidateEditForm from "@/components/candidate/CandidateEditForm";

export const metadata = {
  title: "Edit Candidate - Turnkey Optimization",
  description: "Edit candidate details",
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function CandidateEditPage({ params }: PageProps) {
  const { id } = await params;
  const tenantId = await getSessionTenantId();

  if (!tenantId) {
    return (
      <div className="p-6">
        <p className="text-red-600">Unauthorized</p>
      </div>
    );
  }

  // Fetch candidate from database
  const candidate = await getLeadById(tenantId, id);

  if (!candidate) {
    notFound();
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <CandidateEditForm candidate={candidate} />
    </div>
  );
}
