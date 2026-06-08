"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Avatar } from "@/components/ui/avatar";
import { useClients, useAddContact } from "@/lib/hooks/query-client";
import { toast } from "sonner";

export default function NewContactPage() {
  const router = useRouter();
  const { data: clients = [], isLoading } = useClients();
  const addContactMutation = useAddContact();

  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [companySearch, setCompanySearch] = useState("");
  const [formData, setFormData] = useState({
    name: "",
    title: "",
    email: "",
    phone: "",
    isPrimary: false,
    notes: "",
  });

  // Filter companies based on search
  const filteredClients = clients.filter((c: any) => {
    if (!companySearch) return true;
    return c.name?.toLowerCase().includes(companySearch.toLowerCase());
  });

  // Get selected company
  const selectedCompany = clients.find((c: any) => c.id === selectedCompanyId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedCompanyId) {
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

    try {
      await addContactMutation.mutateAsync({
        clientId: selectedCompanyId,
        contactData: {
          name: formData.name,
          title: formData.title,
          email: formData.email,
          phone: formData.phone,
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

  const handleChangeCompany = () => {
    setSelectedCompanyId("");
    setFormData({
      name: "",
      title: "",
      email: "",
      phone: "",
      isPrimary: false,
      notes: "",
    });
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
          <p className="text-muted-foreground">Add a contact to a company</p>
        </div>
      </div>

      {/* Step 1: Company Selection */}
      {!selectedCompanyId && (
        <Card>
          <CardHeader>
            <CardTitle>Step 1: Select Company</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search companies..."
                value={companySearch}
                onChange={(e) => setCompanySearch(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Company List */}
            <div className="max-h-[400px] overflow-y-auto space-y-2">
              {filteredClients.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No companies found
                </div>
              ) : (
                filteredClients.map((company: any) => (
                  <button
                    key={company.id}
                    type="button"
                    onClick={() => setSelectedCompanyId(company.id)}
                    className="w-full flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors text-left"
                  >
                    <Avatar fallback={company.name} className="h-10 w-10" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{company.name}</p>
                      <p className="text-sm text-muted-foreground truncate">
                        {(company as any).location || "No location"} • {(company as any).industry || "No industry"}
                      </p>
                    </div>
                  </button>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Contact Details */}
      {selectedCompanyId && selectedCompany && (
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Selected Company */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-4">
                <Avatar fallback={selectedCompany.name} className="h-12 w-12" />
                <div className="flex-1">
                  <p className="font-medium text-lg">{selectedCompany.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {(selectedCompany as any).location || "No location"}
                  </p>
                </div>
                <Button type="button" variant="outline" onClick={handleChangeCompany}>
                  Change
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Contact Form */}
          <Card>
            <CardHeader>
              <CardTitle>Step 2: Contact Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
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

              <div>
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="(555) 123-4567"
                />
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
      )}
    </div>
  );
}
