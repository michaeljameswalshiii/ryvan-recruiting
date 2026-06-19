'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { ArrowLeft, Phone, Edit, Mail, Plus, Sparkles, Search, Users, FileText, Pencil, Trash2 } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCreateJob } from '@/lib/hooks/query-job';
import { logContactActivity, getContactActivities, updateContactActivity, deleteContactActivity } from '@/lib/actions/contact-actions';
import { SimpleDialog } from '@/components/ui/simple-dialog';
import ActivityModal from './ActivityModal';
import ActivityItem from './ActivityItem';

// Sanitize function to prevent serialization errors
const sanitizeActivity = (act: any) => ({
  id: act.id,
  type: act.type,
  title: act.title || act.content?.slice(0, 50) || '',
  description: act.description || act.content || '',
  createdAt: act.createdAt ? new Date(act.createdAt).toISOString().split('T')[0] : '',
});

export default function ContactDetailClient({ contact, companyJobs = [] }: { contact: any; companyJobs?: any[] }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const companyName = contact.companyName || contact.company?.name || 'Unknown Company';
  const companyId = contact.companyId || '';

  // === JOBS ===
  const createJob = useCreateJob();
  const [isAddJobOpen, setIsAddJobOpen] = useState(false);
  const [editingJob, setEditingJob] = useState<any>(null);

  // === ACTIVITIES ===
  const [isActivityModalOpen, setIsActivityModalOpen] = useState(false);
  const [editingActivity, setEditingActivity] = useState<any>(null);

  const { data: rawActivities = [] } = useQuery({
    queryKey: ['contact-activities', contact.id],
    queryFn: () => getContactActivities(contact.id),
    enabled: !!contact.id,
  });

  const activities = rawActivities.map(sanitizeActivity);

  // Activity Mutations
  const saveActivityMutation = useMutation({
    mutationFn: async (data: any) => {
      if (editingActivity?.id) {
        return updateContactActivity({
          contactId: contact.id,
          activityId: editingActivity.id,
          type: data.type,
          content: data.description || data.title,
        });
      } else {
        return logContactActivity({
          contactId: contact.id,
          type: data.type,
          content: data.description || data.title,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contact-activities', contact.id] });
      setIsActivityModalOpen(false);
      setEditingActivity(null);
      toast.success(editingActivity ? 'Activity updated!' : 'Activity logged!');
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Failed to save activity');
    },
  });

  const deleteActivityMutation = useMutation({
    mutationFn: (activityId: string) => deleteContactActivity({ contactId: contact.id, activityId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contact-activities', contact.id] });
      toast.success('Activity deleted!');
    },
  });

  // Job Handlers
  const handleEditJob = (job: any) => {
    setEditingJob(job);
    setIsAddJobOpen(true); // reuse dialog for simplicity, or create full modal later
  };

  const handleDeleteJob = (jobId: string) => {
    if (confirm('Delete this job?')) {
      // Add delete mutation if you have one, or implement via API
      toast.info('Job delete coming soon...');
    }
  };

  const openCreateActivity = () => {
    setEditingActivity(null);
    setIsActivityModalOpen(true);
  };

  const openEditActivity = (activity: any) => {
    setEditingActivity(sanitizeActivity(activity));
    setIsActivityModalOpen(true);
  };

  return (
    <div className="max-w-7xl mx-auto p-6">
      {/* Header - unchanged */}
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
              <Button onClick={openCreateActivity} size="sm">
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
                    onEdit={openEditActivity}
                    onDelete={deleteActivityMutation.mutate}
                  />
                ))
              )}
            </div>
          </div>
        </div>

        {/* Sidebar - Open Jobs (now clickable) */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white border rounded-2xl p-6">
            <div className="flex justify-between mb-4">
              <h3 className="font-semibold">Open Jobs</h3>
              <Button size="sm" variant="outline" onClick={() => setIsAddJobOpen(true)}>
                <Plus className="h-4 w-4 mr-1" /> Add Job
              </Button>
            </div>

            {companyJobs?.length > 0 ? (
              <div className="space-y-3">
                {companyJobs.slice(0, 5).map((job: any) => (
                  <div
                    key={job.id}
                    onClick={() => handleEditJob(job)}
                    className="group border rounded-xl p-4 hover:border-blue-300 cursor-pointer flex justify-between items-center"
                  >
                    <div>
                      <div className="font-medium">{job.title}</div>
                      <div className="text-gray-500 text-sm">{job.location}</div>
                    </div>
                    <div className="opacity-0 group-hover:opacity-100 flex gap-2">
                      <Pencil className="w-4 h-4 text-blue-600" />
                      <Trash2 onClick={(e: any) => { e.stopPropagation(); handleDeleteJob(job.id); }} className="w-4 h-4 text-red-500 hover:text-red-700" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-sm">No open jobs for this company.</p>
            )}
          </div>

          {/* AI Tools - unchanged */}
          <div className="bg-white border rounded-2xl p-6">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-purple-600" /> AI Client Tools
            </h3>
            <div className="space-y-2">
              <Button variant="default" className="w-full justify-start bg-blue-600 hover:bg-blue-700" size="lg">
                <Sparkles className="mr-3 h-5 w-5" /> Draft Outreach / Follow-Up
              </Button>
              <Button variant="outline" className="w-full justify-start" size="lg">
                <Search className="mr-3 h-5 w-5" /> Research This Contact
              </Button>
              <Button variant="outline" className="w-full justify-start" size="lg">
                <Users className="mr-3 h-5 w-5" /> Find Similar Contacts
              </Button>
              <Button variant="outline" className="w-full justify-start" size="lg">
                <FileText className="mr-3 h-5 w-5" /> Generate Client Summary
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      <ActivityModal
        isOpen={isActivityModalOpen}
        onClose={() => {
          setIsActivityModalOpen(false);
          setEditingActivity(null);
        }}
        activity={editingActivity}
        onSave={(data: any) => saveActivityMutation.mutate(data)}
        isLoading={saveActivityMutation.isPending}
      />

      {/* Add/Edit Job Dialog (placeholder - existing job form would go here) */}
      <SimpleDialog open={isAddJobOpen} onOpenChange={setIsAddJobOpen} title={editingJob ? "Edit Job" : "Add New Job"}>
        <div className="space-y-4">
          <p className="text-gray-500">Job form placeholder...</p>
        </div>
      </SimpleDialog>
    </div>
  );
}
