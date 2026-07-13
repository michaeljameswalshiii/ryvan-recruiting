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
  metadata?: any;
  createdAt: string;
  createdBy: string;
}

interface EventTimelineProps {
  entityType: EntityType;
  entityId: string;
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
  initialEvents = [],
  maxHeight = "500px",
}: EventTimelineProps) {
  const [events, setEvents] = useState<EventItem[]>(initialEvents);
  const [newNote, setNewNote] = useState('');
  const [noteType, setNoteType] = useState('general');
  const [addingNote, setAddingNote] = useState(false);

  const fetchEvents = useCallback(async () => {
    try {
      let endpoint = `/api/jobs/${entityId}/events`;
      if (entityType === 'candidate') endpoint = `/api/candidate/${entityId}/events`;
      if (entityType === 'company') endpoint = `/api/company/${entityId}/events`;

      const res = await fetch(`${endpoint}?limit=50&_t=${Date.now()}`);
      const data = await res.json();
      
      console.log(`[DEBUG] Fetched ${data.events?.length || 0} events for ${entityType} ${entityId}`, data.events);
      
      // Look for NOTE events
      const noteEvents = (data.events || []).filter((e: any) => e.eventType === 'NOTE');
      console.log(`[DEBUG] Found ${noteEvents.length} NOTE events`, noteEvents);

      setEvents(data.events || []);
    } catch (e) {
      console.error('[DEBUG] Fetch error:', e);
    }
  }, [entityType, entityId]);

  useEffect(() => {
    if (initialEvents.length === 0) fetchEvents();
  }, [initialEvents.length, fetchEvents]);

  const handleAddNote = async () => {
    if (!newNote.trim()) return;

    const noteText = newNote.trim();
    const tempId = `temp-${Date.now()}`;

    const optimistic = {
      id: tempId,
      entityType,
      entityId,
      eventType: 'NOTE',
      title: 'Note Added',
      description: noteText,
      createdAt: new Date().toISOString(),
      createdBy: 'You',
    } as EventItem;

    setEvents(prev => [optimistic, ...prev]);

    try {
      setAddingNote(true);

      let endpoint = `/api/jobs/${entityId}/notes`;
      if (entityType === 'candidate') endpoint = `/api/candidate/${entityId}/notes`;
      if (entityType === 'company') endpoint = `/api/company/${entityId}/notes`;

      console.log(`[DEBUG] Posting note to ${endpoint}`);

      await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ noteText, noteType }),
      });

      setNewNote('');
      setNoteType('general');

      // Aggressive polling
      for (let i = 0; i < 10; i++) {
        await new Promise(r => setTimeout(r, 700));
        await fetchEvents();
        const hasNote = events.some(e => e.eventType === 'NOTE' && e.id !== tempId);
        if (hasNote) break;
      }
    } catch (e) {
      console.error(e);
      setEvents(prev => prev.filter(e => e.id !== tempId));
    } finally {
      setAddingNote(false);
    }
  };

  return (
    <div className="bg-white border rounded-xl">
      <div className="border-b border-border p-4">
        <div className="mb-3">
          <label className="text-sm font-medium mb-2 block">Note Type</label>
          <select value={noteType} onChange={(e) => setNoteType(e.target.value)} className="w-full p-2 border rounded">
            {noteTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div className="mb-3">
          <label className="text-sm font-medium mb-2 block">Notes</label>
          <textarea value={newNote} onChange={(e) => setNewNote(e.target.value)} placeholder="Add a note..." rows={3} className="w-full p-2 border rounded" />
        </div>
        <button onClick={handleAddNote} disabled={addingNote || !newNote.trim()} className="w-full py-2 bg-blue-600 text-white rounded disabled:opacity-50">
          {addingNote ? 'Adding...' : 'Add Note'}
        </button>
      </div>

      <div className="p-4" style={{ maxHeight, overflowY: 'auto' }}>
        {events.map((event, i) => (
          <div key={event.id || i} className="mb-4 p-3 border-l-4 border-yellow-400 bg-yellow-50">
            <strong>{event.title}</strong>
            <p>{event.description}</p>
            <small>{event.createdAt} by {event.createdBy}</small>
          </div>
        ))}
        {events.length === 0 && <div className="text-center py-8 text-gray-500">No events yet</div>}
      </div>
    </div>
  );
}
