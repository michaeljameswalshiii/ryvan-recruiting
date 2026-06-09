"use client";

import { useState, useRef, ChangeEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FileText, Upload, X, Loader2, CheckCircle } from "lucide-react";
import { toast } from "sonner";

interface ResumeUploadProps {
  candidateId?: string;
  buttonText?: string;
  className?: string;
  onSuccess?: (resumeUrl: string, parsedData?: any) => void;
  onError?: (error: string) => void;
}

interface ParsedResumeData {
  name?: string;
  email?: string;
  phone?: string;
  title?: string;
  location?: string;
  fullAddress?: string;
  linkedin?: string;
  salaryRequirements?: string;
  summary?: string;
  skills?: string[];
  experience?: any[];
  education?: any[];
  certifications?: string[];
}

export function ResumeUpload({ candidateId, buttonText, className, onSuccess, onError }: ResumeUploadProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string>("");
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Validate file
  const validateFile = (file: File): boolean => {
    const validTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    const validExtensions = ['.pdf', '.docx'];
    const fileNameLower = file.name.toLowerCase();
    
    const hasValidType = validTypes.includes(file.type);
    const hasValidExtension = validExtensions.some(ext => fileNameLower.endsWith(ext));
    
    if (!hasValidType && !hasValidExtension) {
      toast.error('Invalid file type. Please upload PDF or Word (.docx) files.');
      return false;
    }
    
    // Check file size (10MB max)
    if (file.size > 10 * 1024 * 1024) {
      toast.error('File too large. Maximum size is 10MB.');
      return false;
    }
    
    return true;
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && validateFile(file)) {
      setSelectedFile(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && validateFile(file)) {
      setSelectedFile(file);
    }
  };

  const handleCancel = () => {
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Log resume upload as event
  const logResumeUploadEvent = async (fileName: string, newResumeUrl: string) => {
    try {
      const response = await fetch(`/api/candidate/${candidateId}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventType: 'RESUME_UPLOADED',
          title: 'Resume Uploaded',
          description: `Resume "${fileName}" was uploaded`,
          metadata: {
            fileName,
            resumeUrl: newResumeUrl,
            uploadedAt: new Date().toISOString(),
          }
        })
      });
      if (!response.ok) {
        console.error('Failed to log resume upload event');
      }
    } catch (err) {
      console.error('Error logging resume upload event:', err);
    }
  };

const handleUpload = async () => {
    if (!selectedFile) return;

    setIsUploading(true);
    setUploadProgress("Parsing resume and uploading to S3...");

    try {
      // Single API call: parse-resume now handles BOTH parsing AND S3 upload with 7-day URL
      const parseFormData = new FormData();
      parseFormData.append('resume', selectedFile);
      parseFormData.append('candidateId', candidateId);

      const parseResponse = await fetch('/api/parse-resume', {
        method: 'POST',
        body: parseFormData,
      });

      const parseResult = await parseResponse.json();

      if (!parseResponse.ok || parseResult.error) {
        console.error('Parse failed:', parseResult.error);
        throw new Error(parseResult.error || 'Failed to parse resume');
      }

      // parse-resume now returns both resumeUrl AND fileKey
      const newResumeUrl = parseResult.resumeUrl;
      const fileKey = parseResult.fileKey;

      if (!newResumeUrl) {
        throw new Error('Failed to upload resume to S3');
      }

      setUploadProgress("Updating candidate record...");

      // Build update payload with all parsed fields
      // Store BOTH the S3 key (for refreshing URLs) and the initial URL
      const updatePayload: any = {
        resume_url: fileKey || newResumeUrl, // Store S3 key as primary
      };
      
      // Add parsed fields if available
      if (parseResult.success && parseResult.resume) {
        const parsed = parseResult.resume as ParsedResumeData;
        if (parsed.name) updatePayload.name = parsed.name;
        if (parsed.email) updatePayload.email = parsed.email;
        if (parsed.phone) updatePayload.phone = parsed.phone;
        if (parsed.title) updatePayload.title = parsed.title;
        if (parsed.location) updatePayload.location = parsed.location;
        if (parsed.fullAddress) updatePayload.full_address = parsed.fullAddress;
        if (parsed.linkedin) updatePayload.linkedin_url = parsed.linkedin;
        if (parsed.salaryRequirements) updatePayload.salary_requirements = parsed.salaryRequirements;
        if (parsed.summary) updatePayload.summary = parsed.summary;
        if (parsed.skills && parsed.skills.length > 0) updatePayload.skills = parsed.skills;
        if (parsed.experience && parsed.experience.length > 0) updatePayload.experience = parsed.experience;
        if (parsed.education && parsed.education.length > 0) updatePayload.education = parsed.education;
        if (parsed.certifications && parsed.certifications.length > 0) updatePayload.certifications = parsed.certifications;
      }
      
      // Update candidate record with all parsed fields
      const updateResponse = await fetch(`/api/data/leads/${candidateId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatePayload),
      });
      
      const updateResult = await updateResponse.json();
      
      if (!updateResponse.ok || updateResult.error) {
        throw new Error(updateResult.error || 'Failed to update candidate');
      }
      
      // Log the resume upload as an event
      await logResumeUploadEvent(selectedFile.name, newResumeUrl);
      
      toast.success('Resume uploaded and parsed successfully');
      
      // Call success callback with the new URL and parsed data
      const parsedData = parseResult.success ? parseResult.resume : undefined;
      onSuccess?.(newResumeUrl, parsedData);
      
      // Reset state
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (err: any) {
      console.error('Upload error:', err);
      toast.error(err.message || 'Failed to upload resume');
      onError?.(err.message || 'Failed to upload resume');
    } finally {
      setIsUploading(false);
      setUploadProgress("");
    }
  };

return (
    <div className={`space-y-4 ${className || ""}`}>
      {/* Drag & Drop Zone */}
      <div
        className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
          isDragging 
            ? "border-primary bg-primary/5" 
            : "border-border hover:border-primary/50"
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept=".pdf,.docx"
          className="hidden"
          id="resume-upload-reusable"
        />
        
        {!selectedFile ? (
          <label htmlFor="resume-upload-reusable" className="cursor-pointer">
            <div className="space-y-3">
              <FileText className="h-10 w-10 mx-auto text-muted-foreground" />
              <div>
                <p className="font-medium">Drop resume here or click to browse</p>
                <p className="text-sm text-muted-foreground">PDF or Word (.docx), max 10MB</p>
              </div>
            </div>
          </label>
        ) : (
          <div className="flex items-center justify-between bg-muted/50 rounded-lg p-3">
            <div className="flex items-center gap-3">
              <FileText className="h-5 w-5 text-primary" />
              <div>
                <p className="text-sm font-medium">{selectedFile.name}</p>
                <p className="text-xs text-muted-foreground">
                  {(selectedFile.size / 1024).toFixed(1)} KB
                </p>
              </div>
            </div>
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={handleCancel}
              disabled={isUploading}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      {/* Upload Button */}
      {selectedFile && (
        <Button 
          onClick={handleUpload} 
          disabled={isUploading}
          className="w-full"
        >
          {isUploading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              {uploadProgress || "Uploading..."}
            </>
          ) : (
            <>
              <Upload className="h-4 w-4 mr-2" />
              Upload Resume
            </>
          )}
        </Button>
      )}
    </div>
  );
}
