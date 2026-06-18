'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { ArrowLeft, Phone, Edit, Mail, Plus } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useCreateJob } from '@/lib/hooks/query-job';
import { logContactActivity, getContactActivities } from '@/lib/actions/contact-actions';
import { SimpleDialog } from '@/components/ui/simple-dialog';

interface ContactDetailClientProps {
  contact: any;
  companyJobs?: any[];
}

export default function ContactDetailClient({ contact, companyJobs = [] }: ContactDetailClientProps) {
  const router = useRouter();
  const companyId = contact.companyId || '';
  const companyName = contact.companyName || contact.company?.name || '';

  // === Job Creation ===
  const createJob = useCreateJob();
  const [isAddJobOpen, setIsAddJobOpen] = useState(false);
  const [newJobTitle, setNewJobTitle] = useState('');
  const [newJobDescription, setNewJobDescription] = useState('');
  const [newJobLocation, setNewJobLocation] = useState('');
  const [newJobSalary, setNewJobSalary] = useState('');
  const [newJobEmploymentType, setNewJobEmploymentType] = useState('Full-time');

  // === Activity Logging ===
  const [showLogForm, setShowLogForm] = useState(false);
  const [newActivityType, setNewActivityType] = useState('');
  const [newActivityContent, setNewActivityContent] = useState('');
  const [newActivityJobId, setNewActivityJobId] = useState<string | undefined>(undefined);

  // Real Activities
  const { data: activities = [], refetch: refetchActivities } = useQuery({
    queryKey: ['contact-activities', contact.id],
    queryFn: () => getContactActivities(contact.id),
    enabled: !!contact.id,
  });

  const resetActivityForm = () => {
    setNewActivityType('');
    setNewActivityContent('');
    setNewActivityJobId(undefined);
  };

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

      // Close dialog + refresh the page to show new job in sidebar
      setIsAddJobOpen(false);
      setNewJobTitle('');
      setNewJobDescription('');
      setNewJobLocation('');
      setNewJobSalary('');
      setNewJobEmploymentType('Full-time');

      router.refresh();   // ← This is the key fix
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || "Failed to create job");
    }
  };

  const handleLogActivity = async () => {
    if (!newActivityType || !newActivityContent.trim()) {
      toast.error("Please select activity type and add details");
      return;
    }

    try {
      await logContactActivity({
        contactId: contact.id,
        type: newActivityType,
        content: newActivityContent,
        relatedJobId: newActivityJobId,
      });

      toast.success("Activity logged successfully!");
      resetActivityForm();
      setShowLogForm(false);
      refetchActivities();
    } catch (error) {
      console.error(error);
      toast.error("Failed to log activity");
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => window.history.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold">{contact.name}</h1>
            <p className="text-gray-500">{companyName}</p>
          </div>
        </div>

        <div className="flex gap-3">
          <Button variant="outline"><Phone className="h-4 w-4 mr-2" /> Call</Button>
          <Button variant="outline"><Edit className="h-4 w-4 mr-2" /> Edit</Button>
          <Button><Mail className="h-4 w-4 mr-2" /> Send Email</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Activity Section */}
        <div className="lg:col-span-8">
          <div className="bg-white border rounded-2xl p-6">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="font-semibold text-lg">Activity & Relationship Tracking</h3>
                <p className="text-sm text-gray-500">BD Outreach • Client Engagement • Disposition</p>
              </div>
              <Button 
                onClick={() => setShowLogForm(true)}
                variant="outline" 
                size="sm"
              >
                <Plus className="h-4 w-4 mr-1" /> Log New Activity
              </Button>
            </div>

            {/* Log Form */}
            {showLogForm && (
              <div className="mb-8 border rounded-xl p-6 bg-gray-50">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div className="md:col-span-2">
                    <label className="text-sm font-medium block mb-1">Activity Type</label>
                    <select 
                      value={newActivityType}
                      onChange={(e) => setNewActivityType(e.target.value)}
                      className="w-full border rounded-md px-3 py-2.5 text-sm"
                    >
                      <option value="">— Select Activity Type —</option>
                      <optgroup label="OUTREACH & COMMUNICATION">
                        <option value="01 Left Voicemail">01 Left Voicemail outreach</option>
                        <option value="02 Email Sent">02 Email Sent outreach</option>
                        <option value="03 Email Received">03 Email Received inbound</option>
                        <option value="04 Text Sent">04 Text Sent outreach</option>
                        <option value="05 Text Received">05 Text Received inbound</option>
                        <option value="06 LinkedIn Message Sent">06 LinkedIn Message Sent outreach</option>
                        <option value="07 Conversation Engaged">07 Conversation engaged</option>
                        <option value="08 No Answer">08 No Answer / No Response attempt</option>
                      </optgroup>
                      {/* Add other optgroups as needed */}
                    </select>
                  </div>

                  <div>
                    <label className="text-sm font-medium block mb-1">Related Job (optional)</label>
                    <select 
                      value={newActivityJobId || ''}
                      onChange={(e) => setNewActivityJobId(e.target.value || undefined)}
                      className="w-full border rounded-md px-3 py-2.5 text-sm"
                    >
                      <option value="">None</option>
                      {companyJobs?.map((job: any) => (
                        <option key={job.id} value={job.id}>{job.title}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <textarea
                  value={newActivityContent}
                  onChange={(e) => setNewActivityContent(e.target.value)}
                  placeholder="Add detailed notes..."
                  className="w-full border rounded-md px-3 py-3 min-h-[120px] text-sm"
                />

                <div className="flex justify-end gap-3 mt-5">
                  <Button variant="outline" onClick={() => { setShowLogForm(false); resetActivityForm(); }}>
                    Cancel
                  </Button>
                  <Button onClick={handleLogActivity} disabled={!newActivityType || !newActivityContent.trim()}>
                    Log Activity
                  </Button>
                </div>
              </div>
            )}

            {/* Activities List */}
            <div className="space-y-4">
              {activities.length === 0 ? (
                <p className="text-gray-500 py-8 text-center">No activities yet</p>
              ) : (
                activities.map((act: any, i: number) => (
                  <div key={i} className="border rounded-lg p-4">
                    <div className="font-medium">{act.type}</div>
                    <div className="text-sm text-gray-600 mt-1">{act.content}</div>
                    <div className="text-xs text-gray-400 mt-2">
                      {new Date(act.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Sidebar - Open Jobs */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-white border rounded-2xl p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-semibold">Open Jobs</h3>
              <Button 
                size="sm" 
                variant="outline"
                onClick={() => setIsAddJobOpen(true)}
              >
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

          {/* Add more fields here as needed */}
        </div>
      </SimpleDialog>
    </div>
  );
}
