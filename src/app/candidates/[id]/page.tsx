/**
 * Candidate Detail Page
 * 
 * Shows full candidate information with tabs for Overview, Timeline, Notes, Emails, and Details
 * Uses existing hooks: useCandidate(), useCandidateEvents(), useAddNote()
 * Integrates SendEmailModal for sending emails
 */

'use client';

import { use } from 'react';
import { useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { 
  ArrowLeft, 
  Mail, 
  Phone, 
  Linkedin, 
  Building, 
  Briefcase, 
  Calendar, 
  User,
  RefreshCw,
  ExternalLink
} from 'lucide-react';
import { toast } from 'sonner';

import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { SendEmailModal, CandidateInfo } from '@/components/email/send-email-modal';

import { useCandidate, useCandidateEvents, useAddNote } from '@/lib/hooks/query-candidate';
import type { Lead } from '@/lib/schemas/lead';

// Get pipeline stages (local function, not exported)
function getPipelineStages() {
  return [
    { id: 'new', label: 'New', color: 'bg-blue-500' },
    { id: 'contacted', label: 'Contacted', color: 'bg-yellow-500' },
    { id: 'qualified', label: 'Qualified', color: 'bg-purple-500' },
    { id: 'interested', label: 'Interested', color: 'bg-green-500' },
    { id: 'not_interested', label: 'Not Interested', color: 'bg-red-500' },
    { id: 'converted', label: 'Converted', color: 'bg-emerald-500' },
  ];
}

// Get status badge variant
function getStatusBadgeVariant(status: string) {
  switch (status) {
    case 'new': return 'default';
    case 'contacted': return 'secondary';
    case 'qualified': return 'outline';
    case 'not_interested': return 'destructive';
    case 'converted': return 'default';
    default: return 'default';
  }
}

// Get stage label
function getStageLabel(status: string) {
  return getPipelineStages().find(s => s.id === status)?.label || status || 'New';
}

// Simple Card component using inline styles (like EventTimeline)
function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={className} style={{
      border: '1px solid #e5e7eb',
      borderRadius: '0.5rem',
      padding: '1.5rem',
      backgroundColor: 'white'
    }}>
      {children}
    </div>
  );
}

function CardHeader({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '1rem' }}>
      {children}
    </div>
  );
}

function CardTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '0.5rem' }}>
      {children}
    </h3>
  );
}

function CardContent({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      {children}
    </div>
  );
}

// Loading skeleton for the page
function CandidateDetailSkeleton() {
  return (
    <div className="container mx-auto py-8 px-4">
      {/* Header skeleton */}
      <div className="flex items-center gap-4 mb-6">
        <Skeleton className="h-10 w-10" />
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-6 w-20" />
      </div>
      
      {/* Tabs skeleton */}
      <Skeleton className="h-10 w-full mb-8" />
      
      {/* Content skeleton */}
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    </div>
  );
}

// Error state component
function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="container mx-auto py-8 px-4">
      <Card className="max-w-md mx-auto">
        <CardContent className="pt-6">
          <div className="text-center">
            <div className="h-12 w-12 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
              <RefreshCw className="h-6 w-6 text-red-600" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Error Loading Candidate</h3>
            <p className="text-muted-foreground mb-4">{message}</p>
            <Button onClick={onRetry} variant="outline">
              <RefreshCw className="h-4 w-4 mr-2" />
              Try Again
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Not Found state component
function NotFoundState({ id }: { id: string }) {
  return (
    <div className="container mx-auto py-8 px-4">
      <Card className="max-w-md mx-auto">
        <CardContent className="pt-6">
          <div className="text-center">
            <div className="h-12 w-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
              <User className="h-6 w-6 text-gray-600" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Candidate Not Found</h3>
            <p className="text-muted-foreground mb-4">
              No candidate found with ID: {id}
            </p>
            <Link href="/dashboard/candidates">
              <Button variant="outline">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Candidates
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Overview Tab Content
function OverviewTab({ candidate }: { candidate: Lead }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Contact Information</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Email */}
        {candidate.email && (
          <div className="flex items-center gap-3">
            <Mail className="h-4 w-4 text-muted-foreground" />
            <a href={`mailto:${candidate.email}`} className="text-primary hover:underline">
              {candidate.email}
            </a>
          </div>
        )}
        
        {/* Phone */}
        {candidate.phone && (
          <div className="flex items-center gap-3">
            <Phone className="h-4 w-4 text-muted-foreground" />
            <a href={`tel:${candidate.phone}`} className="text-primary hover:underline">
              {candidate.phone}
            </a>
          </div>
        )}
        
        {/* LinkedIn */}
        {candidate.linkedin_url && (
          <div className="flex items-center gap-3">
            <Linkedin className="h-4 w-4 text-muted-foreground" />
            <a 
              href={candidate.linkedin_url} 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-primary hover:underline flex items-center gap-1"
            >
              View LinkedIn Profile
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        )}
        
        {/* Company */}
        {candidate.company && (
          <div className="flex items-center gap-3">
            <Building className="h-4 w-4 text-muted-foreground" />
            <span>{candidate.company}</span>
          </div>
        )}
        
        {/* Title */}
        {candidate.title && (
          <div className="flex items-center gap-3">
            <Briefcase className="h-4 w-4 text-muted-foreground" />
            <span>{candidate.title}</span>
          </div>
        )}
        
        {/* Notes */}
        {candidate.notes && (
          <div className="mt-4 pt-4 border-t">
            <h4 className="font-medium mb-2">Notes</h4>
            <p className="text-muted-foreground whitespace-pre-wrap">{candidate.notes}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Timeline Tab Content - uses external EventTimeline component
// Dynamic import to avoid SSR issues with useState in the component
const EventTimeline = dynamic(() => 
  import('@/components/candidate/EventTimeline').then(mod => mod.EventTimeline), 
  { ssr: false, loading: () => <div>Loading timeline...</div> }
);

function TimelineTab({ candidateId }: { candidateId: string }) {
  return (
    <Card>
      <CardContent className="pt-0">
        <EventTimeline candidateId={candidateId} />
      </CardContent>
    </Card>
  );
}

// Notes Tab Content
function NotesTab({ candidate }: { candidate: Lead }) {
  const [noteText, setNoteText] = useState('');
  const addNoteMutation = useAddNote();

  const handleAddNote = async () => {
    if (!noteText.trim()) return;
    if (!candidate.id) return;

    try {
      await addNoteMutation.mutateAsync({
        id: candidate.id,
        noteText: noteText.trim(),
        createdBy: 'Current User', // In real app, get from auth
      });
      setNoteText('');
    } catch (error) {
      console.error('Failed to add note:', error);
    }
  };
  
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Add Note</CardTitle>
        </CardHeader>
        <CardContent>
          <textarea
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder="Add a note about this candidate..."
            style={{
              width: '100%',
              minHeight: '100px',
              padding: '0.75rem',
              border: '1px solid #d1d5db',
              borderRadius: '0.375rem',
              fontSize: '0.875rem',
              fontFamily: 'inherit',
              resize: 'vertical'
            }}
          />
          <Button 
            onClick={handleAddNote} 
            disabled={addNoteMutation.isPending || !noteText.trim()}
            className="mt-3"
          >
            {addNoteMutation.isPending ? 'Adding...' : 'Add Note'}
          </Button>
        </CardContent>
      </Card>
      
      {/* Display candidate notes if any */}
      {candidate.notes && (
        <Card>
          <CardHeader>
            <CardTitle>All Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap">{candidate.notes}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// Emails Tab Content
function EmailsTab() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Email History</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-center py-8 text-muted-foreground">
          <Mail className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>No emails sent yet</p>
          <Button 
            variant="outline" 
            className="mt-4"
            onClick={() => {
              toast.info('Use the "Send Email" button in the header');
            }}
          >
            <Mail className="h-4 w-4 mr-2" />
            Send Email
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// Details Tab Content
function DetailsTab({ candidate }: { candidate: Lead }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Additional Details</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Status */}
        <div>
          <h4 className="text-sm font-medium text-muted-foreground mb-1">Status</h4>
          <Badge variant={getStatusBadgeVariant(candidate.status)}>
            {getStageLabel(candidate.status)}
          </Badge>
        </div>
        
        {/* Source */}
        <div>
          <h4 className="text-sm font-medium text-muted-foreground mb-1">Source</h4>
          <p>{candidate.source || 'Unknown'}</p>
        </div>
        
        {/* Created Date */}
        {candidate.created_at && (
          <div>
            <h4 className="text-sm font-medium text-muted-foreground mb-1">Created</h4>
            <p className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              {new Date(candidate.created_at).toLocaleDateString('en-US', {
                month: 'long',
                day: 'numeric',
                year: 'numeric',
              })}
            </p>
          </div>
        )}
        
        {/* Modified Date */}
        {candidate.modified_at && (
          <div>
            <h4 className="text-sm font-medium text-muted-foreground mb-1">Last Modified</h4>
            <p className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              {new Date(candidate.modified_at).toLocaleDateString('en-US', {
                month: 'long',
                day: 'numeric',
                year: 'numeric',
              })}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Main Candidate Detail Page Component
export default function CandidateDetailPage({ params }: { params: Promise<{ id: string }> }) {
  // Unwrap the params promise
  const { id } = use(params);
  
  // State for email modal
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  
  // Query hooks
  const { data: candidate, isLoading, error, refetch } = useCandidate(id);
  const { data: _events } = useCandidateEvents(id);
  
  // Loading state
  if (isLoading) {
    return <CandidateDetailSkeleton />;
  }
  
  // Error state
  if (error) {
    return (
      <ErrorState 
        message={error instanceof Error ? error.message : 'Failed to load candidate'} 
        onRetry={() => refetch()} 
      />
    );
  }
  
  // Not found state
  if (!candidate) {
    return <NotFoundState id={id} />;
  }
  
  // Prepare candidate info for email modal
  const candidateInfo: CandidateInfo = {
    email: candidate.email || '',
    name: candidate.name,
  };
  
  // Get initials for avatar
  const initials = candidate.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  
  return (
    <div className="container mx-auto py-8 px-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/candidates">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          
          <Avatar 
            className="h-12 w-12" 
            fallback={initials}
          />
          
          <div>
            <h1 className="text-2xl font-bold">{candidate.name}</h1>
            <div className="flex items-center gap-2">
              <Badge variant={getStatusBadgeVariant(candidate.status)}>
                {getStageLabel(candidate.status)}
              </Badge>
              {candidate.title && (
                <span className="text-sm text-muted-foreground">{candidate.title}</span>
              )}
            </div>
          </div>
        </div>
        
        {/* Send Email Button */}
        <Button onClick={() => setEmailModalOpen(true)} disabled={!candidate.email}>
          <Mail className="h-4 w-4 mr-2" />
          Send Email
        </Button>
      </div>
      
      {/* Tabs */}
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="notes">Notes</TabsTrigger>
          <TabsTrigger value="emails">Emails</TabsTrigger>
          <TabsTrigger value="details">Details</TabsTrigger>
        </TabsList>
        
        <TabsContent value="overview" className="mt-6">
          <OverviewTab candidate={candidate} />
        </TabsContent>
        
        <TabsContent value="timeline" className="mt-6">
          <TimelineTab candidateId={id} />
        </TabsContent>
        
        <TabsContent value="notes" className="mt-6">
          <NotesTab candidate={candidate} />
        </TabsContent>
        
        <TabsContent value="emails" className="mt-6">
          <EmailsTab />
        </TabsContent>
        
        <TabsContent value="details" className="mt-6">
          <DetailsTab candidate={candidate} />
        </TabsContent>
      </Tabs>
      
      {/* Send Email Modal */}
      <SendEmailModal
        open={emailModalOpen}
        onOpenChange={setEmailModalOpen}
        candidate={candidateInfo}
      />
    </div>
  );
}
