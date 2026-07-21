'use client';

import { 
  StickyNote, 
  Mail, 
  Phone, 
  Clock,
  Calendar,
  CheckCircle2,
  MessageSquare,
  Send,
  Building2,
  UserPlus,
  UserMinus,
  Briefcase,
  TrendingUp,
  TrendingDown,
  Trophy,
  XCircle,
  Handshake,
} from 'lucide-react';
import { stripActivityTypePrefix } from '@/lib/contacts/activity-types';

// Simple interface for passing events directly (used by ContactDetailClient)
export interface SimpleEventItem {
  id?: string;
  type?: string;
  title?: string;
  content?: string;
  description?: string;
  createdAt?: string;
  metadata?: Record<string, any>;
  // Add other optional fields as needed
  [key: string]: any;
}

interface EventTimelineProps {
  events?: SimpleEventItem[];
  emptyMessage?: string;
  maxHeight?: string;
}

// Map activity types to icons (keys without numbers; past data normalized)
function getActivityIcon(type: string): React.ReactNode {
  const key = stripActivityTypePrefix(type).toLowerCase();
  if (key.includes('voicemail') || key.includes('no answer') || key.includes('phone') || key.includes('call'))
    return <Phone className="w-4 h-4" />;
  if (key.includes('email')) return <Mail className="w-4 h-4" />;
  if (key.includes('text') || key.includes('conversation') || key.includes('linkedin'))
    return <MessageSquare className="w-4 h-4" />;
  if (key.includes('proposal') || key.includes('contract') || key.includes('sent'))
    return <Send className="w-4 h-4" />;
  if (key.includes('signed') || key.includes('completed') || key.includes('check-in'))
    return <Trophy className="w-4 h-4" />;
  if (key.includes('meeting') || key.includes('demo') || key.includes('handshake'))
    return <Handshake className="w-4 h-4" />;
  if (key.includes('referral') || key.includes('contact'))
    return <UserPlus className="w-4 h-4" />;
  if (key.includes('not interested') || key.includes('do not'))
    return <XCircle className="w-4 h-4" />;
  if (key.includes('note') || key.includes('other'))
    return <StickyNote className="w-4 h-4" />;
  return <Clock className="w-4 h-4" />;
}

function getActivityColor(type: string): string {
  const key = stripActivityTypePrefix(type).toLowerCase();
  if (key.includes('email') || key.includes('voicemail') || key.includes('text'))
    return 'bg-blue-100 text-blue-800';
  if (key.includes('linkedin') || key.includes('conversation'))
    return 'bg-indigo-100 text-indigo-800';
  if (key.includes('no answer')) return 'bg-gray-100 text-gray-800';
  if (key.includes('proposal') || key.includes('contract'))
    return 'bg-amber-100 text-amber-800';
  if (key.includes('signed') || key.includes('engaged') || key.includes('completed'))
    return 'bg-green-100 text-green-800';
  if (key.includes('meeting') || key.includes('demo') || key.includes('discovery') || key.includes('qualification'))
    return 'bg-violet-100 text-violet-800';
  if (key.includes('not interested') || key.includes('do not'))
    return 'bg-red-100 text-red-800';
  if (key.includes('follow')) return 'bg-sky-100 text-sky-800';
  return 'bg-gray-100 text-gray-800';
}

function getActivityLabel(type: string): string {
  return stripActivityTypePrefix(type) || 'Activity';
}

// Format date with relative time
function formatDate(dateString: string) {
  if (!dateString) return '';
  
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

export default function EventTimeline({
  events = [],
  emptyMessage = 'No activity yet',
  maxHeight = '500px',
}: EventTimelineProps) {
  
  // If events is not an array, don't render
  if (!Array.isArray(events) || events.length === 0) {
    return (
      <div className="border border-border rounded-lg bg-background p-8 text-center text-muted-foreground">
        {emptyMessage || 'No activity yet'}
      </div>
    );
  }

  return (
    <div className="border border-border rounded-lg bg-background overflow-hidden">
      {/* Header */}
      <div className="border-b border-border p-4">
        <p className="text-sm text-muted-foreground">
          {events.length} activit{events.length !== 1 ? 'ies' : 'y'} • Chronological
        </p>
      </div>

      {/* Events List */}
      <div style={{ maxHeight }} className="overflow-y-auto">
        <div className="relative p-4">
          {/* Timeline Line */}
          <div 
            className="absolute left-6 top-4 bottom-4 w-0.5 bg-border" 
          />
          
          <div className="flex flex-col gap-4">
            {events.map((event, index) => {
              const eventColor = getActivityColor(event.type || '');
              const eventLabel = getActivityLabel(event.type || '');
              const eventIcon = getActivityIcon(event.type || '');
              
              return (
                <div key={event.id || `event-${index}`} className="flex gap-3 relative">
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
                      {event.createdAt && (
                        <span className="text-xs text-muted-foreground">
                          {formatDate(event.createdAt)}
                        </span>
                      )}
                    </div>
                    <div className="font-medium text-sm">
                      {event.title || event.content}
                    </div>
                    {(event.description || event.content) && (
                      <p className="text-sm text-muted-foreground mt-1">
                        {event.description || event.content}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
