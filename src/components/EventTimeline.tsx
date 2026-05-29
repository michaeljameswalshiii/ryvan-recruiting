'use client';

import { useState, useEffect, useCallback } from 'react';
import { 
  StickyNote, 
  Mail, 
  Eye, 
  ArrowRight, 
  Calendar, 
  CheckCircle2,
  UserPlus,
  Search,
  FileText,
  Building2,
  UserMinus,
  Briefcase,
  TrendingUp,
  TrendingDown,
  Trophy,
  XCircle,
  Handshake,
  Phone,
  Clock
} from 'lucide-react';

// ============================================================================
// Types - Reusable for both Candidates and Companies
// ============================================================================

export type EntityType = 'candidate' | 'company';

type EventType = 
  // Common
  | 'NOTE'
  | 'EMAIL_SENT' 
  | 'EMAIL_OPENED' 
  | 'EMAIL_CLICKED'
  // Candidate-specific
  | 'STATUS_CHANGED'
  | 'STAGE_CHANGED'
  | 'INTERVIEW_SCHEDULED'
  | 'INTERVIEW_COMPLETED'
  | 'CANDIDATE_CREATED'
  | 'CANDIDATE_VIEWED'
  | 'RESUME_UPLOADED'
  // Company-specific
  | 'COMPANY_CREATED'
  | 'CONTACT_ADDED'
  | 'CONTACT_REMOVED'
  | 'DEAL_CREATED'
  | 'DEAL_STAGE_CHANGED'
  | 'DEAL_WON'
  | 'DEAL_LOST'
  | 'MEETING_SCHEDULED'
  | 'CALL_COMPLETED';

interface EventItem {
  id: string;
  entityType: EntityType;
  entityId: string;
  eventType: EventType;
  title: string;
  description?: string;
  metadata: Record<string, any>;
  createdAt: string;
  createdBy: string;
  createdByName?: string;
}

interface EventTimelineProps {
  entityType: EntityType;
  entityId: string;
  tenantId: string;
  initialEvents?: EventItem[];
  maxHeight?: string;
}

// ============================================================================
// Component
// ============================================================================

export default function EventTimeline({
  entityType,
  entityId,
  tenantId,
  initialEvents = [],
  maxHeight = '500px',
}: EventTimelineProps) {
  const [events, setEvents] = useState<EventItem[]>(initialEvents);
  const [loading, setLoading] = useState(!initialEvents.length);
  const [error, setError] = useState<string | null>(null);
  const [newNote, setNewNote] = useState('');
  const [addingNote, setAddingNote] = useState(false);

  const fetchEvents = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const endpoint = entityType === 'candidate' 
        ? `/api/candidate/${entityId}/events`
        : `/api/company/${entityId}/events`;
        
      const response = await fetch(`${endpoint}?limit=50`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch ${entityType} events`);
      }
      
      const data = await response.json();
      setEvents(data.events || []);
    } catch (err) {
      console.error('Failed to fetch events:', err);
      setError(`Failed to load ${entityType} events`);
    } finally {
      setLoading(false);
    }
  }, [entityType, entityId]);

  // Fetch events on mount if not provided
  useEffect(() => {
    if (!initialEvents.length) {
      fetchEvents();
    }
  }, [initialEvents.length, fetchEvents]);

  const handleAddNote = async () => {
    if (!newNote.trim()) return;
    
    try {
      setAddingNote(true);
      setError(null);
      
      const endpoint = entityType === 'candidate'
        ? `/api/candidate/${entityId}/notes`
        : `/api/company/${entityId}/notes`;
        
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          noteText: newNote,
          tenantId,
        }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to add note');
      }
      
      const data = await response.json();
      if (data.success) {
        setNewNote('');
        // Refresh events list
        await fetchEvents();
      } else {
        setError(data.error || 'Failed to add note');
      }
    } catch (err) {
      console.error('Failed to add note:', err);
      setError('Failed to add note');
    } finally {
      setAddingNote(false);
    }
  };

// Get icon component for event type
  function getEventIcon(eventType: EventType) {
    const icons: Record<EventType, React.ReactNode> = {
      NOTE: <StickyNote className="w-4 h-4" />,
      EMAIL_SENT: <Mail className="w-4 h-4" />,
      EMAIL_OPENED: <Eye className="w-4 h-4" />,
      EMAIL_CLICKED: <ArrowRight className="w-4 h-4" />,
      STATUS_CHANGED: <ArrowRight className="w-4 h-4" />,
      STAGE_CHANGED: <ArrowRight className="w-4 h-4" />,
      INTERVIEW_SCHEDULED: <Calendar className="w-4 h-4" />,
      INTERVIEW_COMPLETED: <CheckCircle2 className="w-4 h-4" />,
      CANDIDATE_CREATED: <UserPlus className="w-4 h-4" />,
      CANDIDATE_VIEWED: <Search className="w-4 h-4" />,
      RESUME_UPLOADED: <FileText className="w-4 h-4" />,
      COMPANY_CREATED: <Building2 className="w-4 h-4" />,
      CONTACT_ADDED: <UserPlus className="w-4 h-4" />,
      CONTACT_REMOVED: <UserMinus className="w-4 h-4" />,
      DEAL_CREATED: <Briefcase className="w-4 h-4" />,
      DEAL_STAGE_CHANGED: <TrendingUp className="w-4 h-4" />,
      DEAL_WON: <Trophy className="w-4 h-4" />,
      DEAL_LOST: <XCircle className="w-4 h-4" />,
      MEETING_SCHEDULED: <Handshake className="w-4 h-4" />,
      CALL_COMPLETED: <Phone className="w-4 h-4" />,
    };
    return icons[eventType] || <Clock className="w-4 h-4" />;
  }

  // Get color class for event type
  function getEventColor(eventType: EventType): string {
    const colors: Record<EventType, string> = {
      NOTE: 'bg-yellow-100 text-yellow-800',
      EMAIL_SENT: 'bg-blue-100 text-blue-800',
      EMAIL_OPENED: 'bg-cyan-100 text-cyan-800',
      EMAIL_CLICKED: 'bg-indigo-100 text-indigo-800',
      STATUS_CHANGED: 'bg-purple-100 text-purple-800',
      STAGE_CHANGED: 'bg-violet-100 text-violet-800',
      INTERVIEW_SCHEDULED: 'bg-green-100 text-green-800',
      INTERVIEW_COMPLETED: 'bg-emerald-100 text-emerald-800',
      CANDIDATE_CREATED: 'bg-slate-100 text-slate-800',
      CANDIDATE_VIEWED: 'bg-gray-100 text-gray-800',
      RESUME_UPLOADED: 'bg-red-100 text-red-800',
      COMPANY_CREATED: 'bg-slate-100 text-slate-800',
      CONTACT_ADDED: 'bg-teal-100 text-teal-800',
      CONTACT_REMOVED: 'bg-orange-100 text-orange-800',
      DEAL_CREATED: 'bg-amber-100 text-amber-800',
      DEAL_STAGE_CHANGED: 'bg-lime-100 text-lime-800',
      DEAL_WON: 'bg-yellow-100 text-yellow-800',
      DEAL_LOST: 'bg-red-100 text-red-800',
      MEETING_SCHEDULED: 'bg-cyan-100 text-cyan-800',
      CALL_COMPLETED: 'bg-green-100 text-green-800',
    };
    return colors[eventType] || 'bg-gray-100 text-gray-800';
  }

  // Get label for event type
  function getEventLabel(eventType: EventType): string {
    const labels: Record<EventType, string> = {
      NOTE: 'Note',
      EMAIL_SENT: 'Email Sent',
      EMAIL_OPENED: 'Email Opened',
      EMAIL_CLICKED: 'Link Clicked',
      STATUS_CHANGED: 'Status Changed',
      STAGE_CHANGED: 'Stage Changed',
      INTERVIEW_SCHEDULED: 'Interview',
      INTERVIEW_COMPLETED: 'Interview Done',
      CANDIDATE_CREATED: 'Added',
      CANDIDATE_VIEWED: 'Viewed',
      RESUME_UPLOADED: 'Resume',
      COMPANY_CREATED: 'Added',
      CONTACT_ADDED: 'Contact Added',
      CONTACT_REMOVED: 'Contact Removed',
      DEAL_CREATED: 'Deal',
      DEAL_STAGE_CHANGED: 'Deal Stage',
      DEAL_WON: 'Deal Won',
      DEAL_LOST: 'Deal Lost',
      MEETING_SCHEDULED: 'Meeting',
      CALL_COMPLETED: 'Call Done',
    };
    return labels[eventType] || 'Event';
  }

  // Format date with relative time
  function formatDate(dateString: string) {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    let relativeTime = '';
    if (diffMins < 1) relativeTime = 'just now';
    else if (diffMins < 60) relativeTime = `${diffMins}m ago`;
    else if (diffHours < 24) relativeTime = `${diffHours}h ago`;
    else if (diffDays < 7) relativeTime = `${diffDays}d ago`;

    const formatted = date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
      hour: 'numeric',
      minute: '2-digit',
    });

    return relativeTime ? `${formatted} (${relativeTime})` : formatted;
  }

  // Loading state
  if (loading) {
    return (
      <div className="border border-border rounded-lg p-4 bg-background">
        <h3 className="text-lg font-semibold mb-4">Activity Timeline</h3>
        <div className="flex items-center justify-center py-8 text-muted-foreground">
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            Loading events...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="border border-border rounded-lg bg-background overflow-hidden">
      {/* Header */}
      <div className="border-b border-border p-4">
        <h3 className="text-lg font-semibold">Activity Timeline</h3>
        <p className="text-sm text-muted-foreground">
          {events.length} event{events.length !== 1 ? 's' : ''} • Chronological
        </p>
      </div>

      {/* Add Note Form */}
      <div className="border-b border-border p-4">
        <textarea
          placeholder="Add a note..."
          value={newNote}
          onChange={(e) => setNewNote(e.target.value)}
          rows={2}
          className="w-full p-2 text-sm border border-input rounded-md resize-y min-h-[60px]"
        />
        <button 
          onClick={handleAddNote} 
          disabled={addingNote || !newNote.trim()}
          className="mt-2 w-full py-2 px-4 rounded-md text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-primary text-primary-foreground hover:bg-primary/90"
        >
          {addingNote ? 'Adding...' : 'Add Note'}
        </button>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mx-4 mt-4 p-3 bg-destructive/10 text-destructive text-sm rounded-md">
          {error}
        </div>
      )}

      {/* Events List */}
      <div style={{ maxHeight }} className="overflow-y-auto">
        {events.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            No activity yet
          </div>
        ) : (
          <div className="relative p-4">
            {/* Timeline Line */}
            <div 
              className="absolute left-6 top-4 bottom-4 w-0.5 bg-border" 
            />
            
<div className="flex flex-col gap-4">
              {events.map((event) => {
                const eventColor = getEventColor(event.eventType as EventType);
                const eventLabel = getEventLabel(event.eventType as EventType);
                const eventIcon = getEventIcon(event.eventType as EventType);
                return (
                  <div key={event.id} className="flex gap-3 relative">
                    {/* Timeline Dot */}
                    <div 
                      className={`relative w-8 h-8 rounded-full flex items-center justify-center text-sm flex-shrink-0 ${eventColor}`}
                    >
                      {eventIcon}
                    </div>
                    
                    {/* Event Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${eventColor}`}>
                          {eventLabel}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {formatDate(event.createdAt)}
                        </span>
                      </div>
                      <div className="font-medium text-sm">
                        {event.title}
                      </div>
                      {event.description && (
                        <p className="text-sm text-muted-foreground mt-1">
                          {event.description}
                        </p>
                      )}
                      
                      {/* Event-specific metadata display */}
                      {event.eventType === 'EMAIL_SENT' && event.metadata?.emailSubject && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Subject: {event.metadata.emailSubject}
                        </p>
                      )}
                      
                      {(event.eventType === 'STATUS_CHANGED' || event.eventType === 'STAGE_CHANGED') && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {event.metadata.oldStatus || event.metadata.oldStage} → {event.metadata.newStatus || event.metadata.newStage}
                        </p>
                      )}
                      
                      {event.eventType === 'NOTE' && event.metadata?.noteText && (
                        <p className="text-sm mt-2 p-3 bg-muted rounded-md">
                          {event.metadata.noteText}
                        </p>
                      )}
                      
                      <div className="text-xs text-muted-foreground mt-2">
                        by {event.createdByName || event.createdBy}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
