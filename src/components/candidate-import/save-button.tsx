/**
 * Save as Candidate Button
 * Button component to import AI search results as candidates
 * 
 * @clientComponent
 */

"use client";

import { useState } from "react";
import { UserPlus, Loader2, Check, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface AIRawResult {
  id?: string;
  name?: string;
  first_name?: string;
  last_name?: string;
  title?: string;
  company?: string;
  email?: string;
  phone?: string;
  linkedin_url?: string;
  city?: string;
  state?: string;
  country?: string;
  industry?: string;
  skills?: string[];
  [key: string]: any;
}

interface SaveButtonProps {
  result: AIRawResult;
  source?: string;
  searchQuery?: string;
  onSuccess?: (candidateId: string) => void;
  onError?: (error: string) => void;
  variant?: "default" | "outline" | "ghost" | "secondary";
  size?: "default" | "sm" | "lg" | "icon";
  showLabel?: boolean;
  disabled?: boolean;
}

export function SaveCandidateButton({
  result,
  source = "apollo",
  searchQuery,
  onSuccess,
  onError,
  variant = "default",
  size = "sm",
  showLabel = true,
  disabled = false,
}: SaveButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    // Prevent multiple clicks
    if (isLoading || isSaved) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/import-candidate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rawResult: result,
          source,
          searchQuery,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || data.error || "Import failed");
      }

      if (data.success) {
        setIsSaved(true);
        toast.success(
          data.message || `${result.name || result.first_name || "Candidate"} added to candidates`
        );
        
        // Call success callback
        if (onSuccess && data.candidateId) {
          onSuccess(data.candidateId);
        }

        // Auto-refresh after 2 seconds
        setTimeout(() => {
          setIsLoading(false);
        }, 2000);
      } else if (data.isDuplicate) {
        // Candidate already exists
        toast.info(data.message || "This candidate already exists");
        if (onError) {
          onError(data.message || "Duplicate candidate");
        }
        setError(data.message);
      } else {
        throw new Error(data.message || "Import failed");
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      setError(errorMessage);
      toast.error(errorMessage);
      if (onError) {
        onError(errorMessage);
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Render saved state
  if (isSaved) {
    return (
      <Button variant="ghost" size={size} disabled className="bg-green-50 text-green-600 border-green-200">
        <Check className="h-4 w-4 mr-1" />
        {showLabel && "Saved"}
      </Button>
    );
  }

  // Render error state
  if (error) {
    return (
      <Button
        variant="ghost"
        size={size}
        onClick={() => {
          setError(null);
          setIsSaved(false);
        }}
        className="text-red-500 hover:text-red-600"
      >
        <AlertCircle className="h-4 w-4 mr-1" />
        {showLabel && "Retry"}
      </Button>
    );
  }

  // Render loading or normal state
  return (
    <Button
      variant={variant}
      size={size}
      onClick={handleClick}
      disabled={disabled || isLoading}
      className="transition-all"
    >
      {isLoading ? (
        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
      ) : (
        <UserPlus className="h-4 w-4 mr-1" />
      )}
      {showLabel && (isLoading ? "Adding..." : "Add to Candidates")}
    </Button>
  );
}

/**
 * Bulk Save Button
 * For selecting multiple results and importing them together
 */

interface BulkSaveButtonProps {
  results: AIRawResult[];
  source?: string;
  searchQuery?: string;
  onComplete?: (results: { imported: number; duplicates: number; errors: number }) => void;
}

export function BulkSaveButton({
  results,
  source = "apollo",
  searchQuery,
  onComplete,
}: BulkSaveButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState({ imported: 0, duplicates: 0, errors: 0 });

  const handleBulkImport = async () => {
    if (isLoading || results.length === 0) return;

    setIsLoading(true);
    setProgress({ imported: 0, duplicates: 0, errors: 0 });

    let imported = 0;
    let duplicates = 0;
    let errors = 0;

    for (const result of results) {
      try {
        const response = await fetch("/api/import-candidate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            rawResult: result,
            source,
            searchQuery,
          }),
        });

        const data = await response.json();

        if (data.success) {
          imported++;
        } else if (data.isDuplicate) {
          duplicates++;
        } else {
          errors++;
        }
      } catch {
        errors++;
      }

      // Update progress
      setProgress({ imported, duplicates, errors });
    }

    setIsLoading(false);

    const message = `Imported ${imported} candidate${imported !== 1 ? "s" : ""}${
      duplicates > 0 ? `, ${duplicates} duplicate${duplicates !== 1 ? "s" : ""}` : ""
    }${errors > 0 ? `, ${errors} error${errors !== 1 ? "s" : ""}` : ""}`;

    toast.success(message);

    if (onComplete) {
      onComplete({ imported, duplicates, errors });
    }
  };

  return (
    <Button
      variant="default"
      size="default"
      onClick={handleBulkImport}
      disabled={isLoading || results.length === 0}
      className="w-full"
    >
      {isLoading ? (
        <>
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          Importing... ({progress.imported}/{results.length})
        </>
      ) : (
        <>
          <UserPlus className="h-4 w-4 mr-2" />
          Add {results.length} to Candidates
        </>
      )}
    </Button>
  );
}
