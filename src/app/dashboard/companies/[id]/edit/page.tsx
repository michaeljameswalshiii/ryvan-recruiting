"use client";

import { useParams, useRouter } from "next/navigation";
import { useClient } from "@/lib/hooks/query-client";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import CompanyEditModal from "@/components/company/CompanyEditModal";

export default function CompanyEditPage() {
  const params = useParams();
  const router = useRouter();
  const clientId = params.id as string;

  const { data: company, isLoading, error } = useClient(clientId);

  if (isLoading) {
    return (
      <div className="p-8 space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <Skeleton className="h-8 w-48" />
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (error || !company) {
    return (
      <div className="p-8">
        <Link href="/dashboard/companies">
          <Button variant="ghost" className="mb-4">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Companies
          </Button>
        </Link>
        <div className="p-6 rounded-lg border border-destructive/50 bg-destructive/10">
          <h2 className="text-lg font-semibold text-destructive">Company Not Found</h2>
          <p className="text-muted-foreground mt-1">
            {error?.message || "The company you're looking for doesn't exist."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-6">
        <Link href={`/dashboard/companies/${clientId}`}>
          <Button variant="ghost" size="sm" className="mb-4">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Company
          </Button>
        </Link>
        <h1 className="text-2xl font-bold">Edit Company</h1>
        <p className="text-muted-foreground">Update company information</p>
      </div>

      {/* Edit Modal - open by default */}
      <CompanyEditModal
        company={company}
        open={true}
        onOpenChange={(open) => {
          if (!open) {
            router.push(`/dashboard/companies/${clientId}`);
          }
        }}
        onSave={() => {
          router.push(`/dashboard/companies/${clientId}`);
        }}
      />
    </div>
  );
}
