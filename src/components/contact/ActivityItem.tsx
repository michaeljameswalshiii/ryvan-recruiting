'use client';
import { useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { normalizeContactActivityType } from '@/lib/contacts/activity-types';

type Activity = {
  id: string;
  type: string;
  title: string;
  description?: string;
  createdAt: string;
};

interface ActivityItemProps {
  activity: Activity;
  onEdit: (activity: Activity) => void;
  onDelete: (id: string) => void;
}

export default function ActivityItem({ activity, onEdit, onDelete }: ActivityItemProps) {
  const [showConfirm, setShowConfirm] = useState(false);
  const typeLabel = normalizeContactActivityType(activity.type);

  return (
    <div className="group relative border-l-4 border-orange-500 pl-4 py-3 hover:bg-gray-50 rounded-r-xl flex gap-4">
      <div className="flex-1">
        <div className="font-medium">{typeLabel}</div>
        <div className="text-gray-900">{activity.title}</div>
        {activity.description && (
          <p className="text-sm text-gray-600 mt-1">{activity.description}</p>
        )}
      </div>

      <div className="text-right text-sm text-gray-500 whitespace-nowrap">
        {activity.createdAt}
      </div>

      {/* Hover Actions */}
      <div className="absolute right-4 top-4 opacity-0 group-hover:opacity-100 flex gap-1">
        <button
          onClick={() => onEdit(activity)}
          className="p-1.5 hover:bg-blue-50 rounded text-blue-600"
        >
          <Pencil className="w-4 h-4" />
        </button>
        <button
          onClick={() => setShowConfirm(true)}
          className="p-1.5 hover:bg-red-50 rounded text-red-600"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {showConfirm && (
        <div className="absolute inset-0 bg-white/95 flex items-center justify-center rounded-xl z-10">
          <div className="text-center">
            <p className="text-red-600 font-medium mb-2">Delete activity?</p>
            <div className="flex gap-3">
              <button onClick={() => setShowConfirm(false)} className="px-4 py-1 border rounded">
                Cancel
              </button>
              <button 
                onClick={() => { onDelete(activity.id); setShowConfirm(false); }}
                className="px-4 py-1 bg-red-600 text-white rounded"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
