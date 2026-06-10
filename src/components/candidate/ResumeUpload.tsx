"use client";

import { useState, useRef, ChangeEvent } from "react";
import { useDropzone } from "react-dropzone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FileText, Upload, X, Loader2, Link as LinkIcon } from "lucide-react";
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
  const [googleDocUrl, setGoogleDocUrl] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // useDropzone hook for drag & drop
  const { getRootProps, getInputProps, isDragActive, isDragReject } = useDropzone({
    accept: {
      'application/pdf': ['.pdf'],
      'application/msword': ['.doc'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
    },
    maxFiles: 1,
    maxSize: 10 * 1024 * 1024, // 10MB
    onDropAccepted: (files) => {
      const file = files[0];
      if (validateFile(file)) {
        setSelectedFile(file);
      }
    },
    onDropRejected: (files) => {
      const file = files[0];
      if (file.errors.some(e => e.code === 'file-too-large')) {
        toast.error('File too large. Maximum size is 10MB.');
      } else if (file.errors.some(e => e.code === 'file-invalid-type')) {
        toast.error('Invalid file type. Please upload PDF, DOC, or DOCX files.');
      } else {
        toast.error('File rejected. Please try again.');
      }
    },
  });

  // Validate file
  const validateFile = (file: File): boolean => {
    const validTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    const validExtensions = ['.pdf', '.doc', '.docx'];
    const fileNameLower = file.name.toLowerCase();
    
    const hasValidType = validTypes.includes(file.type);
    const hasValidExtension = validExtensions.some(ext => fileNameLower.endsWith(ext));
    
    if (!hasValidType && !hasValidExtension) {
      toast.error('Invalid file type. Please upload PDF, DOC, or DOCX files.');
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

  const handleCancel = () => {
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Handle Google Docs import
  const handleGoogleDoc = async () => {
    if (!googleDocUrl) return;
    
    // Validate Google Docs URL
    const googleDocId = extractGoogleDocId(googleDocUrl);
    if (!googleDocId) {
      toast.error('Invalid Google Docs URL. Please paste a valid share link.');
      return;
    }

    setIsUploading(true);
    setUploadProgress("Fetching Google Doc and parsing...");

    try {
      // Send to parse-resume API as Google Doc URL
      const parseFormData = new FormData();
      parseFormData.append('googleDocUrl', googleDocUrl);
      if (candidateId) {
        parseFormData.append('candidateId', candidateId);
      }

      const parseResponse = await fetch('/api/parse-resume', {
        method: 'POST',
        body: parseFormData,
      });

      const parseResult = await parseResponse.json();

      if (!parseResponse.ok || parseResult.error) {
        console.error('Parse failed:', parseResult.error);
        throw new Error(parseResult.error || 'Failed to parse Google Doc');
      }

      const newResumeUrl = parseResult.resumeUrl;
      const fileKey = parseResult.fileKey;

      setUploadProgress("Updating candidate record...");

      // Build update payload with all parsed fields
      const updatePayload: any = {
        resume_url: fileKey || newResumeUrl,
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
      
      // Update candidate record
      const updateResponse = await fetch(`/api/data/leads/${candidateId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatePayload),
      });
      
      const updateResult = await updateResponse.json();
      
      if (!updateResponse.ok || updateResult.error) {
        throw new Error(updateResult.error || 'Failed to update candidate');
      }
      
      toast.success('Resume imported from Google Docs and parsed successfully');
      
      // Call success callback
      const parsedData = parseResult.success ? parseResult.resume : undefined;
      onSuccess?.(newResumeUrl || googleDocUrl, parsedData);
      
      // Reset state
      setGoogleDocUrl('');
    } catch (err: any) {
      console.error('Google Doc import error:', err);
      toast.error(err.message || 'Failed to import Google Doc');
      onError?.(err.message || 'Failed to import Google Doc');
    } finally {
      setIsUploading(false);
      setUploadProgress("");
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
      // Single API call: parse-resume handles both parsing AND S3 upload
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

      const newResumeUrl = parseResult.resumeUrl;
      const fileKey = parseResult.fileKey;

      if (!newResumeUrl) {
        throw new Error('Failed to upload resume to S3');
      }

      setUploadProgress("Updating candidate record...");

      // Build update payload
      const updatePayload: any = {
        resume_url: fileKey || newResumeUrl,
      };
      
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
      
      // Update candidate record
      const updateResponse = await fetch(`/api/data/leads/${candidateId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatePayload),
      });
      
      const updateResult = await updateResponse.json();
      
      if (!updateResponse.ok || updateResult.error) {
        throw new Error(updateResult.error || 'Failed to update candidate');
      }
      
      // Log the resume upload event
      await logResumeUploadEvent(selectedFile.name, newResumeUrl);
      
      toast.success('Resume uploaded and parsed successfully');
      
      const parsedData = parseResult.success ? parseResult.resume : undefined;
      onSuccess?.(newResumeUrl, parsedData);
      
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

  // Extract Google Doc ID from URL
  const extractGoogleDocId = (url: string): string | null => {
    // Match patterns: docs.google.com/document/d/{id}/...
    const match = url.match(/docs\.google\.com\/document\/d\/([a-zA-Z0-9-_]+)/);
    return match ? match[1] : null;
  };

  // Format file size
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  return (
    <div className={`space-y-4 ${className || ""}`}>
      {/* Drag & Drop Zone using react-dropzone */}
<div
        {...getRootProps()}
        onClick={(e) => e.stopPropagation()}
        className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
          isDragActive 
            ? 'border-blue-500 bg-blue-50' 
            : isDragReject
              ? 'border-red-500 bg-red-50'
              : 'border-gray-300 hover:border-gray-400'
        }`}
      >
        <input
          {...getInputProps()}
          ref={fileInputRef}
          onChange={handleFileChange}
          accept=".pdf,.doc,.docx"
        />
        
        {!selectedFile ? (
          <div className="space-y-3">
            <Upload className={`h-10 w-10 mx-auto ${isDragActive ? 'text-blue-500' : 'text-muted-foreground'}`} />
            <div>
              <p className="font-medium">
                {isDragActive ? "Drop resume here..." : "Drag & drop resume here"}
              </p>
              <p className="text-sm text-muted-foreground">or click to browse</p>
            </div>
            <p className="text-xs text-muted-foreground">PDF, DOC, DOCX • Max 10MB</p>
          </div>
        ) : (
          <div className="flex items-center justify-between bg-muted/50 rounded-lg p-3">
            <div className="flex items-center gap-3">
              <FileText className="h-5 w-5 text-primary" />
              <div>
                <p className="text-sm font-medium">{selectedFile.name}</p>
                <p className="text-xs text-muted-foreground">
                  {formatFileSize(selectedFile.size)}
                </p>
              </div>
            </div>
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={(e) => {
                e.stopPropagation();
                handleCancel();
              }}
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
              {buttonText || "Upload Resume"}
            </>
          )}
        </Button>
      )}

      {/* Divider */}
      {selectedFile && (
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-muted-foreground">Or</span>
          </div>
        </div>
      )}

      {/* Google Docs Link Section */}
      <div>
        <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">
          Paste Google Docs link
        </p>
        <div className="flex gap-2">
          <Input
            placeholder="https://docs.google.com/document/d/..."
            value={googleDocUrl}
            onChange={(e) => setGoogleDocUrl(e.target.value)}
            disabled={isUploading}
          />
          <Button 
            type="button" 
            onClick={handleGoogleDoc} 
            disabled={!googleDocUrl || isUploading}
          >
            {isUploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <LinkIcon className="h-4 w-4 mr-2" />
                Import
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
