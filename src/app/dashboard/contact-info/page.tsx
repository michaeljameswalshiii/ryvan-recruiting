'use client';

import Link from 'next/link';
import { useClients } from '@/lib/hooks/query-client';
import { Button } from '@/components/ui/button';
import { addContactToClient } from '@/lib/db/repositories/client-repository';

export default function ContactInfoPage() {
  const { data: clientsData, isLoading, error, refetch } = useClients();

  const clients = Array.isArray(clientsData) ? clientsData : (clientsData?.clients || []);

  const contacts = clients.flatMap((company: any) =>
    Array.isArray(company?.contacts) 
      ? company.contacts.map((contact: any) => ({
          ...contact,
          companyName: company.name || company.companyName || 'Unknown'
        }))
      : []
  );

  const addTestContact = async () => {
    if (clients.length === 0) {
      alert('No companies found to add contact to');
      return;
    }
    const company = clients[0];
    const testContact = {
      name: `Test Contact ${Date.now().toString().slice(-4)}`,
      title: "Recruiter",
      email: `test${Date.now().toString().slice(-4)}@example.com`,
      phone: "(555) 123-4567"
    };
    try {
      await addContactToClient(company.tenant_id || 'default', company.id, testContact);
      alert('Test contact added successfully!');
      refetch();
    } catch (err) {
      console.error(err);
      alert('Failed to add test contact');
    }
  };

  if (isLoading) return <div className="p-8">Loading...</div>;
  if (error) return <div className="p-8 text-red-600">Error. <Button onClick={() => refetch()}>Retry</Button></div>;

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-4xl font-bold">Contact Info</h1>
        <div className="flex gap-3">
          <Button onClick={addTestContact} variant="outline">Add Test Contact</Button>
          <Button onClick={() => refetch()}>Refresh</Button>
        </div>
      </div>

      <p className="mb-6">Total Contacts: {contacts.length}</p>

      {contacts.length === 0 ? (
        <div className="text-center py-20 bg-card border rounded-3xl">
          <p className="text-xl">No contacts yet.</p>
          <p className="mt-4">Click "Add Test Contact" to create one.</p>
        </div>
      ) : (
        <div className="bg-card border rounded-2xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left p-6 font-semibold">Name</th>
                <th className="text-left p-6 font-semibold">Title</th>
                <th className="text-left p-6 font-semibold">Email</th>
                <th className="text-left p-6 font-semibold">Phone</th>
                <th className="text-left p-6 font-semibold">Company</th>
                <th className="p-6 w-24"></th>
              </tr>
            </thead>
            <tbody>
              {contacts.map((contact: any) => (
                <tr key={contact.id} className="border-b hover:bg-muted/50">
                  <td className="p-6 font-medium">
                    <Link href={`/dashboard/contact-info/${contact.id}`} className="hover:underline">
                      {contact.name}
                    </Link>
                  </td>
                  <td className="p-6 text-muted-foreground">{contact.title}</td>
                  <td className="p-6 text-muted-foreground">{contact.email}</td>
                  <td className="p-6 text-muted-foreground">{contact.phone || '—'}</td>
                  <td className="p-6 text-muted-foreground">{contact.companyName}</td>
                  <td className="p-6">
                    <Link href={`/dashboard/contact-info/${contact.id}`} className="text-blue-600 hover:underline">View</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
