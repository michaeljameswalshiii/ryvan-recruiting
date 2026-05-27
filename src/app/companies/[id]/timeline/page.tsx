import CompanyTimeline from '@/components/company-timeline';

interface Props {
  params: { id: string };
}

export default async function CompanyTimelinePage({ params }: Props) {
  const companyId = params.id;

  return (
    <div className="max-w-4xl mx-auto p-6">
      <CompanyTimeline companyId={companyId} />
    </div>
  );
}
