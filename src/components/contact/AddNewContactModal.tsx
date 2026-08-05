'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, User, Building, Mail, Phone, Briefcase } from 'lucide-react';
import {
  SearchableSelect,
  companyOptionsFromList,
} from '@/components/ui/searchable-select';

interface AddNewContactModalProps {
  isOpen: boolean;
  onClose: () => void;
  companies?: any[];
  onSuccess?: () => void;
}

export default function AddNewContactModal({ isOpen, onClose, companies = [], onSuccess }: AddNewContactModalProps) {
  const [formData, setFormData] = useState({
    companyId: '',
    name: '',
    email: '',
    phone: '',
    title: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      // Call create contact action - would need to be imported from actions
      // await createContact(formData);
      console.log('Creating contact:', formData);
      onSuccess?.();
      onClose();
    } catch (err: any) {
      console.error('Failed to create contact:', err);
      alert(err?.message || 'Failed to create contact');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-2xl">
            <User className="h-6 w-6" /> Add New Contact
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Company Selection */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Building className="h-5 w-5" /> Company
              </CardTitle>
            </CardHeader>
            <CardContent>
              <SearchableSelect
                value={formData.companyId}
                onValueChange={(v) =>
                  setFormData({ ...formData, companyId: v })
                }
                options={companyOptionsFromList(companies)}
                placeholder="Select company"
                searchPlaceholder="Search companies…"
                required
              />
            </CardContent>
          </Card>

          {/* Basic Contact Info */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Contact Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Contact Name *</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  placeholder="Full name"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="flex items-center gap-1"><Mail className="h-4 w-4" /> Email</Label>
                  <Input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="email@company.com"
                  />
                </div>
                <div>
                  <Label className="flex items-center gap-1"><Phone className="h-4 w-4" /> Phone</Label>
                  <Input
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="(555) 123-4567"
                  />
                </div>
              </div>

              <div>
                <Label className="flex items-center gap-1"><Briefcase className="h-4 w-4" /> Title</Label>
                <Input
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="e.g. Purchasing Manager"
                />
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Add Contact
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
