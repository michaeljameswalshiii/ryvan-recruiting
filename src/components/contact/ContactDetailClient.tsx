'use client';

/**
 * Contact Detail Client Component
 * Displays contact info and allows logging activities
 * Now uses separate events table (decoupled from client.contacts[].notes)
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { ArrowLeft, Phone, Edit, Mail, Plus } from 'lucide-react';

interface Activity {
  id: string;
  type: string;
  content: string;
  createdAt: string;
  createdBy?: string;
}

export default function ContactDetailClient({ contact: initialContact }: { contact: any }) {
  const router = useRouter();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loadingActivities, setLoadingActivities] = useState(true);
  const [noteType, setNoteType] = useState('');
  const [noteContent, setNoteContent] = useState('');

  // Load activities from the new events table
  const loadActivities = async () => {
    try {
      setLoadingActivities(true);
      const res = await fetch(`/api/data/contacts/${initialContact.id}/notes`);
      if (res.ok) {
        const data = await res.json();
        setActivities(data.events || []);
      }
    } catch (e) {
      console.error('Failed to load activities', e);
    } finally {
      setLoadingActivities(false);
    }
  };

  useEffect(() => {
    loadActivities();
  }, [initialContact.id]);

  const handleLogActivity = async () => {
    if (!noteType || !noteContent.trim()) {
      toast.error("Please select a type and enter a note");
      return;
    }

    try {
      const res = await fetch(`/api/data/contacts/${initialContact.id}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: noteType,
          content: noteContent,
          createdBy: 'current-user',
          companyId: initialContact.companyId,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        toast.success('Activity logged successfully');
        setNoteContent('');
        setNoteType('');
        
        // Refresh the list from server
        await loadActivities();
        
        // Optional: revalidate server components
        router.refresh();
      } else {
        toast.error(data.error || 'Failed to log activity');
      }
    } catch (err: any) {
      console.error(err);
      toast.error('Failed to log activity');
    }
  };

  const initials = initialContact.name?.split(' ').map((n: string) => n[0]).join('').toUpperCase() || '??';

  return (
    <div className="max-w-7xl mx-auto p-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => window.history.back()} 
            className="text-gray-500 hover:text-gray-700 p-2 -ml-2"
          >
            <ArrowLeft className="h-6 w-6" />
          </button>

          <div className="w-16 h-16 rounded-full bg-green-600 flex items-center justify-center text-3xl font-bold text-white">
            {initials}
          </div>

          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-semibold">{initialContact.name}</h1>
              {initialContact.isPrimary && (
                <span className="px-3 py-1 text-sm bg-yellow-100 text-yellow-700 rounded-full font-medium">⭐ Primary</span>
              )}
            </div>
            <p className="text-gray-600 text-lg">{initialContact.title}</p>
            {initialContact.companyName && <p className="text-sm text-gray-500">{initialContact.companyName}</p>}
          </div>
        </div>

        <div className="flex gap-3">
          <Button variant="outline" className="flex items-center gap-2">
            <Phone className="h-4 w-4" /> Call
          </Button>
          <Button variant="outline" className="flex items-center gap-2">
            <Edit className="h-4 w-4" /> Edit
          </Button>
          <Button className="flex items-center gap-2">
            <Mail className="h-4 w-4" /> Send Email
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left - Activity & Notes */}
        <div className="lg:col-span-8">
          <div className="bg-white border rounded-2xl p-6">
            <h3 className="text-lg font-semibold mb-4">ACTIVITY & NOTES</h3>

            {/* Log Form */}
            <div className="flex gap-3 mb-6">
              <select
                value={noteType}
                onChange={(e) => setNoteType(e.target.value)}
                className="border rounded-lg px-4 py-2.5"
              >
                <option value="">Select Type</option>
                <option value="Phone Call">Phone Call</option>
                <option value="BD Call">BD Call</option>
                <option value="Meeting">Meeting</option>
                <option value="Submission">Submission</option>
                <option value="Contract Signed">Contract Signed</option>
                <option value="Note">Note</option>
              </select>

              <input
                type="text"
                value={noteContent}
                onChange={(e) => setNoteContent(e.target.value)}
                placeholder="Add detail..."
                className="flex-1 border rounded-lg px-4 py-2.5"
              />

              <Button onClick={handleLogActivity} disabled={!noteType || !noteContent.trim()}>
                Log
              </Button>
            </div>

            {/* Timeline - Now from events table */}
            <div className="space-y-6 max-h-[600px] overflow-y-auto">
              {loadingActivities ? (
                <div className="text-center py-8 text-gray-400">Loading activity...</div>
              ) : activities.length > 0 ? (
                activities.map((note, i) => (
                  <div key={note.id || i} className="border-l-2 border-gray-200 pl-4 py-1">
                    <div className="flex justify-between text-sm">
                      <span className="font-medium">{note.type}</span>
                      <span className="text-gray-500">
                        {new Date(note.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="text-gray-600 mt-1">{note.content}</p>
                  </div>
                ))
              ) : (
                <div className="text-center py-16 text-gray-400">
                  No activity yet. Use the form above to add the first note.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Sidebar */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-white border rounded-2xl p-6">
            <div className="flex justify-between mb-4">
              <h3 className="font-semibold">Open Jobs</h3>
              <Button size="sm" variant="outline"><Plus className="h-4 w-4 mr-1" /> Add Job</Button>
            </div>
            <p className="text-gray-500 text-sm">No open jobs for this company.</p>
          </div>

          <div className="bg-white border rounded-2xl p-6">
            <h3 className="font-semibold mb-4">Quick Stats</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gray-50 p-4 rounded-xl text-center">
                <div className="text-2xl font-semibold">0</div>
                <div className="text-sm text-gray-500">Open Jobs</div>
              </div>
              <div className="bg-gray-50 p-4 rounded-xl text-center">
                <div className="text-2xl font-semibold">0</div>
                <div className="text-sm text-gray-500">Candidates</div>
              </div>
            </div>
          </div>

          <div className="bg-white border rounded-2xl p-6">
            <h3 className="font-semibold mb-4">AI Client Tools</h3>
            <div className="space-y-3">
              <Button className="w-full justify-start" variant="default">✨ Draft Outreach / Follow-Up</Button>
              <Button className="w-full justify-start" variant="secondary">🔍 Research This Contact</Button>
              <Button className="w-full justify-start" variant="secondary">👥 Find Similar Contacts</Button>
              <Button className="w-full justify-start" variant="secondary">📋 Generate Client Summary</Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
