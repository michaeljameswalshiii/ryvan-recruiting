import { notFound } from 'next/navigation';
import Link from 'next/link';
import { clientRepository } from '@/lib/db/repositories/client-repository';
import ContactEditForm from './ContactEditForm';

export default async function ContactDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const contact = await clientRepository.getContactById(id);

  if (!contact) {
    notFound();
  }

  return (
    <div className="max-w-4xl mx-auto p-8">
      <Link
        href="/dashboard/contact-info"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-8"
      >
        ← Back to Contacts
      </Link>

      <div className="mb-8">
        <h1 className="text-4xl font-bold">{contact.name}</h1>
        <p className="text-2xl text-muted-foreground">{contact.title}</p>
      </div>

      <div className="bg-card border rounded-3xl p-10">
        <ContactEditForm contact={contact} />
      </div>
    </div>
  );
}
