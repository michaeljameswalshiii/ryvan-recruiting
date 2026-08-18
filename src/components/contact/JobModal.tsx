'use client';

import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { SalaryRangeFields } from '@/components/job/SalaryRangeFields';

type Job = {
  id?: string;
  title: string;
  company?: string;
  location?: string;
  description?: string;
  salaryRange?: string;
  employmentType?: string;
  status?: string;
  contactId?: string;
};

interface JobModalProps {
  isOpen: boolean;
  onClose: () => void;
  job?: Job | null;
  contactId?: string;
  companyReadOnly?: boolean;
  defaultCompany?: string;
  onSave: (data: Job) => void;
  isLoading?: boolean;
}

const employmentTypes = [
  'Full-time',
  'Part-time',
  'Contract',
  'Internship',
  'Temporary',
];

const jobStatuses = [
  'Open',
  'Paused',
  'Filled',
  'Lost',
  'Closed',
];

export default function JobModal({
  isOpen,
  onClose,
  job,
  contactId,
  companyReadOnly = false,
  defaultCompany = '',
  onSave,
  isLoading = false,
}: JobModalProps) {
  const [form, setForm] = useState<Job>({
    title: '',
    company: defaultCompany,
    location: '',
    description: '',
    salaryRange: '',
    employmentType: 'Full-time',
    status: 'Open',
  });

  useEffect(() => {
    if (job) {
      setForm({
        id: job.id,
        title: job.title || '',
        company: job.company || defaultCompany,
        location: job.location || '',
        description: job.description || '',
        salaryRange: job.salaryRange || '',
        employmentType: job.employmentType || 'Full-time',
        status: job.status || 'Open',
      });
    } else {
      setForm({
        title: '',
        company: defaultCompany,
        location: '',
        description: '',
        salaryRange: '',
        employmentType: 'Full-time',
        status: 'Open',
      });
    }
  }, [job, defaultCompany, isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      ...form,
      contactId,
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl w-full max-w-lg mx-4 shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-semibold">
            {job ? 'Edit Job' : 'Add New Job'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Job Title *</label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              required
              placeholder="e.g. Senior Software Engineer"
              className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Company */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Company</label>
            <input
              type="text"
              value={form.company || ''}
              onChange={(e) => setForm({ ...form, company: e.target.value })}
              placeholder="Company name"
              readOnly={companyReadOnly}
              className={`w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                companyReadOnly ? 'bg-gray-50 text-gray-700' : ''
              }`}
            />
          </div>

          {/* Location & Employment Type */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
              <input
                type="text"
                value={form.location || ''}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                placeholder="e.g. San Francisco, CA"
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Employment Type</label>
              <select
                value={form.employmentType || 'Full-time'}
                onChange={(e) => setForm({ ...form, employmentType: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {employmentTypes.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>

          <SalaryRangeFields
            value={form.salaryRange || ''}
            onChange={(salaryRange) => setForm({ ...form, salaryRange })}
          />

          {/* Status */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select
              value={form.status || 'Open'}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {jobStatuses.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description (optional)</label>
            <textarea
              value={form.description || ''}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={3}
              placeholder="Job description..."
              className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
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
              disabled={isLoading || !form.title.trim()}
              className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {isLoading ? 'Saving...' : job ? 'Save Changes' : 'Create Job'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
