'use client';

import { useState, useEffect } from 'react';

// Event types matching the server types
type EventType = 'EMAIL_SENT' | 'NOTE' | 'STATUS_CHANGE' | 'INTERVIEW_SCHEDULED';

interface CandidateEvent {
  id: string;
  candidateId: string;
  eventType: EventType;
  title: string;
  description?: string;
  metadata: Record<string, any>;
  createdAt: string;
  createdBy: string;
  timestamp: string;
}

interface EventTimelineProps {
  candidateId: string;
  initialEvents?: CandidateEvent[];
}

export function EventTimeline({ candidateId, initialEvents = [] }: EventTimelineProps) {
  const [events, setEvents] = useState<CandidateEvent[]>(initialEvents);
  const [loading, setLoading] = useState(!initialEvents.length);
  const [error, setError] = useState<string | null>(null);
  const [newNote, setNewNote] = useState('');
  const [addingNote, setAddingNote] = useState(false);

  // Fetch events on mount if not provided
  useEffect(() => {
    if (!initialEvents.length) {
      fetchEvents();
    }
  }, [candidateId]);

  async function fetchEvents() {
    try {
      setLoading(true);
      const response = await fetch(`/api/candidate/${candidateId}/events?limit=20`);
      if (!response.ok) throw new Error('Failed to fetch events');
      const data = await response.json();
      setEvents(data.events || []);
    } catch (err) {
      console.error('Failed to fetch events:', err);
      setError('Failed to load events');
    } finally {
      setLoading(false);
    }
  }

  async function handleAddNote() {
    if (!newNote.trim()) return;
    
    try {
      setAddingNote(true);
      const response = await fetch(`/api/candidate/${candidateId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          noteText: newNote,
          createdBy: 'user@turnkey.com' // In real app, get from auth
        }),
      });
      
      if (!response.ok) throw new Error('Failed to add note');
      
      const data = await response.json();
      if (data.success) {
        setNewNote('');
        // Refresh events
        await fetchEvents();
      }
    } catch (err) {
      console.error('Failed to add note:', err);
      setError('Failed to add note');
    } finally {
      setAddingNote(false);
    }
  }

  // Get icon and color for event type
  function getEventConfig(eventType: EventType) {
    switch (eventType) {
      case 'EMAIL_SENT':
        return { icon: '📧', color: 'bg-blue-100 text-blue-800', label: 'Email' };
      case 'NOTE':
        return { icon: '📝', color: 'bg-yellow-100 text-yellow-800', label: 'Note' };
      case 'STATUS_CHANGE':
        return { icon: '🔄', color: 'bg-purple-100 text-purple-800', label: 'Status' };
      case 'INTERVIEW_SCHEDULED':
        return { icon: '📅', color: 'bg-green-100 text-green-800', label: 'Interview' };
      default:
        return { icon: '📋', color: 'bg-gray-100 text-gray-800', label: 'Event' };
    }
  }

  // Format date
  function formatDate(dateString: string) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  if (loading) {
    return (
      <div style={{
        border: '1px solid #e5e7eb',
        borderRadius: '0.5rem',
        padding: '1.5rem',
        backgroundColor: 'white'
      }}>
        <h3 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '1rem' }}>
          Activity Timeline
        </h3>
        <div style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>
          Loading events...
        </div>
      </div>
    );
  }

  return (
    <div style={{
      border: '1px solid #e5e7eb',
      borderRadius: '0.5rem',
      padding: '1.5rem',
      backgroundColor: 'white'
    }}>
      <h3 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '1rem' }}>
        Activity Timeline
      </h3>

      {/* Add Note Form */}
      <div style={{ marginBottom: '1.5rem' }}>
<textarea
          placeholder="Add a note..."
          value={newNote}
          onChange={(e) => setNewNote(e.target.value)}
          rows={3}
          style={{
            width: '100%',
            padding: '0.5rem',
            border: '1px solid #d1d5db',
            borderRadius: '0.375rem',
            marginBottom: '0.75rem',
            fontSize: '0.875rem',
            fontFamily: 'inherit',
            resize: 'vertical'
          }}
        ></textarea>
        <button 
          onClick={handleAddNote} 
          disabled={addingNote || !newNote.trim()}
          style={{
            width: '100%',
            padding: '0.5rem 1rem',
            backgroundColor: newNote.trim() && !addingNote ? '#2563eb' : '#93c5fd',
            color: 'white',
            border: 'none',
            borderRadius: '0.375rem',
            cursor: newNote.trim() && !addingNote ? 'pointer' : 'not-allowed',
            fontSize: '0.875rem',
            fontWeight: '500'
          }}
        >
          {addingNote ? 'Adding...' : 'Add Note'}
        </button>
      </div>

      {/* Error Message */}
      {error && (
        <div style={{
          marginBottom: '1rem',
          padding: '0.75rem',
          backgroundColor: '#fef2f2',
          color: '#991b1b',
          borderRadius: '0.375rem',
          fontSize: '0.875rem'
        }}>
          {error}
        </div>
      )}

      {/* Events List */}
      {events.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>
          No activity yet
        </div>
      ) : (
        <div style={{ position: 'relative' }}>
          {/* Timeline Line */}
          <div style={{
            position: 'absolute',
            left: '1rem',
            top: 0,
            bottom: 0,
            width: '2px',
            backgroundColor: '#e5e7eb'
          }} />
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {events.map((event) => {
              const config = getEventConfig(event.eventType);
              return (
                <div key={event.id} style={{ display: 'flex', gap: '1rem', position: 'relative' }}>
                  {/* Timeline Dot */}
                  <div style={{
                    position: 'relative',
                    width: '2rem',
                    height: '2rem',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.875rem',
                    backgroundColor: config.color.split(' ')[0],
                    color: config.color.split(' ')[1],
                    flexShrink: 0
                  }}>
                    {config.icon}
                  </div>
                  
                  {/* Event Content */}
                  <div style={{ flex: 1, paddingBottom: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                      <span style={{
                        fontSize: '0.75rem',
                        padding: '0.125rem 0.375rem',
                        borderRadius: '0.25rem',
                        backgroundColor: config.color.split(' ')[0],
                        color: config.color.split(' ')[1],
                        border: '1px solid #d1d5db'
                      }}>
                        {config.label}
                      </span>
                      <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                        {formatDate(event.createdAt)}
                      </span>
                    </div>
                    <div style={{ fontWeight: '500', fontSize: '0.875rem' }}>
                      {event.title}
                    </div>
                    {event.description && (
                      <p style={{ fontSize: '0.875rem', color: '#4b5563', marginTop: '0.25rem' }}>
                        {event.description}
                      </p>
                    )}
                    {event.eventType === 'EMAIL_SENT' && event.metadata?.emailSubject && (
                      <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                        Subject: {event.metadata.emailSubject}
                      </p>
                    )}
                    {event.eventType === 'NOTE' && event.metadata?.noteText && (
                      <p style={{
                        fontSize: '0.875rem',
                        color: '#374151',
                        marginTop: '0.5rem',
                        padding: '0.75rem',
                        backgroundColor: '#f9fafb',
                        borderRadius: '0.375rem'
                      }}>
                        {event.metadata.noteText}
                      </p>
                    )}
                    <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.25rem' }}>
                      by {event.createdBy}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
