"use client";

import {
  useState,
  useEffect,
  useCallback,
  useRef,
  forwardRef,
  useImperativeHandle,
  type DragEvent,
  type ReactNode,
} from "react";
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
import { uploadResumeToS3 } from "@/lib/candidates/resume-parse-client";
import { validateResumeFileClient } from "@/lib/candidates/resume-upload-limits";

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
    filledFields?: string[];
  } | null) => void;
}

export type ResumeViewerHandle = {
  attachFile: (file: File) => Promise<void>;
};

function isFileDragEvent(e: { dataTransfer?: DataTransfer | null }) {
  return Array.from(e.dataTransfer?.types || []).includes("Files");
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

export const ResumeViewer = forwardRef<ResumeViewerHandle, ResumeViewerProps>(
  function ResumeViewer(
    {
      url,
      fileName,
      candidateId,
      fileKey,
      className,
      onUrlUpdated,
      onResumeChanged,
    },
    ref
  ) {
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
  const uploadingRef = useRef(false);
  const [dragActive, setDragActive] = useState(false);
  const dragDepthRef = useRef(0);
  const [zoom, setZoom] = useState(100);
  /** HTML preview for .docx (mammoth) — browsers cannot iframe Word files */
  const [docxHtml, setDocxHtml] = useState<string | null>(null);
  const [docxLoading, setDocxLoading] = useState(false);
  const [docxError, setDocxError] = useState<string | null>(null);

  useEffect(() => {
    setDisplayName(fileName || "");
  }, [fileName]);

  // Convert .docx via same-origin API (server reads S3 — avoids browser CORS "Failed to fetch")
  useEffect(() => {
    if (fileType !== "docx") {
      setDocxHtml(null);
      setDocxError(null);
      setDocxLoading(false);
      return;
    }
    const keyForApi =
      fileKey || (isS3ObjectKey(url) ? url : undefined);
    if (!candidateId && !keyForApi) {
      setDocxHtml(null);
      setDocxError(
        "Missing candidate or file key — use Download to open the resume."
      );
      setDocxLoading(false);
      return;
    }

    let cancelled = false;
    setDocxLoading(true);
    setDocxError(null);
    setDocxHtml(null);
    (async () => {
      try {
        const params = new URLSearchParams();
        if (candidateId) params.set("candidateId", candidateId);
        if (keyForApi) params.set("fileKey", keyForApi);
        const res = await fetch(`/api/resume-preview?${params.toString()}`, {
          credentials: "include",
        });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok || !data.html) {
          throw new Error(
            data.error ||
              `Could not generate Word preview (${res.status})`
          );
        }
        setDocxHtml(data.html);
        setLoading(false);
      } catch (err: any) {
        if (cancelled) return;
        console.error("[ResumeViewer] docx preview", err);
        setDocxError(
          err?.message ||
            "Could not generate Word preview. Download the file to open it."
        );
        setLoading(false);
      } finally {
        if (!cancelled) setDocxLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fileType, candidateId, fileKey, url]);

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

  const handleReplaceFile = useCallback(
    async (file: File | null | undefined) => {
      if (!file || !candidateId) return;
      const validation = validateResumeFileClient(file);
      if (!validation.ok) {
        toast.error(validation.error);
        return;
      }
      if (uploadingRef.current) return;
      uploadingRef.current = true;
      setUploading(true);
      setError(null);
      setDragActive(false);
      dragDepthRef.current = 0;
      try {
        // Direct-to-S3 then finalize on server (avoids body size limits)
        const { s3Key, contentType } = await uploadResumeToS3(file, {
          candidateId,
        });
        const res = await fetch(`/api/candidate/${candidateId}/resume`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            s3Key,
            fileName: file.name,
            contentType,
            parse: true,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.error || "Upload failed");
        }
        const filledFields = Array.isArray(data.filledFields)
          ? data.filledFields.filter(Boolean).map(String)
          : [];
        setDisplayName(data.resume_file_name || file.name);
        setHasResume(true);
        setHasTriedAutoRefresh(false);
        setFileType(detectFileType(file.name, file.name));
        onResumeChanged?.({
          resumeUrl: data.resume_url || data.fileKey || s3Key,
          fileName: data.resume_file_name || file.name,
          fileKey: data.fileKey || data.resume_url || s3Key,
          filledFields,
        });
        if (data.warning) {
          toast.warning(data.warning);
        } else if (filledFields.length) {
          toast.success(
            `Resume uploaded — filled ${filledFields.join(", ")}`
          );
        } else {
          toast.success("Resume uploaded");
        }
        // Fetch signed URL for preview
        await refreshUrl(true);
      } catch (err: any) {
        toast.error(err?.message || "Failed to upload resume");
      } finally {
        uploadingRef.current = false;
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [candidateId, onResumeChanged, refreshUrl]
  );

  useImperativeHandle(
    ref,
    () => ({
      attachFile: async (file: File) => {
        await handleReplaceFile(file);
      },
    }),
    [handleReplaceFile]
  );

  const dropEnabled = Boolean(candidateId) && !uploading && !removing;

  const onDragEnter = (e: DragEvent<HTMLDivElement>) => {
    if (!dropEnabled || !isFileDragEvent(e)) return;
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current += 1;
    setDragActive(true);
  };

  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    if (!dropEnabled || !isFileDragEvent(e)) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    setDragActive(true);
  };

  const onDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setDragActive(false);
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    if (!isFileDragEvent(e)) return;
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current = 0;
    setDragActive(false);
    if (!dropEnabled) return;
    const file = e.dataTransfer.files?.[0];
    if (file) void handleReplaceFile(file);
  };

  const dropHandlers = {
    onDragEnter,
    onDragOver,
    onDragLeave,
    onDrop,
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

  const dropOverlay =
    dragActive && dropEnabled ? (
      <div
        className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-blue-500 bg-blue-50/95 px-6 text-center"
        data-testid="resume-drop-overlay"
      >
        <Upload className="mb-3 h-10 w-10 text-blue-700" />
        <p className="text-base font-semibold text-blue-900">
          {hasResume ? "Drop to replace resume" : "Drop to attach resume"}
        </p>
        <p className="mt-1 text-sm text-blue-800">
          PDF or Word resume / LinkedIn profile
        </p>
      </div>
    ) : null;

  let body: ReactNode;

  // Empty / no resume
  if (!hasResume && !currentUrl) {
    body = (
      <div
        role="button"
        tabIndex={0}
        aria-label="Upload resume by clicking or dragging a file"
        data-testid="resume-empty-dropzone"
        className={`flex min-h-[280px] flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 transition-colors ${
          dragActive
            ? "border-blue-500 bg-blue-50"
            : "border-gray-200 bg-gray-50 hover:border-blue-300 hover:bg-blue-50/40"
        } ${uploading ? "pointer-events-none opacity-70" : "cursor-pointer"}`}
        onClick={() => {
          if (dropEnabled) fileInputRef.current?.click();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            if (dropEnabled) fileInputRef.current?.click();
          }
        }}
      >
        {uploading ? (
          <Loader2 className="mx-auto mb-4 h-16 w-16 animate-spin text-blue-600" />
        ) : (
          <FileText
            className={`mx-auto mb-4 h-16 w-16 ${
              dragActive ? "text-blue-600" : "text-gray-400"
            }`}
          />
        )}
        <p className="mb-1 font-medium text-gray-600">
          {uploading
            ? "Uploading…"
            : dragActive
              ? "Drop resume to attach"
              : "No resume on file"}
        </p>
        <p className="mb-4 max-w-sm text-center text-sm text-gray-400">
          Drag &amp; drop a PDF or Word resume (or LinkedIn profile), or click
          to upload.
        </p>
        <div onClick={(e) => e.stopPropagation()}>{actionBar}</div>
      </div>
    );
  } else if (error && !currentUrl) {
    // Error without usable URL
    body = (
      <div className="flex min-h-[280px] flex-col items-center justify-center rounded-xl bg-gray-50 p-8">
        <AlertCircle className="mx-auto mb-4 h-16 w-16 text-red-400" />
        <p className="mb-2 text-center text-red-600">{error}</p>
        <p className="mb-4 max-w-sm text-center text-sm text-gray-500">
          The file may have been deleted or the link expired. Remove it and
          upload a new resume.
        </p>
        <div className="flex flex-wrap justify-center gap-2">
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
  } else if (fileType === "docx" || fileType === "doc") {
    // Word document — .docx rendered via mammoth; legacy .doc still download-only
    const isLegacyDoc = fileType === "doc";
    body = (
      <div className="flex h-full min-h-[320px] flex-col">
        <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-gray-100 border-b shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <FileType className="h-5 w-5 text-blue-500 shrink-0" />
            <span className="text-sm font-medium truncate">
              {displayName || fileName || "Word document"}
            </span>
            {docxLoading && (
              <Loader2 className="h-4 w-4 animate-spin text-gray-500" />
            )}
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
        <div className="flex-1 bg-white overflow-auto min-h-0">
          {isLegacyDoc ? (
            <div className="flex flex-col items-center justify-center h-full min-h-[280px] p-8 text-center">
              <FileType className="h-16 w-16 mx-auto mb-4 text-gray-400" />
              <p className="text-gray-600 font-medium mb-1">
                Preview not available for older .doc files
              </p>
              <p className="text-sm text-gray-500 mb-4 max-w-sm">
                Browsers can&apos;t display classic Word (.doc) inline. Download
                the file, or re-upload as .docx or PDF for an in-app preview.
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
          ) : docxLoading ? (
            <div className="flex flex-col items-center justify-center h-full min-h-[280px] text-gray-500">
              <Loader2 className="h-8 w-8 animate-spin mb-3" />
              <p className="text-sm">Generating Word preview…</p>
            </div>
          ) : docxError ? (
            <div className="flex flex-col items-center justify-center h-full min-h-[280px] p-8 text-center">
              <AlertCircle className="h-12 w-12 mx-auto mb-3 text-amber-500" />
              <p className="text-amber-800 text-sm mb-4 max-w-md">{docxError}</p>
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
          ) : docxHtml ? (
            <div
              className="prose prose-sm max-w-none p-6 text-gray-800 resume-docx-preview"
              dangerouslySetInnerHTML={{ __html: docxHtml }}
            />
          ) : (
            <div className="flex items-center justify-center h-full min-h-[280px] text-sm text-gray-500">
              No preview available
            </div>
          )}
        </div>
      </div>
    );
  } else {
    // PDF
    body = (
    <div className="flex h-full min-h-[400px] flex-col">
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

  return (
    <div
      data-resume-drop-root
      className={`relative h-full min-h-0 ${className || ""}`}
      {...dropHandlers}
    >
      {body}
      {dropOverlay}
    </div>
  );
  }
);
