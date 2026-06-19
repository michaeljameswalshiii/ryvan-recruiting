'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { ArrowLeft, Phone, Edit, Mail, Plus } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCreateJob } from '@/lib/hooks/query-job';
import { logContactActivity, getContactActivities, updateContactActivity, deleteContactActivity } from '@/lib/actions/contact-actions';
import { SimpleDialog } from '@/components/ui/simple-dialog';
import ActivityModal from './ActivityModal';
import ActivityItem from './ActivityItem';

interface ContactDetailClientProps {
  contact: any;
  companyJobs?: any[];
}

// Safe sanitizer - expanded to catch everything
const sanitizeActivityForClient = (act: any) => {
  // Handle both string dates and potential Date objects
  const safeCreatedAt = (val: any) => {
    if (!val) return '';
    if (typeof val === 'string') return val.split('T')[0];
    if (val instanceof Date) return val.toISOString().split('T')[0];
    try { return new Date(val).toISOString().split('T')[0]; } catch { return ''; }
  };
  
  return {
    id: act?.id,
    type: act?.type || '',
    title: act?.title || act?.content?.slice(0, 80) || '',
    description: act?.description || act?.content || '',
    createdAt: safeCreatedAt(act?.createdAt),
    date: safeCreatedAt(act?.date),
  };
};

// Sanitize companyJobs - handle BOTH property naming conventions (created_at/modified_at AND createdAt/updatedAt)
const sanitizeJob = (job: any) => {
  const safeDate = (val: any) => {
    if (!val) return undefined;
    if (typeof val === 'string') return val;
    if (val instanceof Date) return val.toISOString();
    try { return new Date(val).toISOString(); } catch { return undefined; }
  };
  
  return {
    ...job,
    // Handle created_at (schema standard)
    created_at: safeDate(job?.created_at || job?.createdAt),
    // Handle modified_at (schema standard)
    modified_at: safeDate(job?.modified_at || job?.updatedAt),
    // Also set legacy names for compatibility
    createdAt: safeDate(job?.created_at || job?.createdAt),
    updatedAt: safeDate(job?.modified_at || job?.updatedAt),
  };
};

// Pre-sanitize companyJobs at render time
const safeCompanyJobs = (companyJobs || []).map(sanitizeJob);

export default function ContactDetailClient({ contact, companyJobs = [] }: ContactDetailClientProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const companyName = contact.companyName || contact.company?.name || 'Unknown Company';
  const companyId = contact.companyId || '';

  // === JOBS ===
  const createJob = useCreateJob();
  const [isAddJobOpen, setIsAddJobOpen] = useState(false);
  const [newJobTitle, setNewJobTitle] = useState('');
  const [newJobDescription, setNewJobDescription] = useState('');
  const [newJobLocation, setNewJobLocation] = useState('');
  const [newJobSalary, setNewJobSalary] = useState('');
  const [newJobEmploymentType, setNewJobEmploymentType] = useState('Full-time');

  // === ACTIVITIES ===
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingActivity, setEditingActivity] = useState<any>(null);

  const { data: rawActivities = [] } = useQuery({
    queryKey: ['contact-activities', contact.id],
    queryFn: () => getContactActivities(contact.id),
    enabled: !!contact.id,
  });

  const activities = rawActivities.map(sanitizeActivityForClient);

  // Mutations
  const saveActivityMutation = useMutation({
    mutationFn: async (data: any) => {
      if (editingActivity?.id) {
        return updateContactActivity({
          contactId: contact.id,
          activityId: editingActivity.id,
          type: data.type,
          content: data.description || data.title,
        });
      }
      return logContactActivity({
        contactId: contact.id,
        type: data.type,
        content: data.description || data.title,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contact-activities', contact.id] });
      setIsModalOpen(false);
      setEditingActivity(null);
      toast.success(editingActivity ? 'Activity updated!' : 'Activity logged!');
    },
    onError: (err: any) => toast.error(err?.message || 'Failed to save'),
  });

  const deleteActivityMutation = useMutation({
    mutationFn: (activityId: string) => deleteContactActivity({ contactId: contact.id, activityId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contact-activities', contact.id] });
      toast.success('Activity deleted!');
    },
  });

  const openCreateModal = () => {
    setEditingActivity(null);
    setIsModalOpen(true);
  };

  const openEditModal = (activity: any) => {
    setEditingActivity(sanitizeActivityForClient(activity));
    setIsModalOpen(true);
  };

  const handleSaveActivity = (data: any) => {
    saveActivityMutation.mutate(data);
  };

  const handleDeleteActivity = (activityId: string) => {
    if (confirm('Delete this activity?')) {
      deleteActivityMutation.mutate(activityId);
    }
  };

  // Job creation placeholder
  const handleCreateJob = async () => {
    if (!newJobTitle.trim()) {
      toast.error("Job title is required");
      return;
    }
    try {
      await createJob.mutateAsync({
        title: newJobTitle,
        description: newJobDescription || "",
        location: newJobLocation || "",
        salaryRange: newJobSalary || "",
        employmentType: newJobEmploymentType,
        companyId,
        companyName,
        status: "Open",
      });
      toast.success("Job created successfully!");
      setIsAddJobOpen(false);
      setNewJobTitle('');
      setNewJobDescription('');
      setNewJobLocation('');
      setNewJobSalary('');
      setNewJobEmploymentType('Full-time');
      router.refresh();
      setTimeout(() => router.refresh(), 500);
    } catch (err: any) {
      toast.error(err?.message || "Failed to create job");
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-6">
      {/* Header */}
      <div className="flex justify-between items-start mb-8">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.back()}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-emerald-600 rounded-full flex items-center justify-center text-white text-3xl font-bold">
              {contact.name?.[0] || '?'}
            </div>
            <div>
              <h1 className="text-4xl font-bold">{contact.name}</h1>
              <p className="text-xl text-gray-600">{contact.title || 'Contact'}</p>
              <p className="text-gray-500">{companyName}</p>
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <Button variant="outline" size="lg"><Phone className="mr-2 h-5 w-5" /> Call</Button>
          <Button variant="outline" size="lg"><Edit className="mr-2 h-5 w-5" /> Edit</Button>
          <Button size="lg"><Mail className="mr-2 h-5 w-5" /> Send Email</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Activities */}
        <div className="lg:col-span-7">
          <div className="bg-white border rounded-2xl p-6">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-semibold">Activity & Relationship Tracking</h3>
              <Button onClick={openCreateModal} size="sm">
                <Plus className="h-4 w-4 mr-2" /> Log New Activity
              </Button>
            </div>

            <div className="space-y-4">
              {activities.length === 0 ? (
                <p className="text-gray-500 py-12 text-center">No activities logged yet</p>
              ) : (
                activities.map((act: any) => (
                  <ActivityItem
                    key={act.id}
                    activity={act}
                    onEdit={openEditModal}
                    onDelete={handleDeleteActivity}
                  />
                ))
              )}
            </div>
          </div>
        </div>

        {/* Sidebar - Open Jobs */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white border rounded-2xl p-6">
            <div className="flex justify-between mb-4">
              <h3 className="font-semibold">Open Jobs</h3>
              <Button size="sm" variant="outline" onClick={() => setIsAddJobOpen(true)}>
                <Plus className="h-4 w-4 mr-1" /> Add Job
              </Button>
            </div>

{safeCompanyJobs?.length > 0 ? (
              <div className="space-y-3">
                {safeCompanyJobs.slice(0, 5).map((job: any) => (
                  <div key={job.id} className="border rounded-lg p-3 text-sm">
                    <div className="font-medium">{job.title}</div>
                    <div className="text-gray-500 text-xs">{job.location}</div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-sm">No open jobs for this company.</p>
            )}
          </div>
        </div>
      </div>

      {/* Modals */}
      <ActivityModal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); setEditingActivity(null); }}
        activity={editingActivity}
        onSave={handleSaveActivity}
        isLoading={saveActivityMutation.isPending}
      />

      {/* Add Job Dialog */}
      <SimpleDialog
        open={isAddJobOpen}
        onOpenChange={setIsAddJobOpen}
        title="Add New Job"
        description={`For ${companyName}`}
        footer={
          <>
            <Button variant="outline" onClick={() => setIsAddJobOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateJob} disabled={!newJobTitle.trim() || createJob.isPending}>
              {createJob.isPending ? "Creating..." : "Create Job"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">Company</label>
            <div className="bg-gray-50 border rounded-md px-3 py-2 font-medium">{companyName}</div>
          </div>

          <div>
            <label className="text-sm font-medium">Job Title *</label>
            <input
              value={newJobTitle}
              onChange={(e) => setNewJobTitle(e.target.value)}
              className="w-full border rounded-md px-3 py-2"
              placeholder="Job Title"
            />
          </div>
        </div>
      </SimpleDialog>
    </div>
  );
}
