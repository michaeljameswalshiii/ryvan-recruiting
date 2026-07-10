import Link from 'next/link';
import { clientRepository } from '@/lib/db/repositories/client-repository';

export default async function ContactInfoPage() {
  const contacts = await clientRepository.getAllContacts(); // assuming this exists from previous work

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-4xl font-bold">Contact Info</h1>
        <p className="text-muted-foreground">Showing {contacts.length} contacts</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {contacts.map((contact: any) => (
          <div
            key={contact.id}
            className="group bg-card border rounded-2xl overflow-hidden hover:shadow-md transition-all duration-200"
          >
            <Link
              href={`/dashboard/contact-info/${contact.id}`}
              className="block p-6 hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-2xl font-semibold group-hover:text-primary transition-colors">
                    {contact.name}
                  </h3>
                  <p className="text-muted-foreground mt-1">{contact.title}</p>
                </div>
              </div>

              <div className="mt-6 space-y-3 text-sm">
                <div className="flex items-center gap-3">
                  <span className="text-muted-foreground w-12">Email</span>
                  <span className="font-medium truncate">{contact.email}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-muted-foreground w-12">Phone</span>
                  <span className="font-medium">{contact.phone || '—'}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-muted-foreground w-12">Company</span>
                  <span className="font-medium">{contact.company?.name || contact.company}</span>
                </div>
              </div>
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}
