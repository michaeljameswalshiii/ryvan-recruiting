



















































































































"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Download, ExternalLink, FileText, FileType, Loader2, AlertCircle, ZoomIn, ZoomOut, ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import * as mammoth from "mammoth";

interface ResumeViewerProps {
  url: string;
  fileName?: string;
  candidateId?: string;
}

// Detect file type from URL or filename
function detectFileType(url: string, fileName?: string): "pdf" | "docx" | "doc" | "unknown" {
  const name = fileName || url.split("/").pop() || "";
  const lowerName = name.toLowerCase();
  
  if (lowerName.endsWith(".pdf")) return "pdf";
  if (lowerName.endsWith(".docx")) return "docx";
  if (lowerName.endsWith(".doc")) return "doc";
  
  // Check URL for type hints
  const lowerUrl = url.toLowerCase();
  if (lowerUrl.includes(".pdf") || lowerUrl.includes("pdf")) return "pdf";
  if (lowerUrl.includes(".docx") || lowerUrl.includes("docx")) return "docx";
  if (lowerUrl.includes(".doc") || lowerUrl.includes("doc")) return "doc";
  
  return "unknown";
}

export function ResumeViewer({ url, fileName, candidateId }: ResumeViewerProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fileType, setFileType] = useState<"pdf" | "docx" | "doc" | "unknown">("unknown");
  const [docxHtml, setDocxHtml] = useState<string | null>(null);
  const [docxLoading, setDocxLoading] = useState(false);
  const [currentUrl, setCurrentUrl] = useState(url);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // PDF zoom state
  const [zoom, setZoom] = useState(100);

  // Fetch fresh URL when candidateId is provided and URL is expired
  const refreshUrl = useCallback(async () => {
    if (!candidateId) return;
    
    setIsRefreshing(true);
    setLoading(true);
    try {
      const response = await fetch('/api/resume-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidateId }),
      });
      
      const data = await response.json();
      
      if (data.success && data.resumeUrl) {
        setCurrentUrl(data.resumeUrl);
        setError(null);
      }
    } catch (err) {
      console.error('Failed to refresh resume URL:', err);
      setError('Failed to refresh URL. Please try again.');
    } finally {
      setIsRefreshing(false);
    }
  }, [candidateId]);

  // Initial load and URL refresh logic
  useEffect(() => {
    const type = detectFileType(url, fileName);
    setFileType(type);
    setCurrentUrl(url);
    
    // If we have a candidateId, we can refresh URLs when needed
    // The URL might be expired if it's older than 1 hour
  }, [url, fileName]);

  const handleLoad = () => {
    setLoading(false);
  };

  const handleError = () => {
    setError("Unable to load resume. Please download to view.");
    setLoading(false);
  };

const handleOpenNewTab = () => {
    window.open(currentUrl, "_blank");
  };

  // Load Word document
  const loadWordDoc = useCallback(async () => {
    if (fileType !== "docx" && fileType !== "doc") return;
    
    setDocxLoading(true);
    try {
      // For demo/development, we'll show a message since we can't fetch from S3 directly in browser
      // In production, you'd need a server route to fetch and convert the document
      setDocxHtml(`
        <div style="padding: 40px; max-width: 800px; margin: 0 auto;">
          <h2 style="color: #666; margin-bottom: 20px;">Word Document Preview</h2>
          <p style="color: #888; margin-bottom: 20px;">
            This is a Microsoft Word document (.${fileType}). 
            Preview is not available for Word files, but you can download it to view.
          </p>
        </div>
      `);
    } catch (err) {
      console.error("Failed to load Word doc:", err);
      setError("Unable to preview this Word document. Please download to view.");
    } finally {
      setDocxLoading(false);
    }
  }, [fileType]);

  useEffect(() => {
    if (fileType === "docx" || fileType === "doc") {
      loadWordDoc();
    }
  }, [fileType, loadWordDoc]);

  // Zoom controls for PDF
  const zoomIn = () => setZoom(prev => Math.min(prev + 25, 200));
  const zoomOut = () => setZoom(prev => Math.max(prev - 25, 50));

  // Render empty state
  if (!url) {
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
  if (error) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-50 p-8">
        <div className="text-center">
          <AlertCircle className="h-16 w-16 mx-auto mb-4 text-red-400" />
          <p className="text-red-500 mb-4">{error}</p>
          <div className="flex gap-2 justify-center">
            <Button onClick={handleOpenNewTab} variant="outline">
              <ExternalLink className="mr-2 h-4 w-4" />
              Open in New Tab
            </Button>
            <Button asChild variant="default">
              <a href={url} download={fileName} target="_blank" rel="noopener noreferrer">
                <Download className="mr-2 h-4 w-4" />
                Download
              </a>
            </Button>
          </div>
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
            {docxLoading && (
              <>
                <Loader2 className="h-4 w-4 animate-spin ml-2" />
                <span className="text-sm">Loading...</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="default" size="sm">
              <a href={url} download={fileName} target="_blank" rel="noopener noreferrer">
                <Download className="mr-2 h-4 w-4" />
                Download Resume
              </a>
            </Button>
            <Button variant="outline" size="sm" onClick={handleOpenNewTab}>
              <ExternalLink className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Word Preview */}
        <div className="flex-1 bg-white overflow-auto">
          {docxLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-blue-500" />
                <p className="text-gray-500">Loading document...</p>
              </div>
            </div>
          ) : docxHtml ? (
            <div 
              className="p-8 prose max-w-none"
              dangerouslySetInnerHTML={{ __html: docxHtml }}
            />
          ) : (
            <div className="flex items-center justify-center h-full bg-gray-50">
              <div className="text-center">
                <FileType className="h-16 w-16 mx-auto mb-4 text-gray-400" />
                <p className="text-gray-500 mb-4">Preview not available for Word documents</p>
                <Button asChild variant="default">
                  <a href={url} download={fileName} target="_blank" rel="noopener noreferrer">
                    <Download className="mr-2 h-4 w-4" />
                    Download Resume
                  </a>
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

// Render PDF (default)
  return (
    <div className="flex flex-col h-full">
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
          {/* Refresh button - only show when candidateId is provided */}
          {candidateId && (
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={refreshUrl} 
              disabled={isRefreshing}
              title="Refresh URL"
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
