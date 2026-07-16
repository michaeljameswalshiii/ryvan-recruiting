/**
 * Legacy route: /candidates/[id] → /dashboard/candidates/[id]
 * Keeps old links working and avoids layout/chrome drift.
 */

import { redirect } from "next/navigation";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function LegacyCandidateDetailRedirect({
  params,
}: PageProps) {
  const { id } = await params;
  redirect(`/dashboard/candidates/${id}`);
}
