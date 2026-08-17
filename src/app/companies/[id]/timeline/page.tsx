import CompanyTimeline from '@/components/company-timeline';
import { BackToDashboard } from '@/components/ui/BackToDashboard';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function CompanyTimelinePage({ params }: Props) {
  const { id: companyId } = await params;

  return (
    <div className="max-w-4xl mx-auto p-6">
      <BackToDashboard label="Back to Timeline" />
      <CompanyTimeline companyId={companyId} />
    </div>
  );
}
