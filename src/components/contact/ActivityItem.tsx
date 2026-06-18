'use client';

import { Edit2, Trash2 } from 'lucide-react';

type Activity = {
  id: string;
  type: string;
  title?: string;
  description?: string;
  content?: string;
  createdAt?: string;
};

interface ActivityItemProps {
  activity: Activity;
  onEdit: (activity: Activity) => void;
  onDelete: (id: string) => void;
}

export default function ActivityItem({ activity, onEdit, onDelete }: ActivityItemProps) {
  const isOutreach =
    activity.type.includes('Voicemail') ||
    activity.type.includes('Email') ||
    activity.type.includes('Text') ||
    activity.type.includes('LinkedIn');

  const isBD =
    activity.type.includes('BD') ||
    activity.type.includes('Proposal') ||
    activity.type.includes('Contract');

  const getBorderColor = () => {
    if (isBD) return 'border-blue-500';
    if (isOutreach) return 'border-amber-500';
    return 'border-emerald-500';
  };

  return (
    <div className={`border-l-4 pl-4 py-4 rounded-lg bg-white shadow-sm ${getBorderColor()}`}>
      <div className="flex justify-between items-start">
        <div>
          <div className="font-semibold text-lg">{activity.type}</div>
          {activity.title && (
            <div className="text-gray-700 mt-1 font-medium">{activity.title}</div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="text-xs text-gray-500 whitespace-nowrap">
            {activity.createdAt ? new Date(activity.createdAt).toLocaleDateString() : ''}
          </div>
          <button
            onClick={() => onEdit(activity)}
            className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            title="Edit"
          >
            <Edit2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => onDelete(activity.id)}
            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            title="Delete"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
      {activity.description && (
        <p className="text-gray-700 mt-2 leading-relaxed">{activity.description}</p>
      )}
    </div>
  );
}
