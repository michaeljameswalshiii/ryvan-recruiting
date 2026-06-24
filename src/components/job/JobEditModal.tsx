'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useUpdateJob } from '@/lib/hooks/query-job';
import { toast } from 'sonner';

interface JobEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  job: any;
  onSuccess?: () => void;
}

type JobDataType = {
  [key: string]: string;
};

export default function JobEditModal({ isOpen, onClose, job, onSuccess }: JobEditModalProps) {
  const updateJob = useUpdateJob();

  const [formData, setFormData] = useState({
    title: job.title || '',
    description: job.description || '',
    location: job.location || '',
    salaryRange: job.salaryRange || '',
    employmentType: job.employmentType || 'Full-time',
    companyName: job.companyName || '',
    status: job.status || 'Open',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const jobData: JobDataType = {};

    if (formData.title?.trim() && formData.title !== job.title) {
      jobData.title = formData.title.trim();
    }
    if (formData.description?.trim() !== (job.description || '')) {
      jobData.description = formData.description.trim();
    }
    if (formData.location?.trim() !== (job.location || '')) {
      jobData.location = formData.location.trim();
    }
    if (formData.salaryRange?.trim() !== (job.salaryRange || '')) {
      jobData.salaryRange = formData.salaryRange.trim();
    }
    if (formData.employmentType !== job.employmentType) {
      jobData.employmentType = formData.employmentType;
    }
    if (formData.companyName?.trim() !== (job.companyName || '')) {
      jobData.companyName = formData.companyName.trim();
    }
if (formData.status !== job.status) {
      jobData.status = formData.status;
    }

    // Extra safety: remove any remaining empty strings
    Object.keys(jobData).forEach(key => {
      if (jobData[key] === '') delete jobData[key];
    });

    console.log('🚀 Final payload to useUpdateJob:', { jobId: job.id, jobData });

    if (Object.keys(jobData).length === 0) {
      toast.info("No changes detected");
      onClose();
      return;
    }

    try {
      const result = await updateJob.mutateAsync({ jobId: job.id, jobData });
      
      if (result && result.error) {
        throw new Error(result.error);
      }

      toast.success('Job updated successfully!');
      onSuccess?.();
      onClose();
    } catch (error: any) {
      console.error('❌ Update error details:', error);
      toast.error('Failed to update job', {
        description: error?.message || 'Please try again',
      });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Job</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <Label>Job Title</Label>
            <Input value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} required />
          </div>

          <div>
            <Label>Company Name</Label>
            <Input value={formData.companyName} onChange={(e) => setFormData({ ...formData, companyName: e.target.value })} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Location</Label>
              <Input value={formData.location} onChange={(e) => setFormData({ ...formData, location: e.target.value })} />
            </div>
            <div>
              <Label>Salary Range</Label>
              <Input value={formData.salaryRange} onChange={(e) => setFormData({ ...formData, salaryRange: e.target.value })} />
            </div>
          </div>

          <div>
            <Label>Description</Label>
            <Textarea value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} rows={6} />
          </div>

          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={updateJob.isPending}>
              {updateJob.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
