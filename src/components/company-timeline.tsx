'use client';

import { useState, useEffect } from 'react';
import { getCompanyEvents, addNoteToCompany } from '@/lib/events';

interface CompanyTimelineProps {
  companyId: string;
}

export default function CompanyTimeline({ companyId }: CompanyTimelineProps) {
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [noteText, setNoteText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadEvents = async () => {
    setLoading(true);
    try {
      const response = await getCompanyEvents(companyId, 50);
      setEvents(response.events);
    } catch (error) {
      console.error('Failed to load events:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEvents();
  }, [companyId]);

  const handleAddNote = async () => {
    if (!noteText.trim()) return;

    setSubmitting(true);
    try {
      await addNoteToCompany(companyId, noteText, 'current-user@example.com'); // Replace with real user
      setNoteText('');
      await loadEvents(); // Refresh timeline
    } catch (error) {
      console.error('Failed to add note:', error);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Add Note Section */}
      <div className="bg-white p-4 rounded-lg border">
        <textarea
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          placeholder="Add a note..."
          className="w-full h-24 p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          onClick={handleAddNote}
          disabled={submitting || !noteText.trim()}
          className="mt-3 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {submitting ? 'Adding...' : 'Add Note'}
        </button>
      </div>

      {/* Timeline */}
      <div>
        <h3 className="text-lg font-semibold mb-4">Activity Timeline</h3>

        {loading ? (
          <p>Loading activity...</p>
        ) : events.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            No activity yet
          </div>
        ) : (
          <div className="space-y-6">
            {events.map((event) => (
              <div key={event.id} className="flex gap-4">
                <div className="w-2 h-2 mt-2 bg-blue-500 rounded-full flex-shrink-0" />
                <div className="flex-1">
                  <div className="font-medium">{event.title}</div>
                  <div className="text-gray-600 mt-1">{event.description}</div>
                  <div className="text-xs text-gray-400 mt-1">
                    {new Date(event.createdAt).toLocaleDateString()} at{' '}
                    {new Date(event.createdAt).toLocaleTimeString()} • {event.createdBy}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
