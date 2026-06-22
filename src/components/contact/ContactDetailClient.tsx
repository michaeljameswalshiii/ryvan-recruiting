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

export default function ContactDetailClient({ contact: rawContact, companyJobs: rawJobs = [] }: ContactDetailClientProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const companyName = rawContact.companyName || rawContact.company?.name || 'Unknown Company';
  const companyId = rawContact.companyId || '';

  // === ALL SANITIZATION MOVED INSIDE COMPONENT ===
  const contact = JSON.parse(JSON.stringify(rawContact || {}));
  const safeCompanyJobs = (rawJobs || []).map((job: any) => JSON.parse(JSON.stringify(job)));

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingActivity, setEditingActivity] = useState<any>(null);

  // Live activities
  const { data: activities = [] } = useQuery({
    queryKey: ['contact-activities', contact.id],
    queryFn: () => getContactActivities(contact.id),
    enabled: !!contact.id,
  });

  const saveMutation = useMutation({
    mutationFn: async (data: any) => {
      if (editingActivity?.id) {
        return updateContactActivity({
          contactId: contact.id,
          activityId: editingActivity.id,
          type: data.type,
          content: data.description || data.title || '',
        });
      }
      return logContactActivity({
        contactId: contact.id,
        type: data.type,
        content: data.description || data.title || '',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contact-activities', contact.id] });
      queryClient.refetchQueries({ queryKey: ['contact-activities', contact.id] });
      setIsModalOpen(false);
      setEditingActivity(null);
      toast.success(editingActivity?.id ? 'Activity updated!' : 'Activity logged successfully!');
    },
    onError: (err: any) => toast.error(err?.message || 'Failed to save activity'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteContactActivity({ contactId: contact.id, activityId: id }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['contact-activities', contact.id] }),
  });

  const openCreate = () => {
    setEditingActivity(null);
    setIsModalOpen(true);
  };

  const openEdit = (activity: any) => {
    setEditingActivity(activity);
    setIsModalOpen(true);
  };

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="flex justify-between items-start mb-8">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => router.back()}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-emerald-600 rounded-full flex items-center justify-center text-white text-3xl font-bold">
              {contact.name?.[0] || '?'}
            </div>
            <div>
              <h1 className="text-4xl font-bold">{contact.name}</h1>
              <p className="text-xl text-gray-600">{contact.title}</p>
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
        <div className="lg:col-span-7">
          <div className="bg-white border rounded-2xl p-6">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-semibold">Activity & Relationship Tracking</h3>
              <Button onClick={openCreate}>
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
                    onEdit={openEdit}
                    onDelete={deleteMutation.mutate}
                  />
                ))
              )}
            </div>
          </div>
        </div>

        <div className="lg:col-span-5">
          <div className="bg-white border rounded-2xl p-6">
            <h3 className="font-semibold mb-4">Open Jobs</h3>
            {safeCompanyJobs.length > 0 ? (
              safeCompanyJobs.map((job: any) => (
                <div key={job.id} className="border p-4 rounded-xl mb-3">
                  {job.title}
                </div>
              ))
            ) : (
              <p className="text-gray-500">No open jobs</p>
            )}
          </div>
        </div>
      </div>

      <ActivityModal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); setEditingActivity(null); }}
        activity={editingActivity}
        onSave={(data) => saveMutation.mutate(data)}
        isLoading={saveMutation.isPending}
      />
    </div>
  );
}
