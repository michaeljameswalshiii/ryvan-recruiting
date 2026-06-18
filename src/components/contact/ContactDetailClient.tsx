'use client';

import { useState } from 'react';
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
  const companyId = contact.companyId || '';
  const companyName = contact.companyName || contact.company?.name || '';

  // Job Creation
  const createJob = useCreateJob();
  const [isAddJobOpen, setIsAddJobOpen] = useState(false);
  const [newJobTitle, setNewJobTitle] = useState('');
  const [newJobDescription, setNewJobDescription] = useState('');
  const [newJobLocation, setNewJobLocation] = useState('');
  const [newJobSalary, setNewJobSalary] = useState('');
  const [newJobEmploymentType, setNewJobEmploymentType] = useState('Full-time');

  // Activity
  const [showLogForm, setShowLogForm] = useState(false);
  const [newActivityType, setNewActivityType] = useState('');
  const [newActivityContent, setNewActivityContent] = useState('');
  const [newActivityJobId, setNewActivityJobId] = useState<string | undefined>(undefined);

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
        companyId: companyId,
        companyName: companyName,
        status: "Open",
      });

      toast.success("Job created successfully!");
      setIsAddJobOpen(false);
      
      // Reset form
      setNewJobTitle('');
      setNewJobDescription('');
      setNewJobLocation('');
      setNewJobSalary('');
      setNewJobEmploymentType('Full-time');
    } catch (err: any) {
      console.error("Job creation error:", err);
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
      toast.success("Activity logged!");
      resetActivityForm();
      setShowLogForm(false);
      refetchActivities();
    } catch (error) {
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
        {/* LEFT: Activity Section */}
        <div className="lg:col-span-8">
          <div className="bg-white border rounded-2xl p-6">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="font-semibold text-lg">Activity & Relationship Tracking</h3>
                <p className="text-sm text-gray-500">BD Outreach • Client Engagement • Disposition</p>
              </div>
              <Button onClick={() => setShowLogForm(!showLogForm)} variant="outline" size="sm">
                <Plus className="h-4 w-4 mr-1" /> Log New Activity
              </Button>
            </div>

            {/* Log Form */}
            {showLogForm && (
              <div className="mb-8 p-6 bg-gray-50 border rounded-xl">
                {/* Paste your full 22-type select here if you want it back */}
                <textarea
                  value={newActivityContent}
                  onChange={(e) => setNewActivityContent(e.target.value)}
                  placeholder="Details..."
                  className="w-full border rounded-md p-3 min-h-[100px]"
                />
                <div className="flex justify-end gap-3 mt-4">
                  <Button variant="outline" onClick={() => {setShowLogForm(false); resetActivityForm();}}>
                    Cancel
                  </Button>
                  <Button onClick={handleLogActivity}>Log Activity</Button>
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

        {/* RIGHT: Sidebar */}
        <div className="lg:col-span-4 space-y-6">
          {/* Open Jobs */}
          <div className="bg-white border rounded-2xl p-6">
            <div className="flex justify-between items-center mb-4">
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
            <Button onClick={handleCreateJob} disabled={!newJobTitle.trim()}>Create Job</Button>
          </>
        }
      >
<div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Company</label>
            <div className="bg-gray-50 border rounded-md px-3 py-2">{companyName}</div>
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-1">Job Title *</label>
            <input
              value={newJobTitle}
              onChange={(e) => setNewJobTitle(e.target.value)}
              className="w-full border rounded-md px-3 py-2"
              placeholder="e.g. Senior Software Engineer"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <textarea
              value={newJobDescription}
              onChange={(e) => setNewJobDescription(e.target.value)}
              className="w-full border rounded-md px-3 py-2 min-h-[80px]"
              placeholder="Job responsibilities and requirements..."
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Location</label>
              <input
                value={newJobLocation}
                onChange={(e) => setNewJobLocation(e.target.value)}
                className="w-full border rounded-md px-3 py-2"
                placeholder="Remote / New York, NY"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Salary Range</label>
              <input
                value={newJobSalary}
                onChange={(e) => setNewJobSalary(e.target.value)}
                className="w-full border rounded-md px-3 py-2"
                placeholder="120k - 160k"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Employment Type</label>
            <select
              value={newJobEmploymentType}
              onChange={(e) => setNewJobEmploymentType(e.target.value)}
              className="w-full border rounded-md px-3 py-2"
            >
              <option value="Full-time">Full-time</option>
              <option value="Part-time">Part-time</option>
              <option value="Contract">Contract</option>
              <option value="Internship">Internship</option>
            </select>
          </div>
        </div>
      </SimpleDialog>
    </div>
  );
}
