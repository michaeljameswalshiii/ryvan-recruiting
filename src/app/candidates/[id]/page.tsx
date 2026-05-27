import { notFound } from 'next/navigation';
import { getSessionTenantId } from '@/lib/server-auth';
import { getLeadById } from '@/lib/db/repositories/lead-repository';
import { EventTimeline } from '@/components/candidate/EventTimeline';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Mail, Edit } from 'lucide-react';

interface Candidate {
  id: string;
  name: string;
  email: string;
  phone?: string;
  title?: string;
  company?: string;
  linkedin?: string;
  resumeUrl?: string;
  status: string;
  source?: string;
  tenant_id: string;
  createdAt: string;
}

interface Props {
  params: { id: string };
}

export default async function CandidateDetailPage({ params }: Props) {
  const candidateId = params.id;

  // === TENANT AUTHENTICATION (security) ===
  const tenantId = await getSessionTenantId();
  if (!tenantId) {
    notFound();
  }

  // Fetch candidate with tenant isolation
  const candidate = await getLeadById(tenantId, candidateId);

  if (!candidate) {
    notFound();
  }

  // Format candidate data for display
  const candidateData: Candidate = {
    id: candidate.id || '',
    name: candidate.name || '',
    email: candidate.email || '',
    phone: candidate.phone || '',
    title: candidate.title || '',
    company: candidate.location || '',
    linkedin: candidate.linkedin_url || '',
    resumeUrl: candidate.resume_url || '',
    status: candidate.status || 'identification',
    source: candidate.source || '',
    tenant_id: tenantId,
    createdAt: candidate.created_at || '',
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" asChild>
              <a href="/candidates">
                <ArrowLeft className="h-5 w-5" />
              </a>
            </Button>

            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-full flex items-center justify-center text-2xl font-semibold text-white">
                {candidateData.name.split(' ').map(n => n[0]).join('').toUpperCase()}
              </div>
              <div>
                <h1 className="text-3xl font-semibold tracking-tight">{candidateData.name}</h1>
                <div className="flex items-center gap-3 text-sm text-gray-600">
                  <span>{candidateData.title}</span>
                  {candidateData.company && (
                    <>
                      <span className="text-gray-400">•</span>
                      <span>{candidateData.company}</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <Button asChild>
              <a href={`mailto:${candidateData.email}`}>
                <Mail className="mr-2 h-4 w-4" /> Send Email
              </a>
            </Button>
            <Button variant="outline">
              <Edit className="mr-2 h-4 w-4" /> Edit
            </Button>
          </div>
        </div>

        {/* Simple Tabs */}
        <div className="max-w-6xl mx-auto px-6 border-b">
          <nav className="flex gap-8 text-sm">
            {['Overview', 'Timeline', 'Notes', 'Emails', 'Details'].map(tab => (
              <a
                key={tab}
                href={`#${tab.toLowerCase()}`}
                className="py-4 border-b-2 border-transparent hover:border-gray-300 data-[active=true]:border-blue-600 data-[active=true]:text-blue-600 font-medium"
                data-active={tab === 'Timeline'}
              >
                {tab}
              </a>
            ))}
          </nav>
        </div>
      </div>

      <div className="max-w-6xl mx-auto p-6 space-y-8">
        {/* Overview */}
        <section id="overview" className="grid md:grid-cols-3 gap-6">
          <div className="md:col-span-2 bg-white p-6 rounded-xl border">
            <h2 className="font-semibold mb-4">Contact Information</h2>
            <div className="space-y-3 text-sm">
              <p><strong>Email:</strong> <a href={`mailto:${candidateData.email}`} className="text-blue-600 hover:underline">{candidateData.email}</a></p>
              {candidateData.phone && <p><strong>Phone:</strong> {candidateData.phone}</p>}
              {candidateData.linkedin && <p><strong>LinkedIn:</strong> <a href={candidateData.linkedin} target="_blank" className="text-blue-600 hover:underline">View Profile</a></p>}
              {candidateData.resumeUrl && <p><strong>Resume:</strong> <a href={candidateData.resumeUrl} target="_blank" className="text-blue-600 hover:underline">Download</a></p>}
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl border">
            <Badge className="mb-4 capitalize">{candidateData.status}</Badge>
            <div className="text-sm space-y-2">
              <p><strong>Source:</strong> {candidateData.source || 'Unknown'}</p>
              <p><strong>Added:</strong> {new Date(candidateData.createdAt).toLocaleDateString()}</p>
            </div>
          </div>
        </section>

        {/* Timeline */}
        <section id="timeline">
          <EventTimeline candidateId={candidateData.id} />
        </section>

        {/* Placeholder tabs */}
        <section id="notes" className="bg-white p-6 rounded-xl border">
          <h2 className="font-semibold mb-4">Notes</h2>
          <p className="text-gray-500">Notes will appear here (already stored in events table).</p>
        </section>

        <section id="emails" className="bg-white p-6 rounded-xl border">
          <h2 className="font-semibold mb-4">Email History</h2>
          <p className="text-gray-500">Coming soon...</p>
        </section>

        <section id="details" className="bg-white p-6 rounded-xl border">
          <h2 className="font-semibold mb-4">Raw Data</h2>
          <pre className="text-xs bg-gray-100 p-4 rounded overflow-auto">{JSON.stringify(candidateData, null, 2)}</pre>
        </section>
      </div>
    </div>
  );
}
