"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Download, ExternalLink, FileText, FileType, Loader2, AlertCircle, ZoomIn, ZoomOut, RefreshCw } from "lucide-react";

interface ResumeViewerProps {
  url?: string;
  fileName?: string;
  candidateId?: string;
  fileKey?: string;
  className?: string;
  onUrlUpdated?: (newUrl: string) => void;
}

// Detect file type from URL or filename
function detectFileType(url: string, fileName?: string): "pdf" | "docx" | "doc" | "unknown" {
  const name = fileName || url?.split("/").pop() || "";
  const lowerName = name.toLowerCase();

  if (lowerName.endsWith(".pdf")) return "pdf";
  if (lowerName.endsWith(".docx")) return "docx";
  if (lowerName.endsWith(".doc")) return "doc";

  // Check URL for type hints
  const lowerUrl = url?.toLowerCase() || "";
  if (lowerUrl.includes(".pdf") || lowerUrl.includes("pdf")) return "pdf";
  if (lowerUrl.includes(".docx") || lowerUrl.includes("docx")) return "docx";
  if (lowerUrl.includes(".doc") || lowerUrl.includes("doc")) return "doc";

  return "unknown";
}

export function ResumeViewer({ url, fileName, candidateId, fileKey, className, onUrlUpdated }: ResumeViewerProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fileType, setFileType] = useState<"pdf" | "docx" | "doc" | "unknown">("unknown");
  const [currentUrl, setCurrentUrl] = useState(url || "");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [hasTriedAutoRefresh, setHasTriedAutoRefresh] = useState(false);

  // PDF zoom state
  const [zoom, setZoom] = useState(100);

  // Fetch fresh URL when candidateId is provided (for auto-refresh on mount)
  const refreshUrl = useCallback(async (showLoading = true) => {
    if (!candidateId && !fileKey) return;

    if (showLoading) {
      setIsRefreshing(true);
      setLoading(true);
    }

    try {
      // Use GET method with query params for better caching
      const params = new URLSearchParams();
      if (candidateId) params.append('candidateId', candidateId);
      if (fileKey) params.append('fileKey', fileKey);

      const response = await fetch(`/api/resume-url?${params.toString()}`);
      const data = await response.json();

      if (data.success && data.resumeUrl) {
        setCurrentUrl(data.resumeUrl);
        setError(null);
        setHasTriedAutoRefresh(true);
      } else {
        console.error('resume-url: no URL returned:', data);
        setError('Could not generate resume URL');
      }
    } catch (err) {
      console.error('Failed to refresh resume URL:', err);
      setError('Failed to refresh URL. Please try again.');
    } finally {
      setIsRefreshing(false);
      setLoading(false);
    }
  }, [candidateId, fileKey]);

// Auto-refresh on mount if URL looks expired or not provided
  // Also refresh if the URL looks like an S3 key (starts with "resumes/" or similar path)
  useEffect(() => {
    // Check if URL is missing, looks expired (has AWS params), is too short, or is actually an S3 key (not a full URL)
    const isS3Key = url && (url.startsWith('resumes/') || url.startsWith('candidates/') || url.startsWith('uploads/'));
    const needsRefresh = !url || url.includes('X-Amz-Expires=') || url.length < 50 || isS3Key;

    if ((needsRefresh || !url) && (candidateId || fileKey) && !hasTriedAutoRefresh) {
      // Wait a moment for mount to complete
      const timer = setTimeout(() => {
        refreshUrl(true);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [url, candidateId, fileKey, hasTriedAutoRefresh, refreshUrl]);

// Detect file type and set URL on mount or when props change
  // BUT: Don't use the URL if it looks like an S3 key - we'll refresh it instead
  useEffect(() => {
    const type = detectFileType(url || "", fileName);
    setFileType(type);
    
    // Check if URL looks like an S3 key (not a full URL)
    const isS3Key = url && (url.startsWith('resumes/') || url.startsWith('candidates/') || url.startsWith('uploads/'));
    
    // Only use URL directly if it's a valid URL (not an S3 key)
    // If it's an S3 key, we'll auto-refresh in the other useEffect
    if (url && !hasTriedAutoRefresh && !isS3Key) {
      setCurrentUrl(url);
    }
  }, [url, fileName, hasTriedAutoRefresh]);

  // Listen to external URL prop changes and call callback
  useEffect(() => {
    if (url && url !== currentUrl && onUrlUpdated) {
      onUrlUpdated(url);
    }
  }, [url, currentUrl, onUrlUpdated]);

  const handleLoad = () => {
    setLoading(false);
  };

  const handleError = () => {
    setError("Unable to load resume. URL may have expired.");
    setLoading(false);
  };

  const handleOpenNewTab = () => {
    if (currentUrl) {
      window.open(currentUrl, "_blank");
    }
  };

  // Zoom controls for PDF
  const zoomIn = () => setZoom(prev => Math.min(prev + 25, 200));
  const zoomOut = () => setZoom(prev => Math.max(prev - 25, 50));

  // Render empty state
  if (!url && !currentUrl) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-50 p-8">
        <div className="text-center">
          <FileText className="h-16 w-16 mx-auto mb-4 text-gray-400" />
          <p className="text-gray-500 mb-2">No resume uploaded yet</p>
          <p className="text-sm text-gray-400">Upload a resume to see it here</p>
        </div>
      </div>
    );
  }

  // Render error state
  if (error && !currentUrl) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-50 p-8">
        <div className="text-center">
          <AlertCircle className="h-16 w-16 mx-auto mb-4 text-red-400" />
          <p className="text-red-500 mb-4">{error}</p>
          {/* Show refresh button if we have candidateId or fileKey */}
          {(candidateId || fileKey) && (
            <Button onClick={() => refreshUrl(true)} variant="outline">
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh URL
            </Button>
          )}
        </div>
      </div>
    );
  }

  // Render Word document
  if (fileType === "docx" || fileType === "doc") {
    return (
      <div className="flex flex-col h-full">
        {/* Toolbar */}
        <div className="flex items-center justify-between p-3 bg-gray-100 border-b shrink-0">
          <div className="flex items-center gap-2">
            <FileType className="h-5 w-5 text-blue-500" />
            <span className="text-sm font-medium">
              {fileType.toUpperCase()} Document
            </span>
            {loading && (
              <>
                <Loader2 className="h-4 w-4 animate-spin ml-2" />
                <span className="text-sm">Loading...</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="default" size="sm">
              <a href={currentUrl} download={fileName} target="_blank" rel="noopener noreferrer">
                <Download className="mr-2 h-4 w-4" />
                Download Resume
              </a>
            </Button>
            <Button variant="outline" size="sm" onClick={handleOpenNewTab}>
              <ExternalLink className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Word Preview - simplified since mammoth can't run in browser */}
        <div className="flex-1 bg-white overflow-auto">
          <div className="flex items-center justify-center h-full bg-gray-50">
            <div className="text-center">
              <FileType className="h-16 w-16 mx-auto mb-4 text-gray-400" />
              <p className="text-gray-500 mb-4">Preview not available for Word documents</p>
              <Button asChild variant="default">
                <a href={currentUrl} download={fileName} target="_blank" rel="noopener noreferrer">
                  <Download className="mr-2 h-4 w-4" />
                  Download Resume
                </a>
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

// Render PDF (default)
  return (
    <div className={`flex flex-col h-full ${className || ""}`}>
      {/* Toolbar */}
      <div className="flex items-center justify-between p-2 bg-gray-100 border-b shrink-0">
        <div className="flex items-center gap-2">
          {loading || isRefreshing ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Loading resume...</span>
            </>
          ) : !error ? (
            <span className="text-sm text-green-600">Ready</span>
          ) : null}
        </div>
        <div className="flex items-center gap-1">
          {/* Refresh button - show when candidateId or fileKey is provided */}
          {(candidateId || fileKey) && (
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => refreshUrl(true)} 
              disabled={isRefreshing}
              title="Refresh URL (generates new 7-day URL)"
            >
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            </Button>
          )}
          {/* Zoom controls */}
          <Button variant="ghost" size="icon" onClick={zoomOut} disabled={zoom <= 50} title="Zoom out">
            <ZoomOut className="h-4 w-4" />
          </Button>
          <span className="text-sm min-w-[50px] text-center">{zoom}%</span>
          <Button variant="ghost" size="icon" onClick={zoomIn} disabled={zoom >= 200} title="Zoom in">
            <ZoomIn className="h-4 w-4" />
          </Button>
          
          <div className="border-l ml-2 pl-2 flex items-center gap-1">
            <Button asChild variant="outline" size="sm">
              <a href={currentUrl} download={fileName} target="_blank" rel="noopener noreferrer">
                <Download className="mr-1 h-4 w-4" />
                Download
              </a>
            </Button>
            <Button variant="outline" size="icon" onClick={handleOpenNewTab} title="Open in new tab">
              <ExternalLink className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* PDF Viewer using iframe with zoom */}
      <div className="flex-1 bg-gray-200 overflow-auto">
        <div 
          className="min-h-full flex justify-center"
          style={{ 
            transform: `scale(${zoom / 100})`,
            transformOrigin: 'top center'
          }}
        >
          <iframe
            src={currentUrl}
            className="w-full h-full border-0"
            style={{ 
              width: `${10000 / zoom}%`, 
              height: "100%",
              minHeight: "800px"
            }}
            title={fileName || "Resume PDF"}
            onLoad={handleLoad}
            onError={handleError}
          />
        </div>
      </div>
    </div>
  );
}
