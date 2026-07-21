"use client";

import React, { useState, useEffect, useCallback } from "react";

export type EntityType = "candidate" | "company" | "job";

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
  /** When true, skip outer card chrome (parent already provides a card). */
  embedded?: boolean;
}

const noteTypes = [
  { value: "general", label: "General" },
  { value: "follow_up", label: "Follow-up" },
  { value: "meeting", label: "Client Call" },
  { value: "phone_call", label: "Interview" },
  { value: "email_sent", label: "Submittal" },
  { value: "other", label: "Other" },
];

function formatWhen(iso?: string) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function EventTimeline({
  entityType,
  entityId,
  initialEvents = [],
  maxHeight = "500px",
  embedded = false,
}: EventTimelineProps) {
  const [events, setEvents] = useState<EventItem[]>(initialEvents);
  const [newNote, setNewNote] = useState("");
  const [noteType, setNoteType] = useState("general");
  const [addingNote, setAddingNote] = useState(false);

  const fetchEvents = useCallback(async () => {
    try {
      let endpoint = `/api/jobs/${entityId}/events`;
      if (entityType === "candidate") endpoint = `/api/candidate/${entityId}/events`;
      if (entityType === "company") endpoint = `/api/company/${entityId}/events`;

      const res = await fetch(`${endpoint}?limit=50&_t=${Date.now()}`);
      const data = await res.json();

      console.log(
        `[DEBUG] Fetched ${data.events?.length || 0} events for ${entityType} ${entityId}`
      );

      setEvents(data.events || []);
    } catch (e) {
      console.error("[DEBUG] Fetch error:", e);
    }
  }, [entityType, entityId]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const handleAddNote = async () => {
    // Detail text optional
    const noteText = newNote.trim();
    const tempId = `temp-${Date.now()}`;

    const optimistic = {
      id: tempId,
      entityType,
      entityId,
      eventType: "NOTE",
      title: "Note Added",
      description: noteText,
      createdAt: new Date().toISOString(),
      createdBy: "You",
    } as EventItem;

    setEvents((prev) => [optimistic, ...prev]);

    try {
      setAddingNote(true);

      let endpoint = `/api/jobs/${entityId}/notes`;
      if (entityType === "candidate") endpoint = `/api/candidate/${entityId}/notes`;
      if (entityType === "company") endpoint = `/api/company/${entityId}/notes`;

      await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ noteText, noteType }),
      });

      setNewNote("");
      setNoteType("general");

      for (let i = 0; i < 12; i++) {
        await new Promise((r) => setTimeout(r, 800));
        await fetchEvents();
        if (
          events.some(
            (e) =>
              e.eventType === "NOTE" &&
              e.description?.includes(noteText.substring(0, 20))
          )
        )
          break;
      }
    } catch (e) {
      console.error(e);
      setEvents((prev) => prev.filter((e) => e.id !== tempId));
    } finally {
      setAddingNote(false);
    }
  };

  const shellClass = embedded
    ? ""
    : "bg-white border rounded-xl overflow-hidden";

  return (
    <div className={shellClass}>
      {/* Note type chips + composer */}
      <div className={embedded ? "pb-3" : "border-b border-gray-100 p-4"}>
        <div className="flex flex-wrap gap-1.5 mb-3">
          {noteTypes.map((t) => {
            const active = noteType === t.value;
            return (
              <button
                key={t.value}
                type="button"
                onClick={() => setNoteType(t.value)}
                className={`rounded-full px-2.5 py-1 text-xs font-medium border transition-colors ${
                  active
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>
        <textarea
          value={newNote}
          onChange={(e) => setNewNote(e.target.value)}
          placeholder="Add a note..."
          rows={3}
          className="w-full p-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
        />
        <button
          type="button"
          onClick={handleAddNote}
          disabled={addingNote}
          className="mt-2 w-full py-2 bg-blue-600 text-white text-sm font-medium rounded-lg disabled:opacity-50 hover:bg-blue-700 transition-colors"
        >
          {addingNote ? "Adding..." : "Add Note"}
        </button>
      </div>

      {/* Recent activity */}
      <div className={embedded ? "pt-2" : "p-4"}>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-3">
          Recent activity
        </p>
        <div style={{ maxHeight, overflowY: "auto" }} className="space-y-2.5 pr-1">
          {events.map((event, i) => (
            <div
              key={event.id || i}
              className="relative pl-4 border-l-2 border-blue-200"
            >
              <span className="absolute -left-[5px] top-1.5 h-2 w-2 rounded-full bg-blue-500" />
              <p className="text-sm font-medium text-gray-900 leading-snug">
                {event.title}
              </p>
              {event.description ? (
                <p className="text-sm text-gray-600 mt-0.5 whitespace-pre-wrap">
                  {event.description}
                </p>
              ) : null}
              <p className="text-[11px] text-gray-400 mt-1">
                {formatWhen(event.createdAt)}
                {event.createdBy ? ` · ${event.createdBy}` : ""}
              </p>
            </div>
          ))}
          {events.length === 0 && (
            <div className="text-center py-8 text-sm text-gray-500">
              No events yet
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
