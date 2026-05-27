"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, ExternalLink, FileText, Loader2 } from "lucide-react";

interface ResumeViewerProps {
  url: string;
  fileName?: string;
}

export function ResumeViewer({ url, fileName = "resume.pdf" }: ResumeViewerProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const handleLoad = () => {
    setLoading(false);
  };

  const handleError = () => {
    setError("Failed to load PDF. Please use the Open button to view it.");
    setLoading(false);
  };

  const handleOpenNewTab = () => {
    window.open(url, "_blank");
  };

  if (error) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-50 p-8">
        <div className="text-center">
          <FileText className="h-16 w-16 mx-auto mb-4 text-gray-400" />
          <p className="text-red-500 mb-4">{error}</p>
          <Button onClick={handleOpenNewTab} variant="outline">
            <ExternalLink className="mr-2 h-4 w-4" />
            Open in New Tab
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between p-2 bg-gray-100 border-b shrink-0">
        <div className="flex items-center gap-2">
          {loading && (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Loading...</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <a href={url} download={fileName} target="_blank" rel="noopener noreferrer">
              <Download className="mr-2 h-4 w-4" />
              Download
            </a>
          </Button>
          <Button variant="outline" size="sm" onClick={handleOpenNewTab}>
            <ExternalLink className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* PDF Viewer using iframe - Most reliable approach */}
      <div className="flex-1 bg-gray-200">
        <iframe
          src={url}
          className="w-full h-full border-0"
          title={fileName}
          onLoad={handleLoad}
          onError={handleError}
        />
      </div>
    </div>
  );
}
