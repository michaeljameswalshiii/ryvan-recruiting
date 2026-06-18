'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { ArrowLeft, Phone, Edit, Mail, Plus, Sparkles, Search, Users, FileText } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCreateJob } from '@/lib/hooks/query-job';
import { logContactActivity, getContactActivities, updateContactActivity, deleteContactActivity } from '@/lib/actions/contact-actions';
import { SimpleDialog } from '@/components/ui/simple-dialog';
import ActivityModal from './ActivityModal';
import ActivityItem from './ActivityItem';

type ActivityEvent = {
  id: string;
  type: string;
  title?: string;
  description?: string;
  content?: string;
  createdAt: string;
};

interface ContactDetailClientProps {
  contact: any;
  companyJobs?: any[];
}

export default function ContactDetailClient({ contact, companyJobs = [] }: ContactDetailClientProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const companyName = contact.companyName || contact.company?.name || 'Unknown Company';
  const companyId = contact.companyId || '';

  // Job Creation
  const createJob = useCreateJob();
  const [isAddJobOpen, setIsAddJobOpen] = useState(false);
  const [newJobTitle, setNewJobTitle] = useState('');
  const [newJobDescription, setNewJobDescription] = useState('');
  const [newJobLocation, setNewJobLocation] = useState('');
  const [newJobSalary, setNewJobSalary] = useState('');
  const [newJobEmploymentType, setNewJobEmploymentType] = useState('Full-time');

  // Activity Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingActivity, setEditingActivity] = useState<ActivityEvent | null>(null);

  const { data: activities = [] } = useQuery({
    queryKey: ['contact-activities', contact.id],
    queryFn: () => getContactActivities(contact.id),
    enabled: !!contact.id,
  });

  // Create/Update Activity Mutation
  const saveActivityMutation = useMutation({
    mutationFn: async (data: { type: string; content: string; title?: string }) => {
      if (editingActivity?.id) {
        return updateContactActivity({
          contactId: contact.id,
          activityId: editingActivity.id,
          type: data.type,
          content: data.content,
        });
      } else {
        return logContactActivity({
          contactId: contact.id,
          type: data.type,
          content: data.content,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contact-activities', contact.id] });
      setIsModalOpen(false);
      setEditingActivity(null);
      toast.success(editingActivity ? 'Activity updated!' : 'Activity logged!');
    },
    onError: (error: any) => {
      console.error(error);
      toast.error(error?.message || 'Failed to save activity');
    },
  });

  // Delete Activity Mutation
  const deleteActivityMutation = useMutation({
    mutationFn: (activityId: string) => deleteContactActivity({
      contactId: contact.id,
      activityId,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contact-activities', contact.id] });
      toast.success('Activity deleted!');
    },
    onError: (error: any) => {
      console.error(error);
      toast.error(error?.message || 'Failed to delete activity');
    },
  });

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
      console.error(err);
      toast.error(err?.message || "Failed to create job");
    }
  };

  // Modal handlers
  const openCreateModal = () => {
    setEditingActivity(null);
    setIsModalOpen(true);
  };

  const openEditModal = (activity: ActivityEvent) => {
    setEditingActivity(activity);
    setIsModalOpen(true);
  };

  const handleSaveActivity = (data: { type: string; title: string; description?: string; date?: string }) => {
    saveActivityMutation.mutate({
      type: data.type,
      content: data.description || data.title,
    });
  };

  const handleDeleteActivity = (activityId: string) => {
    if (confirm('Are you sure you want to delete this activity?')) {
      deleteActivityMutation.mutate(activityId);
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
        {/* Main Activity Area */}
        <div className="lg:col-span-7">
          <div className="bg-white border rounded-2xl p-6">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-semibold">Activity & Relationship Tracking</h3>
              <Button onClick={openCreateModal} size="sm">
                <Plus className="h-4 w-4 mr-2" /> Log New Activity
              </Button>
            </div>

            {/* Activity List */}
            <div className="space-y-4">
              {activities.length === 0 ? (
                <p className="text-gray-500 py-12 text-center">No activities logged yet</p>
              ) : (
                activities.map((act: any, i: number) => (
                  <ActivityItem
                    key={act.id || i}
                    activity={{
                      id: act.id,
                      type: act.type,
                      title: act.content?.slice(0, 50),
                      description: act.content,
                      createdAt: act.createdAt,
                    }}
                    onEdit={openEditModal}
                    onDelete={handleDeleteActivity}
                  />
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right Sidebar */}
        <div className="lg:col-span-5 space-y-6">
          {/* Open Jobs */}
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

          {/* AI Client Tools */}
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

      {/* Activity Modal */}
      <ActivityModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingActivity(null);
        }}
        activity={editingActivity ? {
          id: editingActivity.id,
          type: editingActivity.type,
          title: editingActivity.title || editingActivity.content?.slice(0, 30) || '',
          description: editingActivity.description || editingActivity.content,
          date: editingActivity.createdAt ? new Date(editingActivity.createdAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        } : null}
        onSave={handleSaveActivity}
        isLoading={saveActivityMutation.isPending}
      />
    </div>
  );
}
