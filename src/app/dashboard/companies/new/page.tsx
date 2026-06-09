"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Building2 } from "lucide-react";
import Link from "next/link";
import CompanyEditModal from "@/components/company/CompanyEditModal";

export default function NewCompanyPage() {
  const router = useRouter();

  const handleSave = () => {
    // After successful creation, navigate to the companies list
    router.push("/dashboard/companies");
  };

  const handleCancel = () => {
    // Navigate back to companies list
    router.push("/dashboard/companies");
  };

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div>
        <Link href="/dashboard/companies">
          <Button variant="ghost" size="sm" className="mb-4">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Companies
          </Button>
        </Link>
        <h1 className="text-2xl font-bold flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Building2 className="h-5 w-5 text-primary" />
          </div>
          Add New Company
        </h1>
        <p className="text-muted-foreground mt-1">
          Add a new company to your pipeline
        </p>
      </div>

      {/* Edit Modal - passing NO company prop triggers create mode */}
      <CompanyEditModal
        open={true}
        onOpenChange={(open) => {
          if (!open) {
            handleCancel();
          }
        }}
        onSave={handleSave}
      />
    </div>
  );
}
