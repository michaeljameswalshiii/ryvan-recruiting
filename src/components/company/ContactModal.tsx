"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SimpleDialog } from "@/components/ui/simple-dialog";
import { Switch } from "@/components/ui/switch";
import { useAddContact, useUpdateContact, useClients } from "@/lib/hooks/query-client";
import { toast } from "sonner";
import { Loader2, Star, Building2 } from "lucide-react";

interface Contact {
  id?: string;
  name: string;
  title?: string;
  email?: string;
  phone?: string;
  isPrimary?: boolean;
  notes?: string;
}

interface ContactModalProps {
  clientId: string;
  contact?: Contact;
  onSave: () => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export default function ContactModal({
  clientId: initialClientId,
  contact,
  onSave,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: ContactModalProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Use controlled props if provided, otherwise use internal state
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = isControlled
    ? (value: boolean) => controlledOnOpenChange?.(value)
    : setInternalOpen;

  // Fetch companies for dropdown
  const { data: companies = [], isLoading: isLoadingCompanies } = useClients();

  // Form state - include companyId
  const [formData, setFormData] = useState({
    clientId: "",
    name: "",
    title: "",
    email: "",
    phone: "",
    isPrimary: false,
    notes: "",
  });

  // Mutations
  const addContactMutation = useAddContact();
  const updateContactMutation = useUpdateContact();

  // Reset form when modal opens or contact changes
  useEffect(() => {
    if (open) {
      // Sort companies alphabetically
      const sortedCompanies = [...companies].sort((a, b) => 
        (a.name || "").localeCompare(b.name || "")
      );
      
      if (contact) {
        // Editing existing contact
        setFormData({
          clientId: initialClientId,
          name: contact.name || "",
          title: contact.title || "",
          email: contact.email || "",
          phone: contact.phone || "",
          isPrimary: contact.isPrimary || false,
          notes: contact.notes || "",
        });
      } else if (open) {
        // New contact - use passed clientId or first company
        const defaultClientId = initialClientId || (sortedCompanies.length > 0 ? sortedCompanies[0].id : "");
        setFormData({
          clientId: defaultClientId,
          name: "",
          title: "",
          email: "",
          phone: "",
          isPrimary: false,
          notes: "",
        });
      }
    }
  }, [open, contact, initialClientId, companies]);

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error("Contact name is required");
      return;
    }

    if (!formData.clientId) {
      toast.error("Please select a company");
      return;
    }

    setIsSaving(true);

    try {
      if (contact?.id) {
        // Update existing contact
        await updateContactMutation.mutateAsync({
          clientId: formData.clientId,
          contactId: contact.id,
          contactData: {
            name: formData.name,
            title: formData.title,
            email: formData.email,
            phone: formData.phone,
            isPrimary: formData.isPrimary,
            notes: formData.notes,
          },
        });
        toast.success(`${formData.name} updated successfully!`);
      } else {
        // Add new contact
        await addContactMutation.mutateAsync({
          clientId: formData.clientId,
          contactData: {
            name: formData.name,
            title: formData.title,
            email: formData.email,
            phone: formData.phone,
            isPrimary: formData.isPrimary,
            notes: formData.notes,
          },
        });
        toast.success(`${formData.name} added successfully!`);
      }

      onSave();
      setOpen(false);
    } catch (err: any) {
      console.error("Failed to save contact:", err);
      toast.error(err.message || "Failed to save contact");
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen && contact) {
      setFormData({
        clientId: initialClientId,
        name: contact.name || "",
        title: contact.title || "",
        email: contact.email || "",
        phone: contact.phone || "",
        isPrimary: contact.isPrimary || false,
        notes: contact.notes || "",
      });
    } else if (!isOpen) {
      setFormData({
        clientId: initialClientId || "",
        name: "",
        title: "",
        email: "",
        phone: "",
        isPrimary: false,
        notes: "",
      });
    }
    setOpen(isOpen);
  };

  // Sort companies for dropdown
  const sortedCompanies = [...companies].sort((a, b) => 
    (a.name || "").localeCompare(b.name || "")
  );

  const isLoading = addContactMutation.isPending || updateContactMutation.isPending;

  return (
    <>
      <SimpleDialog
        open={open}
        onOpenChange={handleOpenChange}
        title={contact?.id ? "Edit Contact" : "Add Contact"}
        description={
          contact?.id
            ? "Update contact information."
            : "Add a new contact to a company."
        }
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={!formData.name.trim() || !formData.clientId || isSaving}
            >
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : contact?.id ? (
                "Save Changes"
              ) : (
                "Add Contact"
              )}
            </Button>
          </>
        }
      >
        <div className="grid gap-4">
          {/* Company Selection - Only show for new contacts or allow changing */}
          <div className="grid gap-2">
            <Label htmlFor="contact-company">Company *</Label>
            {isLoadingCompanies ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading companies...
              </div>
            ) : sortedCompanies.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                No companies found. Add a company first.
              </div>
            ) : (
              <select
                id="contact-company"
                value={formData.clientId}
                onChange={(e) => setFormData({ ...formData, clientId: e.target.value })}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="">Select a company...</option>
                {sortedCompanies.map((company: any) => (
                  <option key={company.id} value={company.id}>
                    {company.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Name */}
          <div className="grid gap-2">
            <Label htmlFor="contact-name">Name *</Label>
            <Input
              id="contact-name"
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              placeholder="John Smith"
            />
          </div>

          {/* Title / Role */}
          <div className="grid gap-2">
            <Label htmlFor="contact-title">Title / Role</Label>
            <Input
              id="contact-title"
              value={formData.title}
              onChange={(e) =>
                setFormData({ ...formData, title: e.target.value })
              }
              placeholder="CEO, VP of Engineering, etc."
            />
          </div>

          {/* Email */}
          <div className="grid gap-2">
            <Label htmlFor="contact-email">Email</Label>
            <Input
              id="contact-email"
              type="email"
              value={formData.email}
              onChange={(e) =>
                setFormData({ ...formData, email: e.target.value })
              }
              placeholder="john@company.com"
            />
          </div>

          {/* Phone */}
          <div className="grid gap-2">
            <Label htmlFor="contact-phone">Phone</Label>
            <Input
              id="contact-phone"
              type="tel"
              value={formData.phone}
              onChange={(e) =>
                setFormData({ ...formData, phone: e.target.value })
              }
              placeholder="+1 (555) 123-4567"
            />
          </div>

          {/* Set as Primary */}
          <div className="flex items-center justify-between py-2">
            <div className="flex items-center gap-2">
              <Star className="h-4 w-4 text-yellow-500" />
              <Label htmlFor="contact-primary" className="cursor-pointer">
                Set as Primary Contact
              </Label>
            </div>
            <Switch
              id="contact-primary"
              checked={formData.isPrimary}
              onCheckedChange={(checked) =>
                setFormData({ ...formData, isPrimary: checked })
              }
            />
          </div>

          {/* Notes */}
          <div className="grid gap-2">
            <Label htmlFor="contact-notes">Notes</Label>
            <Textarea
              id="contact-notes"
              value={formData.notes}
              onChange={(e) =>
                setFormData({ ...formData, notes: e.target.value })
              }
              placeholder="Additional notes about this contact..."
              rows={3}
            />
          </div>
        </div>
      </SimpleDialog>
    </>
  );
}
