import { notFound } from 'next/navigation';
import CompanyTimeline from '@/components/company-timeline';

interface Props {
  params: { id: string };
}

export default async function CompanyPage({ params }: Props) {
  const companyId = params.id;

  // TODO: Fetch company data here
  // const company = await getCompany(companyId);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center text-xl font-semibold">
              TM
            </div>
            <div>
              <h1 className="text-2xl font-semibold">Tom Melba</h1>
              <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm">conversation</span>
            </div>
          </div>
          <button className="px-5 py-2 bg-blue-600 text-white rounded-lg flex items-center gap-2">
            <span>✉️</span> Send Email
          </button>
        </div>

        {/* Tabs */}
        <div className="max-w-5xl mx-auto px-6">
          <nav className="flex gap-8 border-b">
            {['Overview', 'Timeline', 'Notes', 'Emails', 'Details'].map((tab) => (
              <a
                key={tab}
                href={tab === 'Timeline' ? `/companies/${companyId}/timeline` : '#'}
                className={`py-4 px-1 border-b-2 font-medium ${
                  tab === 'Timeline' 
                    ? 'border-blue-600 text-blue-600' 
                    : 'border-transparent hover:text-gray-600'
                }`}
              >
                {tab}
              </a>
            ))}
          </nav>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-5xl mx-auto p-6">
        {/* For now, show timeline directly on main page too */}
        <CompanyTimeline companyId={companyId} />
      </div>
    </div>
  );
}
