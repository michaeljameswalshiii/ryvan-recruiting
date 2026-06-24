'use client';

import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, RefreshCw, Search, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { SimpleDialog } from '@/components/ui/simple-dialog';
import { 
  useLeads, 
  useCreateLead, 
  useUpdateLead, 
  leadKeys 
} from '@/lib/hooks/query-lead';
import { useRouter } from 'next/navigation';

// Debug: fetch session info for troubleshooting
async function fetchSessionInfo() {
  try {
    const res = await fetch('/api/auth/session');
    if (res.ok) {
      return await res.json();
    }
  } catch (e) {
    console.error('Session fetch error:', e);
  }
  return null;
}

// Debug UI - show when debug info is loaded
function DebugPanel({ session, leadsData, debugInfo, rawLeads }: { session: any, leadsData: any, debugInfo: any, rawLeads?: any }) {
  return (
    <div className="p-4 bg-yellow-50 border border-yellow-300 rounded-lg text-sm">
      <h3 className="font-bold text-yellow-800 mb-2">🔧 Debug Info</h3>
      <div className="grid gap-2 text-xs">
        <div><strong>Session:</strong> {JSON.stringify(session)}</div>
        <div><strong>Leads Data Raw:</strong> {JSON.stringify(rawLeads)}</div>
        <div><strong>Leads Array:</strong> {leadsData?.leads?.length || 0} items</div>
        <div><strong>First Lead:</strong> {leadsData?.leads?.[0] ? JSON.stringify(leadsData.leads[0]) : 'none'}</div>
      </div>
    </div>
  );
}

export default function CandidatesPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [debugInfo, setDebugInfo] = useState<any>(null);
  
  // Load debug info on mount
  useEffect(() => {
    fetchSessionInfo().then(setDebugInfo);
  }, []);
  
// Use TanStack Query hooks
  console.log('[CandidatesPage] Calling useLeads hook...');
  const { data: leadsDataRaw, isLoading, error, refetch } = useLeads();
  console.log('[CandidatesPage] After useLeads:', { 
    isLoading, 
    error: error?.message, 
    leadsRaw: leadsDataRaw?.leads?.length,
    raw: leadsDataRaw 
  });
  const createLeadMutation = useCreateLead();
  const updateLeadMutation = useUpdateLead();

  // Handle both API response formats: { leads: [...] } or direct [...]
  // Also handle when leadsDataRaw itself IS the array (the actual bug!)
  let leadsArray: any[] = [];
  if (Array.isArray(leadsDataRaw)) {
    // API returns array directly
    leadsArray = leadsDataRaw;
  } else if (leadsDataRaw && typeof leadsDataRaw === 'object' && Array.isArray((leadsDataRaw as any).leads)) {
    // API returns { leads: [...] }
    leadsArray = (leadsDataRaw as any).leads;
  } else {
    // Default to empty array
    leadsArray = [];
  }
  
  // Search and filter
  const filteredLeads = leadsArray.filter((lead: any) => {
    const matchesSearch = !searchQuery || 
      (lead.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (lead.email || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (lead.title || '').toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || 
      (lead.status || '').toLowerCase() === statusFilter.toLowerCase();
    
    return matchesSearch && matchesStatus;
  });

  // Form state for adding new lead
  const [newLeadName, setNewLeadName] = useState("");
  const [newLeadEmail, setNewLeadEmail] = useState("");
  const [newLeadPhone, setNewLeadPhone] = useState("");
  const [newLeadTitle, setNewLeadTitle] = useState("");
  const [newLeadLocation, setNewLeadLocation] = useState("");
  const [newLeadSource, setNewLeadSource] = useState("");

  // Handle add lead
  const handleAddLead = async () => {
    if (!newLeadName || !newLeadEmail) {
      alert("Name and Email are required");
      return;
    }

    try {
      await createLeadMutation.mutateAsync({
        name: newLeadName,
        email: newLeadEmail,
        phone: newLeadPhone,
        title: newLeadTitle,
        location: newLeadLocation,
        source: newLeadSource,
        status: "Identified"
      });

      setIsAddDialogOpen(false);
      setNewLeadName("");
      setNewLeadEmail("");
      setNewLeadPhone("");
      setNewLeadTitle("");
      setNewLeadLocation("");
      setNewLeadSource("");
      alert("Candidate added successfully!");
    } catch (err: any) {
      console.error("Add lead error:", err);
      alert(`Failed to add candidate: ${err?.message || err?.error || "Unknown error"}`);
    }
  };

  // Handle refresh
  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: leadKeys.lists() });
    refetch();
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Candidates</h1>
          <p className="text-muted-foreground">Manage your candidate pipeline.</p>
        </div>
        <div className="text-muted-foreground">Loading candidates...</div>
      </div>
    );
  }

  // Error state
  if (error) {
    const errorMessage = error?.message || 'Unknown error';
    const showSetupLink = errorMessage.includes('table') || errorMessage.includes('does not exist');

    return (
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Candidates</h1>
          <p className="text-muted-foreground">Manage your candidate pipeline.</p>
        </div>
        <div className="p-4 rounded-md bg-destructive/10 text-destructive space-y-4">
          <div>
            <p className="font-semibold">Failed to load candidates.</p>
            <p className="text-sm mt-1 opacity-80">Error: {errorMessage}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" onClick={handleRefresh}>
              Retry
            </Button>
            {showSetupLink && (
              <Button 
                variant="secondary" 
                onClick={() => window.open('/api/admin/dynamodb?setup=leads', '_blank')}
              >
                Setup Tables
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

return (
    <div className="p-6 space-y-6">
{/* DEBUG PANEL - Show session and leads data for troubleshooting */}
      {debugInfo && <DebugPanel session={debugInfo} leadsData={{ leads: leadsArray }} debugInfo={debugInfo} rawLeads={leadsDataRaw} />}

      {/* HEADER */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Candidates</h1>
          <p className="text-muted-foreground">Manage your candidate pipeline.</p>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={handleRefresh}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button onClick={() => setIsAddDialogOpen(true)} disabled={createLeadMutation.isPending}>
            <Plus className="h-4 w-4 mr-2" />
            {createLeadMutation.isPending ? "Adding..." : "Add Candidate"}
          </Button>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-wrap gap-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search candidates..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="all">All Status</option>
          <option value="identified">Identified</option>
          <option value="submitted">Submitted</option>
          <option value="interviewing">Interviewing</option>
          <option value="offer out">Offer Out</option>
          <option value="accepted">Accepted</option>
        </select>
      </div>

      {/* Stats */}
      <div className="flex flex-wrap gap-2">
        <div className="bg-card border border-border rounded-lg px-4 py-2 text-sm">
          <span className="text-muted-foreground">Total:</span>{' '}
          <span className="font-semibold">{leadsArray.length}</span>
        </div>
      </div>

      {/* List */}
      {filteredLeads.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          No candidates found. Add your first candidate to get started.
        </div>
      ) : (
        <div className="bg-card border rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-3 text-sm font-medium">Name</th>
                <th className="text-left p-3 text-sm font-medium">Title</th>
                <th className="text-left p-3 text-sm font-medium">Email</th>
                <th className="text-left p-3 text-sm font-medium">Status</th>
                <th className="text-left p-3 text-sm font-medium">Source</th>
              </tr>
            </thead>
            <tbody>
              {filteredLeads.map((lead: any) => (
                <tr 
                  key={lead.id} 
                  className="border-t hover:bg-muted/30 cursor-pointer"
                  onClick={() => router.push(`/dashboard/candidates/${lead.id}`)}
                >
                  <td className="p-3">{lead.name}</td>
                  <td className="p-3 text-muted-foreground">{lead.title}</td>
                  <td className="p-3 text-muted-foreground">{lead.email}</td>
                  <td className="p-3">
                    <Badge variant={lead.status === 'Accepted' ? 'default' : 'secondary'}>
                      {lead.status || 'Identified'}
                    </Badge>
                  </td>
                  <td className="p-3 text-muted-foreground">{lead.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Candidate Dialog */}
      <SimpleDialog
        open={isAddDialogOpen}
        onOpenChange={setIsAddDialogOpen}
        title="Add New Candidate"
        description="Add a candidate to your pipeline."
        footer={
          <>
            <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAddLead}
              disabled={!newLeadName || !newLeadEmail || createLeadMutation.isPending}
            >
              {createLeadMutation.isPending ? "Adding..." : "Add Candidate"}
            </Button>
          </>
        }
      >
        <div className="grid gap-4">
          <div className="grid gap-2">
            <label className="text-sm font-medium">Name *</label>
            <Input
              value={newLeadName}
              onChange={(e) => setNewLeadName(e.target.value)}
              placeholder="John Smith"
            />
          </div>
          <div className="grid gap-2">
            <label className="text-sm font-medium">Email *</label>
            <Input
              type="email"
              value={newLeadEmail}
              onChange={(e) => setNewLeadEmail(e.target.value)}
              placeholder="john@example.com"
            />
          </div>
          <div className="grid gap-2">
            <label className="text-sm font-medium">Phone</label>
            <Input
              value={newLeadPhone}
              onChange={(e) => setNewLeadPhone(e.target.value)}
              placeholder="(555) 123-4567"
            />
          </div>
          <div className="grid gap-2">
            <label className="text-sm font-medium">Title</label>
            <Input
              value={newLeadTitle}
              onChange={(e) => setNewLeadTitle(e.target.value)}
              placeholder="Software Engineer"
            />
          </div>
          <div className="grid gap-2">
            <label className="text-sm font-medium">Location</label>
            <Input
              value={newLeadLocation}
              onChange={(e) => setNewLeadLocation(e.target.value)}
              placeholder="San Francisco, CA"
            />
          </div>
          <div className="grid gap-2">
            <label className="text-sm font-medium">Source</label>
            <select
              value={newLeadSource}
              onChange={(e) => setNewLeadSource(e.target.value)}
              className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">Select source...</option>
              <option value="LinkedIn">LinkedIn</option>
              <option value="Indeed">Indeed</option>
              <option value="Referral">Referral</option>
              <option value="Website">Website</option>
              <option value="Other">Other</option>
            </select>
          </div>
        </div>
      </SimpleDialog>
    </div>
  );
}
