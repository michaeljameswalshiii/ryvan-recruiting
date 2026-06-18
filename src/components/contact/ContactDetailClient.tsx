'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { ArrowLeft, Phone, Edit, Mail, Plus, Sparkles, Search, Users, FileText } from 'lucide-react';
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
              <Button onClick={() => setShowLogForm(true)} size="sm">
                <Plus className="h-4 w-4 mr-2" /> Log New Activity
              </Button>
            </div>

            {/* Log Form */}
            {showLogForm && (
              <div className="mb-8 bg-gray-50 border rounded-xl p-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div className="md:col-span-2">
                    <label className="text-sm font-medium block mb-1">Activity Type *</label>
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

                <div className="flex justify-end gap-3 mt-4">
                  <Button variant="outline" onClick={() => {setShowLogForm(false); resetActivityForm();}}>Cancel</Button>
                  <Button onClick={handleLogActivity} disabled={!newActivityType || !newActivityContent.trim()}>Log Activity</Button>
                </div>
              </div>
            )}

            {/* Activity List with Nice Colors */}
            <div className="space-y-4">
              {activities.length === 0 ? (
                <p className="text-gray-500 py-12 text-center">No activities logged yet</p>
              ) : (
                activities.map((act: any, i: number) => {
                  const isBD = act.type.includes('BD') || act.type.includes('Proposal') || act.type.includes('Contract');
                  const isOutreach = act.type.includes('Voicemail') || act.type.includes('Email') || act.type.includes('Text');
                  return (
                    <div 
                      key={i} 
                      className={`border-l-4 pl-4 py-4 rounded-lg bg-white shadow-sm ${
                        isBD ? 'border-blue-500' : isOutreach ? 'border-amber-500' : 'border-emerald-500'
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <div className="font-semibold text-lg">{act.type}</div>
                        <div className="text-xs text-gray-500 whitespace-nowrap">
                          {new Date(act.createdAt).toLocaleDateString()}
                        </div>
                      </div>
                      <p className="text-gray-700 mt-2 leading-relaxed">{act.content}</p>
                    </div>
                  );
                })
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
    </div>
  );
}
