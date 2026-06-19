'use client';

import { Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';

type Job = {
  id: string;
  title: string;
  company?: string;
  location?: string;
  status?: string;
};

interface JobListItemProps {
  job: Job;
  onEdit: (job: Job) => void;
  onDelete: (id: string) => void;
}

export default function JobListItem({ job, onEdit, onDelete }: JobListItemProps) {
  const [showConfirm, setShowConfirm] = useState(false);

  return (
    <div className="group relative px-4 py-4 bg-white border border-gray-200 rounded-xl hover:border-blue-300 hover:shadow-sm transition-all">
      <div
        onClick={() => onEdit(job)}
        className="flex items-center justify-between cursor-pointer"
      >
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-gray-900">{job.title}</div>
          {job.company && <p className="text-sm text-gray-600">{job.company}</p>}
          {(job.location || job.status) && (
            <p className="text-xs text-gray-500 mt-1">
              {job.location} {job.status && `• ${job.status}`}
            </p>
          )}
        </div>

        {/* Action buttons - visible on hover */}
        <div className="opacity-0 group-hover:opacity-100 flex gap-1 pl-3">
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(job); }}
            className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            title="Edit job"
          >
            <Pencil className="w-4 h-4" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setShowConfirm(true); }}
            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            title="Delete job"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Delete Confirmation Overlay */}
      {showConfirm && (
        <div className="absolute inset-0 bg-white/95 flex items-center justify-center rounded-xl z-10 border border-red-200">
          <div className="text-center p-4">
            <p className="font-medium text-red-600 mb-3">Delete this job?</p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => setShowConfirm(false)}
                className="px-5 py-2 text-sm border rounded-xl hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  onDelete(job.id);
                  setShowConfirm(false);
                }}
                className="px-5 py-2 text-sm bg-red-600 text-white rounded-xl hover:bg-red-700"
              >
                Yes, Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
