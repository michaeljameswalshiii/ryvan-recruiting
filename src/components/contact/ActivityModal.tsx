'use client';

import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import {
  CONTACT_ACTIVITY_TYPES,
  stripActivityTypePrefix,
} from '@/lib/contacts/activity-types';

type Activity = {
  id?: string;
  type: string;
  title: string;
  description?: string;
  date: string;
};

const activityTypes = [...CONTACT_ACTIVITY_TYPES];

interface ActivityModalProps {
  isOpen: boolean;
  onClose: () => void;
  activity?: Activity | null;
  onSave: (data: Activity) => void;
  isLoading?: boolean;
}

// Helper to format date safely
const formatDateSafe = (d: string | undefined): string => {
  if (!d) return new Date().toISOString().split('T')[0];
  if (typeof d === 'string') return d.split('T')[0];
  return new Date(d).toISOString().split('T')[0];
};

export default function ActivityModal({
  isOpen,
  onClose,
  activity,
  onSave,
  isLoading = false,
}: ActivityModalProps) {
  const [form, setForm] = useState<Activity>({
    type: '',
    title: '',
    description: '',
    date: new Date().toISOString().split('T')[0],
  });

  useEffect(() => {
    if (activity) {
      setForm({
        id: activity.id,
        type: stripActivityTypePrefix(activity.type || ''),
        title: activity.title || '',
        description: activity.description || '',
        date: formatDateSafe(activity.date),
      });
    } else {
      setForm({
        type: '',
        title: '',
        description: '',
        date: new Date().toISOString().split('T')[0],
      });
    }
  }, [activity]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(form);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl w-full max-w-md mx-4 shadow-xl">
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-semibold">
            {activity ? 'Edit Activity' : 'Log New Activity'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
            <select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
              required
              className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select activity type</option>
              {activityTypes.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              required
              placeholder="e.g. Follow-up call with Michael"
              className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description (optional)</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={3}
              placeholder="Additional notes..."
              className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
            />
          </div>

          {/* Date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
            <input
              type="date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
              required
              className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 border border-gray-300 rounded-xl font-medium hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {isLoading ? 'Saving...' : activity ? 'Save Changes' : 'Log Activity'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
