'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar } from '@/components/ui/avatar';
import { toast } from 'sonner';
import { ArrowLeft, Phone, Mail, Edit, MapPin, Link as LinkIcon, Users, Plus, Trash2 } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRemoveContact, useClients, clientKeys } from '@/lib/hooks/query-client';
import { logContactActivity, getContactActivities, updateContactActivity, deleteContactActivity } from '@/lib/actions/contact-actions';
import ActivityModal from './ActivityModal';
import ActivityItem from './ActivityItem';

interface ContactDetailClientProps {
  contact: any;
  companyJobs?: any[];
  companyName?: string;
}

export default function ContactDetailClient({ contact: rawContact, companyJobs: rawJobs = [], companyName: propCompanyName }: ContactDetailClientProps) {
  const router = useRouter();
  const queryClient = useQueryClient();

  // === ALL SANITIZATION MOVED INSIDE COMPONENT ===
  const contact = JSON.parse(JSON.stringify(rawContact || {}));
  const safeCompanyJobs = (rawJobs || []).map((job: any) => JSON.parse(JSON.stringify(job)));
  
  const companyName = propCompanyName || contact.companyName || contact.company?.name || 'Unknown Company';
  const companyId = contact.companyId || contact.clientId || '';

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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contact-activities', contact.id] });
      toast.success('Activity deleted');
    },
    onError: (err: any) => toast.error(err?.message || 'Failed to delete activity'),
  });

  // Contact delete mutation
  const removeContactMutation = useRemoveContact();

  // Delete contact handler
  const handleDeleteContact = async () => {
    if (!companyId || !contact.id) {
      toast.error('Cannot delete: missing company or contact ID');
      return;
    }
    
    const confirmed = window.confirm(`Are you sure you want to delete ${contact.name}? This action cannot be undone.`);
    if (!confirmed) return;

    try {
      await removeContactMutation.mutateAsync({
        clientId: companyId,
        contactId: contact.id,
        contactName: contact.name,
      });
      toast.success('Contact deleted successfully');
      router.push('/dashboard/contacts');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to delete contact');
    }
  };

  const openCreate = () => {
    setEditingActivity(null);
    setIsModalOpen(true);
  };

  const openEdit = (activity: any) => {
    setEditingActivity(activity);
    setIsModalOpen(true);
  };

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-8">
      {/* Header - North Star Design */}
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
        <div className="flex items-start gap-6">
<Avatar 
            className="w-24 h-24 border-4 border-white shadow-lg text-5xl bg-emerald-600 text-white font-bold" 
            fallback={contact.name?.[0] || '?'}
            alt={contact.name}
          />

          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-4xl font-bold">{contact.name}</h1>
              {contact.isPrimary && (
                <Badge variant="secondary" className="bg-amber-100 text-amber-800">Primary</Badge>
              )}
            </div>
            <p className="text-2xl text-muted-foreground">{contact.title}</p>
            <p className="text-xl">
              {companyId ? (
                <a href={`/dashboard/companies/${companyId}`} className="hover:underline text-blue-600">
                  {companyName}
                </a>
              ) : (
                <span>{companyName}</span>
              )}
            </p>
          </div>
        </div>

{/* Action Buttons */}
        <div className="flex flex-wrap gap-3">
          <Button size="lg" variant="outline">
            <Phone className="mr-2 h-5 w-5" /> Call
          </Button>
          <Button size="lg" variant="outline">
            <Mail className="mr-2 h-5 w-5" /> Send Email
          </Button>
          <Button size="lg" variant="default" onClick={openEdit}>
            <Edit className="mr-2 h-5 w-5" /> Edit Contact
          </Button>
          <Button 
            size="lg" 
            variant="destructive"
            onClick={handleDeleteContact}
            disabled={removeContactMutation.isPending}
          >
            <Trash2 className="mr-2 h-5 w-5" /> 
            {removeContactMutation.isPending ? 'Deleting...' : 'Delete Contact'}
          </Button>
        </div>
      </div>

      {/* Info Bar */}
      <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm border-b pb-6">
        {contact.email && (
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-muted-foreground" />
            <a href={`mailto:${contact.email}`} className="hover:underline">{contact.email}</a>
          </div>
        )}
        {contact.phone && (
          <div className="flex items-center gap-2">
            <Phone className="h-4 w-4 text-muted-foreground" />
            <a href={`tel:${contact.phone}`} className="hover:underline">{contact.phone}</a>
          </div>
        )}
        {contact.location && (
          <div className="flex items-center gap-1">
            <MapPin className="h-4 w-4 text-muted-foreground" /> {contact.location}
          </div>
        )}
        {contact.linkedin && (
          <div className="flex items-center gap-1">
            <LinkIcon className="h-4 w-4 text-muted-foreground" />
            <a href={contact.linkedin} target="_blank" className="text-blue-600 hover:underline">LinkedIn</a>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Main Timeline / Activity - Left Column */}
        <div className="lg:col-span-7">
          <Card>
            <CardContent className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-2xl font-semibold">Activity & Relationship Tracking</h3>
                <Button onClick={openCreate}>
                  <Plus className="mr-2 h-4 w-4" /> Log New Activity
                </Button>
              </div>

              <div className="space-y-6">
                {activities.length === 0 ? (
                  <p className="text-center py-12 text-muted-foreground">No activities yet. Log the first one!</p>
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
            </CardContent>
          </Card>
        </div>

        {/* Right Sidebar - Stats & Quick Links */}
        <div className="lg:col-span-5 space-y-6">
          {/* Open Jobs */}
          <Card>
            <CardContent className="p-6">
              <h3 className="font-semibold mb-4 flex items-center gap-2">
                <Users className="h-5 w-5" /> Open Jobs at {companyName}
              </h3>
              {safeCompanyJobs.length > 0 ? (
                safeCompanyJobs.map((job: any) => (
                  <div 
                    key={job.id} 
                    className="border rounded-lg p-4 mb-3 hover:bg-muted/50 cursor-pointer transition-colors"
                    onClick={() => router.push(`/dashboard/jobs/${job.id}`)}
                  >
                    <div className="font-medium">{job.title}</div>
                    <div className="text-sm text-muted-foreground">{job.status}</div>
                  </div>
                ))
              ) : (
                <p className="text-muted-foreground">No open jobs right now.</p>
              )}
            </CardContent>
          </Card>

          {/* Quick Links / Stats */}
          <Card>
            <CardContent className="p-6 space-y-4">
              <h3 className="font-semibold">Quick Links</h3>
              <Button 
                variant="ghost" 
                className="w-full justify-start"
                onClick={() => companyId && router.push(`/dashboard/companies/${companyId}?tab=contacts`)}
              >
                View Company Contacts
              </Button>
              <Button variant="ghost" className="w-full justify-start">
                Send Candidate Profile
              </Button>
              {contact.linkedin && (
                <Button variant="ghost" className="w-full justify-start" asChild>
                  <a href={contact.linkedin} target="_blank">View Full LinkedIn</a>
                </Button>
              )}
            </CardContent>
          </Card>
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
