'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { ArrowLeft, Phone, Edit, Mail, Plus } from 'lucide-react';
import ActivityModal from './ActivityModal';
import ActivityItem from './ActivityItem';
import { logContactActivity, getContactActivities, updateContactActivity, deleteContactActivity } from '@/lib/actions/contact-actions';

interface Props {
  contact: any;
  companyJobs?: any[];
}

export default function ContactDetailClient({ contact, companyJobs = [] }: Props) {
  const router = useRouter();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingActivity, setEditingActivity] = useState<any>(null);

  const openCreate = () => { setEditingActivity(null); setIsModalOpen(true); };
  const openEdit = (act: any) => { setEditingActivity(act); setIsModalOpen(true); };

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
              <p className="text-gray-500">{contact.companyName}</p>
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <Button variant="outline"><Phone /> Call</Button>
          <Button variant="outline"><Edit /> Edit</Button>
          <Button><Mail /> Send Email</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7">
          <div className="bg-white border rounded-2xl p-6">
            <div className="flex justify-between mb-6">
              <h3 className="text-xl font-semibold">Activity & Relationship Tracking</h3>
              <Button onClick={openCreate}>
                <Plus className="mr-2" /> Log New Activity
              </Button>
            </div>

            <div className="space-y-4">
              {/* Activities will be added via useQuery in next step if needed */}
              <p className="text-gray-500 py-12 text-center">No activities logged yet</p>
            </div>
          </div>
        </div>

        <div className="lg:col-span-5">
          <div className="bg-white border rounded-2xl p-6">
            <h3 className="font-semibold mb-4">Open Jobs</h3>
            {companyJobs.length > 0 ? (
              companyJobs.map((job: any) => (
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
        onSave={() => {}} // TODO: connect later
        isLoading={false}
      />
    </div>
  );
}
