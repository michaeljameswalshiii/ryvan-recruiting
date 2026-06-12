"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Plus, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useClients, useAddContact } from "@/lib/hooks/query-client";
import { toast } from "sonner";

// Phone types
const PHONE_TYPES = [
  { value: "work", label: "Work" },
  { value: "direct", label: "Direct" },
  { value: "cell", label: "Cell" },
  { value: "other", label: "Other" },
];

interface PhoneEntry {
  id: string;
  type: string;
  number: string;
  isPreferred: boolean;
}

function generateId() {
  return Math.random().toString(36).substring(2, 15);
}

export default function NewContactPage() {
  const router = useRouter();
  const { data: clients = [], isLoading } = useClients();
  const addContactMutation = useAddContact();

  const [formData, setFormData] = useState({
    name: "",
    title: "",
    email: "",
    isPrimary: false,
    notes: "",
    companyId: "",
  });

  const [phones, setPhones] = useState<PhoneEntry[]>([
    { id: generateId(), type: "work", number: "", isPreferred: true },
  ]);

const handleAddPhone = () => {
    setPhones([
      ...phones,
      { id: generateId(), type: "cell", number: "", isPreferred: false },
    ]);
  };

  const handleRemovePhone = (id: string) => {
    if (phones.length === 1) {
      toast.error("At least one phone number is required");
      return;
    }
    setPhones(phones.filter((p) => p.id !== id));
  };

  const handlePhoneChange = (id: string, field: keyof PhoneEntry, value: string | boolean) => {
    // If setting as preferred, uncheck all others
    if (field === "isPreferred" && value === true) {
      setPhones(phones.map((p) => (p.id === id ? { ...p, isPreferred: true } : { ...p, isPreferred: false })));
    } else {
      setPhones(phones.map((p) => (p.id === id ? { ...p, [field]: value } : p)));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.companyId) {
      toast.error("Please select a company");
      return;
    }

    if (!formData.name) {
      toast.error("Name is required");
      return;
    }

    if (!formData.email) {
      toast.error("Email is required");
      return;
    }

    // Filter out empty phones
    const validPhones = phones.filter((p) => p.number.trim() !== "");

    try {
      await addContactMutation.mutateAsync({
        clientId: formData.companyId,
        contactData: {
          name: formData.name,
          title: formData.title,
          email: formData.email,
          phones: validPhones,
          isPrimary: formData.isPrimary,
          notes: formData.notes,
        },
      });
      toast.success("Contact added successfully!");
      router.push("/dashboard/contacts");
    } catch (error: any) {
      toast.error(error.message || "Failed to add contact");
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="p-8 max-w-2xl mx-auto">
        <div className="flex items-center gap-4 mb-8">
          <Link href="/dashboard/contacts">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <h1 className="text-3xl font-bold">Add New Contact</h1>
        </div>
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <div className="flex items-center gap-4 mb-8">
        <Link href="/dashboard/contacts">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold">Add New Contact</h1>
          <p className="text-muted-foreground">Add a new contact</p>
        </div>
      </div>

      {/* Contact Form - Single Page */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Contact Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Company - Optional Dropdown */}
<div>
              <Label htmlFor="company">Company *</Label>
              <select
                id="company"
                value={formData.companyId}
                onChange={(e) => setFormData({ ...formData, companyId: e.target.value })}
                className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm w-full"
                required
              >
                <option value="">Select a company...</option>
                {clients.map((company: any) => (
                  <option key={company.id} value={company.id}>
                    {company.name} {company.location ? `- ${company.location}` : ""}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <Label htmlFor="name">Full Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="John Smith"
                required
              />
            </div>

            <div>
              <Label htmlFor="title">Title / Position</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="VP of Sales"
              />
            </div>

<div>
              <Label htmlFor="email">Email *</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="john@company.com"
                required
              />
            </div>

            {/* Phone Numbers Section */}
            <div>
              <Label>Phone Numbers</Label>
              <div className="space-y-3 mt-2">
                {phones.map((phone, index) => (
                  <div key={phone.id} className="flex items-center gap-2 p-3 border rounded-lg bg-background">
                    <select
                      value={phone.type}
                      onChange={(e) => handlePhoneChange(phone.id, "type", e.target.value)}
                      className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm w-28"
                    >
                      {PHONE_TYPES.map((type) => (
                        <option key={type.value} value={type.value}>
                          {type.label}
                        </option>
                      ))}
                    </select>
                    <Input
                      value={phone.number}
                      onChange={(e) => handlePhoneChange(phone.id, "number", e.target.value)}
                      placeholder="(555) 123-4567"
                      className="flex-1"
                    />
                    <button
                      type="button"
                      onClick={() => handlePhoneChange(phone.id, "isPreferred", !phone.isPreferred)}
                      className={`flex items-center justify-center w-10 h-10 rounded-md border ${
                        phone.isPreferred
                          ? "border-amber-500 bg-amber-50 text-amber-600"
                          : "border-input text-muted-foreground hover:text-foreground"
                      }`}
                      title={phone.isPreferred ? "Preferred" : "Mark as Preferred"}
                    >
                      <Star className={`h-4 w-4 ${phone.isPreferred ? "fill-current" : ""}`} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemovePhone(phone.id)}
                      className="flex items-center justify-center w-10 h-10 rounded-md border border-input text-muted-foreground hover:text-destructive hover:border-destructive"
                      title="Remove phone"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                <Button type="button" variant="outline" onClick={handleAddPhone} className="w-full">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Another Phone
                </Button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Switch
                id="primary"
                checked={formData.isPrimary}
                onCheckedChange={(checked: boolean) => setFormData({ ...formData, isPrimary: checked })}
              />
              <Label htmlFor="primary" className="font-normal">
                Mark as Primary Contact
              </Label>
            </div>

            <div>
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Additional notes about this contact..."
                rows={3}
              />
            </div>

            <div className="flex gap-4 pt-4">
              <Button type="submit" className="flex-1" disabled={addContactMutation.isPending}>
                <Plus className="mr-2 h-4 w-4" />
                {addContactMutation.isPending ? "Adding..." : "Add Contact"}
              </Button>
              <Button type="button" variant="outline" onClick={() => router.push("/dashboard/contacts")}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
