"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Download,
  ExternalLink,
  FileText,
  FileType,
  Loader2,
  AlertCircle,
  ZoomIn,
  ZoomOut,
  RefreshCw,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

interface ResumeViewerProps {
  url?: string;
  fileName?: string;
  candidateId?: string;
  fileKey?: string;
  className?: string;
  onUrlUpdated?: (newUrl: string) => void;
  /** Called after resume is cleared or replaced so parent can refresh state */
  onResumeChanged?: (info: {
    resumeUrl: string;
    fileName?: string;
    fileKey?: string;
  } | null) => void;
}

function detectFileType(
  url: string,
  fileName?: string
): "pdf" | "docx" | "doc" | "unknown" {
  const name = fileName || url?.split("/").pop() || "";
  const lowerName = name.toLowerCase();

  if (lowerName.endsWith(".pdf")) return "pdf";
  if (lowerName.endsWith(".docx")) return "docx";
  if (lowerName.endsWith(".doc")) return "doc";

  const lowerUrl = url?.toLowerCase() || "";
  if (lowerUrl.includes(".pdf") || lowerUrl.includes("pdf")) return "pdf";
  if (lowerUrl.includes(".docx") || lowerUrl.includes("docx")) return "docx";
  if (lowerUrl.includes(".doc") || lowerUrl.includes("doc")) return "doc";

  return "unknown";
}

/**
 * True when value is an S3 object key (not a browser-loadable URL).
 * Careers applications store keys like:
 *   tenants/{tenantId}/careers-resumes/{ts}-file.pdf
 * Dashboard uploads use:
 *   resumes/{candidateId}/...
 * Loading either as a site path produces a 404 in the iframe.
 */
function isS3ObjectKey(value?: string | null): boolean {
  if (!value) return false;
  const v = value.trim();
  if (!v) return false;
  if (
    v.startsWith("http://") ||
    v.startsWith("https://") ||
    v.startsWith("blob:") ||
    v.startsWith("data:")
  ) {
    return false;
  }
  // Explicit known prefixes
  if (
    v.startsWith("resumes/") ||
    v.startsWith("candidates/") ||
    v.startsWith("uploads/") ||
    v.startsWith("tenants/") ||
    v.includes("careers-resumes/")
  ) {
    return true;
  }
  // Generic: looks like an object key (path segments, no scheme, not a site-absolute path alone)
  if (!v.includes("://") && v.includes("/") && !v.startsWith("/")) {
    return true;
  }
  return false;
}

export function ResumeViewer({
  url,
  fileName,
  candidateId,
  fileKey,
  className,
  onUrlUpdated,
  onResumeChanged,
}: ResumeViewerProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fileType, setFileType] = useState<"pdf" | "docx" | "doc" | "unknown">(
    "unknown"
  );
  const [currentUrl, setCurrentUrl] = useState(url || "");
  const [displayName, setDisplayName] = useState(fileName || "");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [hasTriedAutoRefresh, setHasTriedAutoRefresh] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [hasResume, setHasResume] = useState(!!(url || fileKey));
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [zoom, setZoom] = useState(100);

  useEffect(() => {
    setDisplayName(fileName || "");
  }, [fileName]);

  useEffect(() => {
    setHasResume(!!(url || fileKey || currentUrl));
  }, [url, fileKey, currentUrl]);

  const refreshUrl = useCallback(
    async (showLoading = true) => {
      if (!candidateId && !fileKey) return;

      if (showLoading) {
        setIsRefreshing(true);
        setLoading(true);
      }

      try {
        const params = new URLSearchParams();
        if (candidateId) params.append("candidateId", candidateId);
        // Prefer explicit fileKey; fall back to url when it is an S3 object key
        // (careers applies store the key in resume_url)
        const keyForApi =
          fileKey ||
          (isS3ObjectKey(url) ? url : undefined);
        if (keyForApi) params.append("fileKey", keyForApi);

        const response = await fetch(`/api/resume-url?${params.toString()}`, {
          credentials: "include",
        });
        const data = await response.json();

        if (data.success && data.resumeUrl) {
          setCurrentUrl(data.resumeUrl);
          setHasResume(true);
          setError(null);
          setHasTriedAutoRefresh(true);
          onUrlUpdated?.(data.resumeUrl);
        } else {
          console.error("resume-url: no URL returned:", data);
          setError(data.error || "Could not generate resume URL");
          if (response.status === 404) {
            setHasResume(false);
          }
        }
      } catch (err) {
        console.error("Failed to refresh resume URL:", err);
        setError("Failed to refresh URL. Please try again.");
      } finally {
        setIsRefreshing(false);
        setLoading(false);
      }
    },
    [candidateId, fileKey, url, onUrlUpdated]
  );

  useEffect(() => {
    const keyLike = isS3ObjectKey(url) || isS3ObjectKey(fileKey);
    const needsRefresh =
      !url ||
      url.includes("X-Amz-Expires=") ||
      url.length < 50 ||
      keyLike;

    if (
      (needsRefresh || !url) &&
      (candidateId || fileKey || isS3ObjectKey(url)) &&
      !hasTriedAutoRefresh
    ) {
      const timer = setTimeout(() => {
        refreshUrl(true);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [url, candidateId, fileKey, hasTriedAutoRefresh, refreshUrl]);

  useEffect(() => {
    const type = detectFileType(url || currentUrl || "", displayName || fileName);
    setFileType(type);

    // Never put a raw S3 key into the iframe src — that loads /tenants/... on the app host → 404
    if (url && !hasTriedAutoRefresh && !isS3ObjectKey(url)) {
      setCurrentUrl(url);
    }
  }, [url, fileName, displayName, hasTriedAutoRefresh, currentUrl]);

  const handleLoad = () => {
    setLoading(false);
    setError(null);
  };

  const handleError = () => {
    setError("Unable to load resume. URL may have expired or file is missing.");
    setLoading(false);
  };

  const handleOpenNewTab = () => {
    if (currentUrl) window.open(currentUrl, "_blank");
  };

  const handleRemove = async () => {
    if (!candidateId) {
      toast.error("Missing candidate id");
      return;
    }
    if (
      !confirm(
        "Remove this resume? You can upload a new file afterward. This cannot be undone."
      )
    ) {
      return;
    }
    setRemoving(true);
    try {
      const res = await fetch(`/api/candidate/${candidateId}/resume`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Failed to remove resume");
      }
      setCurrentUrl("");
      setHasResume(false);
      setDisplayName("");
      setError(null);
      onUrlUpdated?.("");
      onResumeChanged?.(null);
      toast.success("Resume removed — upload a new one anytime");
    } catch (err: any) {
      toast.error(err?.message || "Failed to remove resume");
    } finally {
      setRemoving(false);
    }
  };

  const handleReplaceFile = async (file: File | null | undefined) => {
    if (!file || !candidateId) return;
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("resume", file);
      const res = await fetch(`/api/candidate/${candidateId}/resume`, {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Upload failed");
      }
      setDisplayName(data.resume_file_name || file.name);
      setHasResume(true);
      setHasTriedAutoRefresh(false);
      setFileType(detectFileType(file.name, file.name));
      onResumeChanged?.({
        resumeUrl: data.resume_url || data.fileKey || "",
        fileName: data.resume_file_name || file.name,
        fileKey: data.fileKey || data.resume_url,
      });
      toast.success("Resume uploaded");
      // Fetch signed URL for preview
      await refreshUrl(true);
    } catch (err: any) {
      toast.error(err?.message || "Failed to upload resume");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const zoomIn = () => setZoom((prev) => Math.min(prev + 25, 200));
  const zoomOut = () => setZoom((prev) => Math.max(prev - 25, 50));

  /**
   * Chrome/Edge PDF viewer: hide left thumbnail/nav pane so the page
   * fills the full frame. Hash params are ignored by S3/signed URLs.
   */
  const pdfEmbedUrl = (src: string) => {
    if (!src) return src;
    const hash = "navpanes=0&scrollbar=1&view=FitH";
    // Replace existing hash if present (keep query string for signed URLs)
    const base = src.split("#")[0];
    return `${base}#${hash}`;
  };

  const actionBar = (
    <div className="flex flex-wrap items-center gap-2">
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="hidden"
        onChange={(e) => handleReplaceFile(e.target.files?.[0])}
      />
      {candidateId && (
        <>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={uploading || removing}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploading ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Upload className="mr-1 h-4 w-4" />
            )}
            {hasResume ? "Replace resume" : "Upload resume"}
          </Button>
          {hasResume && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-red-600 hover:text-red-700 hover:bg-red-50"
              disabled={removing || uploading}
              onClick={handleRemove}
            >
              {removing ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-1 h-4 w-4" />
              )}
              Remove
            </Button>
          )}
        </>
      )}
    </div>
  );

  // Empty / no resume
  if (!hasResume && !currentUrl) {
    return (
      <div
        className={`flex flex-col items-center justify-center min-h-[280px] bg-gray-50 p-8 rounded-xl border border-dashed border-gray-200 ${className || ""}`}
      >
        <FileText className="h-16 w-16 mx-auto mb-4 text-gray-400" />
        <p className="text-gray-600 font-medium mb-1">No resume on file</p>
        <p className="text-sm text-gray-400 mb-4 text-center max-w-sm">
          Upload a PDF or Word resume to attach it to this candidate.
        </p>
        {actionBar}
      </div>
    );
  }

  // Error without usable URL
  if (error && !currentUrl) {
    return (
      <div
        className={`flex flex-col items-center justify-center min-h-[280px] bg-gray-50 p-8 rounded-xl ${className || ""}`}
      >
        <AlertCircle className="h-16 w-16 mx-auto mb-4 text-red-400" />
        <p className="text-red-600 mb-2 text-center">{error}</p>
        <p className="text-sm text-gray-500 mb-4 text-center max-w-sm">
          The file may have been deleted or the link expired. Remove it and
          upload a new resume.
        </p>
        <div className="flex flex-wrap gap-2 justify-center">
          {(candidateId || fileKey) && (
            <Button onClick={() => refreshUrl(true)} variant="outline" size="sm">
              <RefreshCw className="mr-2 h-4 w-4" />
              Retry
            </Button>
          )}
          {actionBar}
        </div>
      </div>
    );
  }

  // Word document
  if (fileType === "docx" || fileType === "doc") {
    return (
      <div className={`flex flex-col h-full min-h-[320px] ${className || ""}`}>
        <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-gray-100 border-b shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <FileType className="h-5 w-5 text-blue-500 shrink-0" />
            <span className="text-sm font-medium truncate">
              {displayName || fileName || "Word document"}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {actionBar}
            {currentUrl && (
              <>
                <Button asChild variant="default" size="sm">
                  <a
                    href={currentUrl}
                    download={displayName || fileName}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Download
                  </a>
                </Button>
                <Button variant="outline" size="sm" onClick={handleOpenNewTab}>
                  <ExternalLink className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>
        </div>
        <div className="flex-1 bg-white flex items-center justify-center p-8">
          <div className="text-center">
            <FileType className="h-16 w-16 mx-auto mb-4 text-gray-400" />
            <p className="text-gray-500 mb-4">
              Preview not available for Word documents
            </p>
            {currentUrl && (
              <Button asChild variant="default">
                <a
                  href={currentUrl}
                  download={displayName || fileName}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Download className="mr-2 h-4 w-4" />
                  Download Resume
                </a>
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // PDF
  return (
    <div className={`flex flex-col h-full min-h-[400px] ${className || ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 p-2 bg-gray-100 border-b shrink-0">
        <div className="flex items-center gap-2">
          {loading || isRefreshing || uploading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">
                {uploading ? "Uploading…" : "Loading resume…"}
              </span>
            </>
          ) : error ? (
            <span className="text-sm text-amber-700">{error}</span>
          ) : (
            <span className="text-sm text-green-600 truncate max-w-[200px]">
              {displayName || "Ready"}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {actionBar}
          {(candidateId || fileKey) && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => refreshUrl(true)}
              disabled={isRefreshing}
              title="Refresh URL"
            >
              <RefreshCw
                className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`}
              />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={zoomOut}
            disabled={zoom <= 50}
            title="Zoom out"
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <span className="text-sm min-w-[50px] text-center">{zoom}%</span>
          <Button
            variant="ghost"
            size="icon"
            onClick={zoomIn}
            disabled={zoom >= 200}
            title="Zoom in"
          >
            <ZoomIn className="h-4 w-4" />
          </Button>

          {currentUrl && (
            <div className="border-l ml-2 pl-2 flex items-center gap-1">
              <Button asChild variant="outline" size="sm">
                <a
                  href={currentUrl}
                  download={displayName || fileName}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Download className="mr-1 h-4 w-4" />
                  Download
                </a>
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={handleOpenNewTab}
                title="Open in new tab"
              >
                <ExternalLink className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 bg-gray-200 overflow-hidden min-h-0">
        {currentUrl ? (
          <div
            className="h-full w-full flex justify-center overflow-auto"
            style={{
              transform: zoom === 100 ? undefined : `scale(${zoom / 100})`,
              transformOrigin: "top center",
            }}
          >
            <iframe
              src={pdfEmbedUrl(currentUrl)}
              className="border-0 bg-white"
              style={{
                width: zoom === 100 ? "100%" : `${10000 / zoom}%`,
                height: "100%",
                minHeight: "100%",
                minWidth: "100%",
              }}
              title={displayName || fileName || "Resume PDF"}
              onLoad={handleLoad}
              onError={handleError}
            />
          </div>
        ) : (
          <div className="flex items-center justify-center h-64 text-sm text-gray-500">
            No preview available
          </div>
        )}
      </div>
    </div>
  );
}
