import ContactDetailClient from '@/components/contact/ContactDetailClient';
import { contactRepository } from '@/lib/db/repositories/contact-repository';

interface Props {
  params: Promise<{ contactId: string }>;
}

export default async function ContactDetailPage({ params }: Props) {
  const { contactId } = await params;

  let contact = null;

  try {
    contact = await contactRepository.getContact(contactId);
  } catch (error) {
    console.error('Error fetching contact:', error);
  }

  if (!contact) {
    return (
      <div className="p-8 text-center">
        <h1 className="text-2xl font-semibold">Contact Not Found</h1>
        <p className="text-gray-500 mt-2">The contact you are looking for does not exist.</p>
      </div>
    );
  }

  return <ContactDetailClient contact={contact} />;
}
