'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { ArrowLeft, Phone, Edit, Mail, Plus } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useCreateJob } from '@/lib/hooks/query-job';
import { SimpleDialog } from '@/components/ui/simple-dialog';
import { logContactActivity, getContactActivities } from '@/lib/actions/contact-actions';

interface ContactDetailClientProps {
  contact: any;
  companyJobs?: any[];
}

export default function ContactDetailClient({ contact, companyJobs = [] }: ContactDetailClientProps) {
  const companyId = contact.companyId || '';
  const companyName = contact.companyName || contact.company?.name || '';

  // Job Creation (matched to Jobs page)
  const createJob = useCreateJob();
  const [isAddJobOpen, setIsAddJobOpen] = useState(false);

  // Form state for Add Job (expanded to match Jobs page)
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
  const { data: activities = [], refetch: refetchActivities, isLoading: activitiesLoading } = useQuery({
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
        description: newJobDescription,
        location: newJobLocation,
        salaryRange: newJobSalary,
        employmentType: newJobEmploymentType,
        companyId,
        companyName,
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
    } catch (err) {
      console.error(err);
      toast.error("Failed to create job");
    }
  };

  const handleLogActivity = async () => {
    if (!newActivityType || !newActivityContent.trim()) {
      toast.error("Please select an activity type and add details");
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
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-green-600 rounded-full flex items-center justify-center text-white font-bold text-2xl">
                {contact.name?.[0] || 'U'}
              </div>
              <div>
                <h1 className="text-3xl font-bold">{contact.name}</h1>
                <p className="text-gray-500">{companyName}</p>
              </div>
            </div>
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
                onClick={() => setShowLogForm(!showLogForm)}
                variant="outline" 
                size="sm"
              >
                <Plus className="h-4 w-4 mr-1" />
                Log New Activity
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

                      <optgroup label="BUSINESS DEVELOPMENT">
                        <option value="09 Intake Discovery Call">09 Intake / Discovery Call BD</option>
                        <option value="10 Proposal Sent">10 Proposal Sent BD</option>
                        <option value="11 Contract Sent">11 Contract Sent BD</option>
                        <option value="12 Contract Signed">12 Contract Signed engaged</option>
                        <option value="13 Meeting Site Visit">13 Meeting / Site Visit BD</option>
                        <option value="14 Referral Received">14 Referral Received inbound</option>
                      </optgroup>

                      <optgroup label="RELATIONSHIP STATUS">
                        <option value="15 Known Contact">15 Known Contact / Active Relationship engaged</option>
                        <option value="16 Client Check-in">16 Client Check-in outreach</option>
                        <option value="17 Referral Made">17 Referral Made engaged</option>
                      </optgroup>

                      <optgroup label="DISPOSITION">
                        <option value="18 Not Interested No Need">18 Not Interested — No Need closed</option>
                        <option value="19 Not Interested Has Vendor">19 Not Interested — Has Vendor closed</option>
                        <option value="20 Dormant Nurture">20 Dormant / Long-term Nurture pending</option>
                        <option value="21 Do Not Contact">21 Do Not Contact closed</option>
                        <option value="22 General Note">22 Note / General Activity internal</option>
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
                      {companyJobs.map((job: any) => (
                        <option key={job.id} value={job.id}>{job.title}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <textarea
                  value={newActivityContent}
                  onChange={(e) => setNewActivityContent(e.target.value)}
                  placeholder="Add detailed notes about this activity..."
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

            {/* Simple Timeline Display */}
            {activitiesLoading ? (
              <p className="text-center py-8 text-gray-500">Loading activities...</p>
            ) : activities.length === 0 ? (
              <p className="text-center py-8 text-gray-500">No activity yet</p>
            ) : (
              <div className="space-y-4">
                {activities.map((activity: any, index: number) => (
                  <div key={activity.id || index} className="border rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm font-medium">{activity.type}</span>
                      {activity.createdAt && (
                        <span className="text-xs text-gray-500">
                          {new Date(activity.createdAt).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-700">{activity.content}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-white border rounded-2xl p-6">
            <div className="flex justify-between mb-4">
              <h3 className="font-semibold">Open Jobs</h3>
              <Button 
                size="sm" 
                variant="outline"
                onClick={() => setIsAddJobOpen(true)}
              >
                <Plus className="h-4 w-4 mr-1" /> Add Job
              </Button>
            </div>

            {companyJobs.length > 0 ? (
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

      {/* === ADD JOB DIALOG (matched to Jobs page) === */}
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
            <div className="border rounded-md px-3 py-2 bg-gray-50 text-sm font-medium">
              {companyName}
            </div>
          </div>

          <div>
            <label className="text-sm font-medium">Job Title *</label>
            <input
              value={newJobTitle}
              onChange={(e) => setNewJobTitle(e.target.value)}
              className="w-full border rounded-md px-3 py-2"
              placeholder="e.g. Senior Software Engineer"
            />
          </div>

          <div>
            <label className="text-sm font-medium">Description</label>
            <textarea
              value={newJobDescription}
              onChange={(e) => setNewJobDescription(e.target.value)}
              className="w-full border rounded-md px-3 py-2 min-h-[100px]"
              placeholder="Job responsibilities and requirements..."
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Location</label>
              <input
                value={newJobLocation}
                onChange={(e) => setNewJobLocation(e.target.value)}
                className="w-full border rounded-md px-3 py-2"
                placeholder="Remote / New York, NY"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Salary Range</label>
              <input
                value={newJobSalary}
                onChange={(e) => setNewJobSalary(e.target.value)}
                className="w-full border rounded-md px-3 py-2"
                placeholder="120k - 160k"
              />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium">Employment Type</label>
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
