"use client";

import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "./button";

interface BackToDashboardProps {
  /** Optional page name to display after the arrow */
  pageName?: string;
  /** Custom label text (default: "Back to Dashboard") */
  label?: string;
  /** Optional className for custom styling */
  className?: string;
}

/**
 * Reusable Back to Dashboard navigation component
 * Provides consistent navigation back to the dashboard from detail pages
 */
export function BackToDashboard({
  pageName,
  label = "Back to Dashboard",
  className = "",
}: BackToDashboardProps) {
  const router = useRouter();

  const handleBack = () => {
    router.push("/dashboard");
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleBack}
      className={`inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground -ml-2 mb-4 ${className}`}
    >
      <ArrowLeft className="h-4 w-4" />
      {label}
      {pageName && (
        <>
          {" "}
          • {pageName}
        </>
      )}
    </Button>
  );
}
