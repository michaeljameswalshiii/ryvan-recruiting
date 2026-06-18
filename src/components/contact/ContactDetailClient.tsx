'use client';

/**
 * Contact Detail Client Component
 * Displays contact info and allows logging activities
 * Now uses separate events table (decoupled from client.contacts[].notes)
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { ArrowLeft, Phone, Edit, Mail, Plus } from 'lucide-react';
import { useJobsForCompany, useCreateJob } from '@/lib/hooks/query-job';
import { useClients } from '@/lib/hooks/query-client';
import { SimpleDialog } from '@/components/ui/simple-dialog';
import { logContactActivity, getContactActivities } from '@/lib/actions/contact-actions';

interface ContactDetailClientProps {
  contact: any;
}

export default function ContactDetailClient({ contact: initialContact }: ContactDetailClientProps) {
  const router = useRouter();
  const [isAddJobOpen, setIsAddJobOpen] = useState(false);
  const [newJobTitle, setNewJobTitle] = useState('');

  // New Activity form states
  const [showLogForm, setShowLogForm] = useState(false);
  const [newActivityType, setNewActivityType] = useState('');
  const [newActivityContent, setNewActivityContent] = useState('');
  const [newActivityJobId, setNewActivityJobId] = useState<string | undefined>(undefined);

  const companyId = initialContact.companyId || '';
  const companyName = initialContact.companyName || initialContact.company?.name || '';

const { data: jobs = [] } = useJobsForCompany(companyId);
  const createJob = useCreateJob();
  useClients();

  // Use React Query to load activities from server action
  const { data: activities = [], refetch: refetchActivities } = useQuery({
    queryKey: ['contact-activities', initialContact.id],
    queryFn: () => getContactActivities(initialContact.id),
    enabled: !!initialContact.id,
  });
  const loadingActivities = false; // Query handles loading state

  // Reset activity form helper
  const resetActivityForm = () => {
    setNewActivityContent('');
    setNewActivityType('');
    setNewActivityJobId(undefined);
  };

  // Handler for new activity form - uses server action
  const handleLogActivity = async () => {
    if (!newActivityType || !newActivityContent.trim()) {
      toast.error("Please select activity type and add details");
      return;
    }

    try {
      await logContactActivity({
        contactId: initialContact.id,
        companyId: initialContact.companyId,
        type: newActivityType,
        content: newActivityContent,
        relatedJobId: newActivityJobId,
      });

      toast.success("Activity logged successfully!");
      resetActivityForm();
      setShowLogForm(false);
      refetchActivities(); // Refresh the timeline
      router.refresh();
    } catch (err: any) {
      console.error(err);
      toast.error("Failed to log activity");
    }
  };

const handleCreateJob = async () => {
    if (!newJobTitle.trim()) {
      toast.error('Job title is required');
      return;
    }

    try {
      await createJob.mutateAsync({
        title: newJobTitle.trim(),
        companyId: companyId || initialContact.companyId,
        companyName: companyName || initialContact.companyName || 'Unknown Company',
        status: 'Open',
      });

      // Success is already handled in the mutation onSuccess
      setIsAddJobOpen(false);
      setNewJobTitle('');
      
      // Optional: refresh the page data
      router.refresh();
    } catch (err: any) {
      console.error('Create job failed:', err);
      // Error toast is already handled in useCreateJob onError
    }
  };

  const initials =
    initialContact.name?.split(' ').map((n: string) => n[0]).join('').toUpperCase() || '??';

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="flex items-start justify-between mb-8">
        <div className="flex items-center gap-4">
          <button
            onClick={() => window.history.back()}
            className="text-gray-500 hover:text-gray-700 p-2 -ml-2"
          >
            <ArrowLeft className="h-6 w-6" />
          </button>

          <div className="w-16 h-16 rounded-full bg-green-600 flex items-center justify-center text-3xl font-bold text-white">
            {initials}
          </div>

          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-semibold">{initialContact.name}</h1>
              {initialContact.isPrimary && (
                <span className="px-3 py-1 text-sm bg-yellow-100 text-yellow-700 rounded-full font-medium">
                  ⭐ Primary
                </span>
              )}
            </div>
            <p className="text-gray-600 text-lg">{initialContact.title}</p>
            {initialContact.companyName && (
              <p className="text-sm text-gray-500">{initialContact.companyName}</p>
            )}
          </div>
        </div>

        <div className="flex gap-3">
          <Button variant="outline" className="flex items-center gap-2">
            <Phone className="h-4 w-4" /> Call
          </Button>
          <Button variant="outline" className="flex items-center gap-2">
            <Edit className="h-4 w-4" /> Edit
          </Button>
          <Button className="flex items-center gap-2">
            <Mail className="h-4 w-4" /> Send Email
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8">
          {/* ====================== ACTIVITY & NOTES SECTION ====================== */}
          <div className="bg-white border rounded-2xl p-6 lg:col-span-8">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-semibold text-lg">Activity & Notes</h3>
              <Button 
                onClick={() => setShowLogForm(!showLogForm)}
                variant="outline" 
                size="sm"
              >
                <Plus className="h-4 w-4 mr-1" />
                Log Activity
              </Button>
            </div>

            {/* Log Activity Form */}
            {showLogForm && (
              <div className="mb-8 border rounded-xl p-6 bg-gray-50">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  {/* Activity Type - Full 22 items */}
                  <div>
                    <label className="text-sm font-medium block mb-1">Activity Type</label>
                    <select 
                      value={newActivityType}
                      onChange={(e) => setNewActivityType(e.target.value)}
                      className="w-full border rounded-md px-3 py-2 text-sm"
                    >
                      <option value="">Select Activity Type...</option>
                      
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

                  {/* Related Job (if company has jobs) */}
                  <div>
                    <label className="text-sm font-medium block mb-1">Related Job (optional)</label>
                    <select 
                      value={newActivityJobId || ''}
                      onChange={(e) => setNewActivityJobId(e.target.value || undefined)}
                      className="w-full border rounded-md px-3 py-2 text-sm"
                    >
                      <option value="">None</option>
                      {jobs?.map((job: any) => (
                        <option key={job.id} value={job.id}>
                          {job.title}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <textarea
                  value={newActivityContent}
                  onChange={(e) => setNewActivityContent(e.target.value)}
                  placeholder="Add details about this activity..."
                  className="w-full border rounded-md px-3 py-3 min-h-[110px] text-sm"
                />

                <div className="flex justify-end gap-3 mt-4">
                  <Button 
                    variant="outline" 
                    onClick={() => {
                      setShowLogForm(false);
                      setNewActivityContent('');
                      setNewActivityJobId(undefined);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button 
                    onClick={handleLogActivity} 
                    disabled={!newActivityContent.trim() || !newActivityType}
                  >
                    Log Activity
                  </Button>
                </div>
              </div>
            )}

            {/* Timeline Display */}
            {loadingActivities ? (
              <div className="text-center py-8 text-gray-400">Loading activity...</div>
            ) : activities.length > 0 ? (
              <div className="space-y-6 max-h-[600px] overflow-y-auto">
                {activities.map((note, i) => (
                  <div key={note.id || i} className="border-l-2 border-gray-200 pl-4 py-1">
                    <div className="flex justify-between text-sm">
                      <span className="font-medium">{note.type}</span>
                      <span className="text-gray-500">
                        {new Date(note.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="text-gray-600 mt-1">{note.content}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-16 text-gray-400">
                No activities logged for this contact yet.
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-4 space-y-6">
          <div className="bg-white border rounded-2xl p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-semibold">Open Jobs</h3>
              <Button size="sm" variant="outline" onClick={() => setIsAddJobOpen(true)}>
                <Plus className="h-4 w-4 mr-1" /> Add Job
              </Button>
            </div>

            {jobs.filter((j: any) => (j.status || '').toLowerCase() !== 'closed').length > 0 ? (
              <div className="space-y-3">
                {jobs
                  .filter((j: any) => (j.status || '').toLowerCase() !== 'closed')
                  .slice(0, 5)
                  .map((job: any) => (
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

          <div className="bg-white border rounded-2xl p-6">
            <h3 className="font-semibold mb-4">Quick Stats</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gray-50 p-4 rounded-xl text-center">
                <div className="text-2xl font-semibold">0</div>
                <div className="text-sm text-gray-500">Open Jobs</div>
              </div>
              <div className="bg-gray-50 p-4 rounded-xl text-center">
                <div className="text-2xl font-semibold">0</div>
                <div className="text-sm text-gray-500">Candidates</div>
              </div>
            </div>
          </div>

          <div className="bg-white border rounded-2xl p-6">
            <h3 className="font-semibold mb-4">AI Client Tools</h3>
            <div className="space-y-3">
              <Button className="w-full justify-start" variant="default">
                ✨ Draft Outreach / Follow-Up
              </Button>
              <Button className="w-full justify-start" variant="secondary">
                🔍 Research This Contact
              </Button>
              <Button className="w-full justify-start" variant="secondary">
                👥 Find Similar Contacts
              </Button>
              <Button className="w-full justify-start" variant="secondary">
                📋 Generate Client Summary
              </Button>
            </div>
          </div>
        </div>
      </div>

      <SimpleDialog
        open={isAddJobOpen}
        onOpenChange={setIsAddJobOpen}
        title="Add New Job"
        description={`For ${companyName}`}
        footer={
          <>
            <Button variant="outline" onClick={() => setIsAddJobOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateJob} disabled={createJob.isPending}>
              {createJob.isPending ? 'Creating...' : 'Create Job'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">Company</label>
            <input value={companyName} disabled className="w-full border rounded-md px-3 py-2 bg-gray-50" />
          </div>

          <input
            placeholder="Job Title *"
            value={newJobTitle}
            onChange={(e) => setNewJobTitle(e.target.value)}
            className="w-full border rounded-md px-3 py-2"
          />
        </div>
      </SimpleDialog>
    </div>
  );
}
