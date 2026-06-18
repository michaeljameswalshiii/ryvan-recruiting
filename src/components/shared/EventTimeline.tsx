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

// Map activity types to icons
function getActivityIcon(type: string): React.ReactNode {
  const iconMap: Record<string, React.ReactNode> = {
    // Outreach & Communication
    '01 Left Voicemail': <Phone className="w-4 h-4" />,
    '02 Email Sent': <Mail className="w-4 h-4" />,
    '03 Email Received': <Mail className="w-4 h-4" />,
    '04 Text Sent': <MessageSquare className="w-4 h-4" />,
    '05 Text Received': <MessageSquare className="w-4 h-4" />,
    '06 LinkedIn Message Sent': <Send className="w-4 h-4" />,
    '07 Conversation Engaged': <MessageSquare className="w-4 h-4" />,
    '08 No Answer': <Phone className="w-4 h-4" />,
    
    // Business Development
    '09 Intake Discovery Call': <Phone className="w-4 h-4" />,
    '10 Proposal Sent': <Send className="w-4 h-4" />,
    '11 Contract Sent': <Send className="w-4 h-4" />,
    '12 Contract Signed': <Trophy className="w-4 h-4" />,
    '13 Meeting Site Visit': <Handshake className="w-4 h-4" />,
    '14 Referral Received': <UserPlus className="w-4 h-4" />,
    
    // Relationship Status
    '15 Known Contact': <Building2 className="w-4 h-4" />,
    '16 Client Check-in': <CheckCircle2 className="w-4 h-4" />,
    '17 Referral Made': <UserPlus className="w-4 h-4" />,
    
    // Disposition
    '18 Not Interested No Need': <XCircle className="w-4 h-4" />,
    '19 Not Interested Has Vendor': <XCircle className="w-4 h-4" />,
    '20 Dormant Nurture': <Clock className="w-4 h-4" />,
    '21 Do Not Contact': <XCircle className="w-4 h-4" />,
    '22 General Note': <StickyNote className="w-4 h-4" />,
  };
  
  return iconMap[type] || <Clock className="w-4 h-4" />;
}

// Map activity types to colors
function getActivityColor(type: string): string {
  const colorMap: Record<string, string> = {
    // Outreach & Communication - Blue tones
    '01 Left Voicemail': 'bg-blue-100 text-blue-800',
    '02 Email Sent': 'bg-blue-100 text-blue-800',
    '03 Email Received': 'bg-cyan-100 text-cyan-800',
    '04 Text Sent': 'bg-indigo-100 text-indigo-800',
    '05 Text Received': 'bg-indigo-100 text-indigo-800',
    '06 LinkedIn Message Sent': 'bg-indigo-100 text-indigo-800',
    '07 Conversation Engaged': 'bg-green-100 text-green-800',
    '08 No Answer': 'bg-gray-100 text-gray-800',
    
    // Business Development - Purple/Amber tones
    '09 Intake Discovery Call': 'bg-purple-100 text-purple-800',
    '10 Proposal Sent': 'bg-amber-100 text-amber-800',
    '11 Contract Sent': 'bg-amber-100 text-amber-800',
    '12 Contract Signed': 'bg-yellow-100 text-yellow-800',
    '13 Meeting Site Visit': 'bg-teal-100 text-teal-800',
    '14 Referral Received': 'bg-teal-100 text-teal-800',
    
    // Relationship Status - Green tones
    '15 Known Contact': 'bg-green-100 text-green-800',
    '16 Client Check-in': 'bg-emerald-100 text-emerald-800',
    '17 Referral Made': 'bg-emerald-100 text-emerald-800',
    
    // Disposition - Red/Gray tones
    '18 Not Interested No Need': 'bg-red-100 text-red-800',
    '19 Not Interested Has Vendor': 'bg-red-100 text-red-800',
    '20 Dormant Nurture': 'bg-orange-100 text-orange-800',
    '21 Do Not Contact': 'bg-red-100 text-red-800',
    '22 General Note': 'bg-yellow-100 text-yellow-800',
  };
  
  return colorMap[type] || 'bg-gray-100 text-gray-800';
}

// Get short label for activity type
function getActivityLabel(type: string): string {
  // Remove the prefix number (e.g., "01 Left Voicemail" -> "Left Voicemail")
  if (type && /^\d+/.test(type)) {
    return type.replace(/^\d+\s+/, '');
  }
  return type || 'Activity';
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
