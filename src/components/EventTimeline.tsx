"use client";

import React, { useState, useEffect, useCallback } from 'react';

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
  maxHeight = "500px",
}: EventTimelineProps) {
  const [events, setEvents] = useState<EventItem[]>(initialEvents);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [newNote, setNewNote] = useState('');
  const [noteType, setNoteType] = useState('general');
  const [addingNote, setAddingNote] = useState(false);

  const fetchEvents = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      let endpoint: string;
      if (entityType === 'candidate') endpoint = `/api/candidate/${entityId}/events`;
      else if (entityType === 'job') endpoint = `/api/jobs/${entityId}/events`;
      else endpoint = `/api/company/${entityId}/events`;

      const response = await fetch(`${endpoint}?limit=50&_t=${Date.now()}`, { cache: 'no-store' });
      if (!response.ok) throw new Error('Failed to fetch events');

      const data = await response.json();
      setEvents(data.events || []);
    } catch (err: any) {
      console.error(err);
      setError('Failed to load events');
    } finally {
      setLoading(false);
    }
  }, [entityType, entityId]);

  useEffect(() => {
    if (!initialEvents.length) fetchEvents();
  }, [initialEvents.length, fetchEvents]);

  const getEventIcon = (type: string) => (type === 'NOTE' ? '📝' : '⏰');
  const getEventColor = (type: string) => (type === 'NOTE' ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100 text-gray-800');
  const getEventLabel = (type: string) => (type === 'NOTE' ? 'Note' : type.replace(/_/g, ' '));
  const formatDate = (d: string) => new Date(d).toLocaleString();

  const handleAddNote = async () => {
    if (!newNote.trim()) return;

    const noteText = newNote.trim();
    const optimistic = {
      id: `temp-${Date.now()}`,
      entityType,
      entityId,
      eventType: 'NOTE',
      title: 'Note Added',
      description: noteText,
      metadata: { noteText, noteType },
      createdAt: new Date().toISOString(),
      createdBy: 'user',
    } as EventItem;

    setEvents(prev => [optimistic, ...prev]);

    try {
      setAddingNote(true);
      let endpoint = `/api/jobs/${entityId}/notes`;
      if (entityType === 'candidate') endpoint = `/api/candidate/${entityId}/notes`;
      if (entityType === 'company') endpoint = `/api/company/${entityId}/notes`;

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ noteText, noteType }),
      });

      if (!res.ok) throw new Error('Failed');

      setNewNote('');
      setNoteType('general');
      await new Promise(r => setTimeout(r, 800));
      await fetchEvents();
    } catch (e) {
      console.error(e);
      setEvents(prev => prev.filter(ev => ev.id !== optimistic.id));
    } finally {
      setAddingNote(false);
    }
  };

  return (
    <div className="bg-white border rounded-xl">
      <div className="border-b border-border p-4">
        <div className="mb-3">
          <label className="text-sm font-medium mb-2 block">Note Type</label>
          <select value={noteType} onChange={(e) => setNoteType(e.target.value)} className="w-full p-2 text-sm border rounded-md">
            {noteTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div className="mb-3">
          <label className="text-sm font-medium mb-2 block">Notes</label>
          <textarea
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            placeholder="Add a note..."
            rows={3}
            className="w-full p-2 border rounded-md"
          />
        </div>
        <button
          onClick={handleAddNote}
          disabled={addingNote || !newNote.trim()}
          className="w-full py-2 bg-blue-600 text-white rounded-md disabled:opacity-50"
        >
          {addingNote ? 'Adding...' : 'Add Note'}
        </button>
      </div>

      <div className="p-4" style={{ maxHeight, overflowY: 'auto' }}>
        {events.length === 0 ? (
          <div className="text-center py-8 text-gray-500">No events yet.</div>
        ) : (
          events.map((event, i) => (
            <div key={event.id || i} className="mb-6">
              <div className="font-medium">{event.title}</div>
              <div className="text-sm text-gray-600">{event.description}</div>
              <div className="text-xs text-gray-500">
                {formatDate(event.createdAt)} by {event.createdBy}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
