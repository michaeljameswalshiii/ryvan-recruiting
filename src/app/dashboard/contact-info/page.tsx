import Link from 'next/link';

export default async function ContactInfoPage() {
  let contacts: any[] = [];

  try {
    // TODO: Replace this with your ORIGINAL working fetch logic
    // Example of what it probably looked like before:
    // const companies = await clientRepository.getCompanies(); // or getAllClients(), etc.
    // contacts = companies.flatMap((company: any) =>
    //   (company.contacts || []).map((contact: any) => ({
    //     ...contact,
    //     company: { id: company.id, name: company.name || company.companyName }
    //   }))
    // );

    console.log("Contacts loaded:", contacts.length);
  } catch (error) {
    console.error("Failed to load contacts:", error);
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-10">
        <h1 className="text-4xl font-bold tracking-tight">Contact Info</h1>
        <p className="text-lg text-muted-foreground">{contacts.length} contacts</p>
      </div>

      {contacts.length === 0 ? (
        <div className="text-center py-20 border rounded-3xl bg-card">
          <p className="text-muted-foreground text-xl">No contacts loaded yet.</p>
          <p className="text-sm mt-2">Check the server console for details.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {contacts.map((contact: any) => (
            <div
              key={contact.id}
              className="group bg-card border rounded-3xl overflow-hidden hover:shadow-lg transition-all duration-200"
            >
              <Link
                href={`/dashboard/contact-info/${contact.id}`}
                className="block p-8 hover:bg-muted/50 transition-colors"
              >
                <h3 className="text-2xl font-semibold group-hover:text-primary transition-colors">
                  {contact.name}
                </h3>
                <p className="text-muted-foreground mt-1">{contact.title}</p>

                <div className="mt-8 space-y-4 text-sm">
                  <div className="flex gap-3">
                    <span className="text-muted-foreground w-16">Email</span>
                    <span className="font-medium">{contact.email}</span>
                  </div>
                  <div className="flex gap-3">
                    <span className="text-muted-foreground w-16">Phone</span>
                    <span className="font-medium">{contact.phone || '—'}</span>
                  </div>
                  <div className="flex gap-3">
                    <span className="text-muted-foreground w-16">Company</span>
                    <span className="font-medium">{contact.company?.name || contact.company}</span>
                  </div>
                </div>
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
