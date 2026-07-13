'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Plus, RefreshCw, User } from 'lucide-react';
import { useLeads, useDeleteLead } from '@/lib/hooks/query-lead';

export function CandidatesClient() {
  const router = useRouter();
  const { data: leads = [], isLoading, error, refetch } = useLeads();
  const deleteLeadMutation = useDeleteLead();

  const goToNewCandidate = () => {
    // Full create flow with resume upload + auto-populate
    router.push('/dashboard/candidates/new');
  };

  const handleDeleteCandidate = async (leadId: string, candidateName: string) => {
    if (!confirm(`Are you sure you want to delete ${candidateName}?`)) {
      return;
    }
    
    try {
      await deleteLeadMutation.mutateAsync(leadId);
      refetch();
      alert('Candidate deleted successfully!');
    } catch (err: any) {
      console.error('Delete candidate error:', err);
      alert(`Failed to delete candidate: ${err?.message || 'Unknown error'}`);
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold">Candidates</h1>
            <p className="text-gray-500">Manage your talent pipeline</p>
          </div>
        </div>
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
          <span className="ml-3 text-muted-foreground">Loading candidates...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold">Candidates</h1>
            <p className="text-gray-500">Manage your talent pipeline</p>
          </div>
          <Button onClick={() => refetch()} variant="outline">
            <RefreshCw className="mr-2 h-4 w-4" /> Retry
          </Button>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
          <div className="text-red-600 text-xl font-semibold mb-2">Error Loading Candidates</div>
          <p className="text-red-600">{error.message}</p>
          <Button onClick={() => refetch()} className="mt-4">
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  // Get unique candidates from leads
  const candidates = leads;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold">Candidates</h1>
          <p className="text-gray-500">Manage your talent pipeline</p>
        </div>
        <Button onClick={goToNewCandidate}>
          <Plus className="mr-2 h-5 w-5" /> New Candidate
        </Button>
      </div>

      {/* Candidates Table */}
      {candidates.length === 0 ? (
        <div className="bg-white border rounded-2xl p-12 text-center">
          <div className="text-4xl mb-6">👤</div>
          <h2 className="text-2xl font-semibold mb-3">No Candidates Yet</h2>
          <p className="text-gray-600 max-w-md mx-auto mb-6">
            Get started by uploading a resume or adding your first candidate.
          </p>
          <Button onClick={goToNewCandidate}>
            <Plus className="mr-2 h-4 w-4" /> Add Your First Candidate
          </Button>
        </div>
      ) : (
        <div className="bg-white border rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Candidate</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Title</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Status</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Source</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Added</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {candidates.map((candidate: any) => (
                <tr key={candidate.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 bg-purple-100 rounded-full flex items-center justify-center">
                        <User className="h-5 w-5 text-purple-600" />
                      </div>
                      <div>
                        <div className="font-medium">{candidate.name}</div>
                        <div className="text-sm text-gray-500">{candidate.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {candidate.title || candidate.jobTitle || '-'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs ${
                      candidate.status === 'New' || candidate.status === 'new'
                        ? 'bg-blue-100 text-blue-700'
                        : candidate.status === 'Contacted'
                        ? 'bg-yellow-100 text-yellow-700'
                        : candidate.status === 'Interview'
                        ? 'bg-purple-100 text-purple-700'
                        : candidate.status === 'Offer'
                        ? 'bg-orange-100 text-orange-700'
                        : candidate.status === 'Hired'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-700'
                    }`}>
                      {candidate.status || 'New'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {candidate.source || '-'}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {candidate.created_at 
                      ? new Date(candidate.created_at).toLocaleDateString()
                      : '-'}
                  </td>
<td className="px-4 py-3">
                    <div className="flex gap-2">
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => router.push(`/dashboard/candidates/${candidate.id}`)}
                      >
                        View
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => router.push(`/dashboard/candidates/${candidate.id}/edit`)}
                      >
                        Edit
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        className="text-red-600 hover:text-red-700"
                        onClick={() => handleDeleteCandidate(candidate.id, candidate.name)}
                      >
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Stats Footer */}
      {candidates.length > 0 && (
        <div className="mt-4 text-sm text-gray-500">
          Showing {candidates.length} candidate{candidates.length !== 1 ? 's' : ''}
        </div>
      )}
    </div>
  );
}
