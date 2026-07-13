"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner'; // or your toast library
import { StickyNote, Clock } from 'lucide-react'; // adjust icons as needed

// Types (keep or expand your existing ones)
export type EntityType = 'candidate' | 'company' | 'job';

interface EventItem {
  id: string;
  entityType: EntityType;
  entityId: string;
  eventType: string;
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
  tenantId?: string;
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
  maxHeight = "400px",
}: EventTimelineProps) {
  const [events, setEvents] = useState<EventItem[]>(initialEvents);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Note form state
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
      const response = await fetch(`${endpoint}?limit=50&_t=${timestamp}`, {
        cache: 'no-store',
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch ${entityType} events`);
      }

      const data = await response.json();
      setEvents(data.events || []);
    } catch (err: any) {
      console.error('Failed to fetch events:', err);
      setError(`Failed to load ${entityType} events`);
    } finally {
      setLoading(false);
    }
  }, [entityType, entityId]);

  // Initial load
  useEffect(() => {
    if (!initialEvents.length) {
      fetchEvents();
    }
  }, [initialEvents.length, fetchEvents]);

  // Get icon/color/label helpers (keep your existing ones or add these)
  const getEventIcon = (eventType: string) => {
    if (eventType === 'NOTE') return <StickyNote className="h-4 w-4" />;
    return <Clock className="h-4 w-4" />;
  };

  const getEventColor = (eventType: string) => {
    if (eventType === 'NOTE') return 'bg-yellow-100 text-yellow-800';
    return 'bg-gray-100 text-gray-800';
  };

  const getEventLabel = (eventType: string) => {
    if (eventType === 'NOTE') return 'Note';
    return eventType.replace(/_/g, ' ');
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString();
  };

  // ==================== IMPROVED handleAddNote with Optimistic Update ====================
  const handleAddNote = async () => {
    if (!newNote.trim()) {
      setError("Please enter a note");
      return;
    }

    const noteText = newNote.trim();
    const currentNoteType = noteType;

    // Optimistic event (shows instantly)
    const optimisticEvent: EventItem = {
      id: `temp-${Date.now()}`,
      entityType,
      entityId,
      eventType: 'NOTE',
      title: 'Note Added',
      description: noteText.length > 100 ? noteText.substring(0, 100) + '...' : noteText,
      metadata: {
        noteText,
        noteType: currentNoteType,
      },
      createdAt: new Date().toISOString(),
      createdBy: 'current-user',
      createdByName: undefined,
    };

    // Add to UI immediately
    setEvents(prev => [optimisticEvent, ...prev]);

    try {
      setAddingNote(true);
      setError(null);

      let endpoint: string;
      if (entityType === 'candidate') {
        endpoint = `/api/candidate/${entityId}/notes`;
      } else if (entityType === 'job') {
        endpoint = `/api/jobs/${entityId}/notes`;
      } else {
        endpoint = `/api/company/${entityId}/notes`;
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          noteText,
          noteType: currentNoteType,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to add note');
      }

      toast.success("Note added successfully");
      setNewNote('');
      setNoteType('general');

      // Refetch real data (replaces the optimistic entry)
      await fetchEvents();
    } catch (err: any) {
      console.error('Failed to add note:', err);
      setError(err.message || 'Failed to add note');
      toast.error(err.message || 'Failed to add note');

      // Remove optimistic entry on failure
      setEvents(prev => prev.filter(e => e.id !== optimisticEvent.id));
    } finally {
      setAddingNote(false);
    }
  };

  // ==================== RENDER ====================
  return (
    <div className="bg-white border rounded-xl">
      {/* Note Form - matches your screenshot */}
      <div className="border-b border-border p-4">
        <div className="mb-3">
          <label className="text-sm font-medium mb-2 block">Note Type</label>
          <select
            value={noteType}
            onChange={(e) => setNoteType(e.target.value)}
            className="w-full p-2 text-sm border border-input rounded-md bg-background"
          >
            {noteTypes.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </div>

        <div className="mb-3">
          <label className="text-sm font-medium mb-2 block">Notes</label>
          <textarea
            placeholder="Add a note..."
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            rows={2}
            className="w-full p-2 text-sm border border-input rounded-md resize-y min-h-[60px]"
          />
        </div>

        <button
          onClick={handleAddNote}
          disabled={addingNote || !newNote.trim()}
          className="mt-2 w-full py-2 px-4 rounded-md text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-primary text-primary-foreground hover:bg-primary/90"
        >
          {addingNote ? 'Adding...' : 'Add Note'}
        </button>
      </div>

      {/* Timeline / Events List */}
      <div className="p-4" style={{ maxHeight, overflowY: 'auto' }}>
        {loading && events.length === 0 && (
          <div className="text-center text-sm text-gray-500 py-4">Loading events...</div>
        )}

        {error && <div className="text-red-600 text-sm mb-4">{error}</div>}

        {events.length === 0 && !loading ? (
          <div className="text-center text-sm text-gray-500 py-8">No events yet.</div>
        ) : (
          <div className="space-y-4 relative">
            {/* Vertical timeline line */}
            <div className="absolute left-6 top-0 bottom-0 w-px bg-border" />

            {events.map((event) => (
              <div key={event.id} className="flex gap-3 relative">
                <div className={`relative w-8 h-8 rounded-full flex items-center justify-center text-sm flex-shrink-0 ${getEventColor(event.eventType)}`}>
                  {getEventIcon(event.eventType)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${getEventColor(event.eventType)}`}>
                      {getEventLabel(event.eventType)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatDate(event.createdAt
