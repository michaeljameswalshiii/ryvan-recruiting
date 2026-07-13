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
import { toast } from 'sonner';

export type EntityType = 'candidate' | 'company' | 'job';

type EventType = string;

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

const noteTypes = [
  { value: 'general', label: 'General Note' },
  { value: 'follow_up', label: 'Follow-up' },
  { value: 'meeting', label: 'Meeting' },
  { value: 'phone_call', label: 'Phone Call' },
  { value: 'email_sent', label: 'Email Sent' },
  { value: 'other', label: 'Other' },
];

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
  const [noteType, setNoteType] = useState('general');
  const [addingNote, setAddingNote] = useState(false);

  const fetchEvents = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      let endpoint: string;
      if (entityType === 'candidate') {
        endpoint = `/api/candidate/${entityId}/events`;
      } else if (entityType === 'job') {
        endpoint = `/api/jobs/${entityId}/events`;
      } else {
        endpoint = `/api/company/${entityId}/events`;
      }
        
      const timestamp = new Date().getTime();
      const response = await fetch(`${endpoint}?limit=50&_t=${timestamp}`);
      
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

  useEffect(() => {
    if (!initialEvents.length) {
      fetchEvents();
    }
  }, [initialEvents.length, fetchEvents]);

  const handleAddNote = async () => {
    if (!newNote.trim()) {
      setError("Please enter a note");
      return;
    }

    try {
      setAddingNote(true);
      setError(null);

      let endpoint: string;
      if (entityType === 'candidate') {
        endpoint = `/api/candidate/${entityId}/notes`;
      } else if (entityType === 'job') {
        endpoint = `/api/jobs/${entityId}/notes`;   // ✅ FIXED - this was the bug
      } else {
        endpoint = `/api/company/${entityId}/notes`;
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          noteText: newNote.trim(),
          noteType: noteType,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to add note');
      }

      toast.success("Note added successfully");
      setNewNote('');
      setNoteType('general');
      await new Promise(resolve => setTimeout(resolve, 300));
      await fetchEvents();
    } catch (err: any) {
      console.error('Failed to add note:', err);
      setError(err.message || 'Failed to add note');
      toast.error(err.message || 'Failed to add note');
    } finally {
      setAddingNote(false);
    }
  };

  function getEventIcon(eventType: EventType) {
    const icons: Record<string, React.ReactNode> = {
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

  function getEventColor(eventType: EventType): string {
    const colors: Record<string, string> = {
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

  function getEventLabel(eventType: EventType): string {
    const labels: Record<string, string> = {
      NOTE: 'Note',
      EMAIL_SENT: 'Email Sent',
      EMAIL_OPENED: 'Email Opened',
      EMAIL_CLICKED: 'Link Clicked',
      STATUS_CHANGED: 'Status Changed',
      STAGE_CHANGED: 'Stage Changed',
      INTERVIEW_SCHEDULED: 'Interview',
      INTERVIEW_COMPLETED: 'Interview Done',
      CANDIDATE_CREATED: 'Added',
      CANDIDATE_VIEWED:
