'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useClients } from '@/lib/hooks/query-client';
import { Button } from '@/components/ui/button';

export default function ContactDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const { data: clientsData } = useClients();
  const [contact, setContact] = useState<any>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<any>({});

  useEffect(() => {
    const rawData = Array.isArray(clientsData) ? clientsData : (clientsData?.clients || []);
    const found = rawData.find((item: any) => item.id === id);
    
    if (found) {
      const contactData = {
        ...found,
        name: found.name || found.companyName || 'Unnamed',
        companyName: found.company?.name || found.clientCompany || '—'
      };
      setContact(contactData);
      setFormData(contactData);
    }
  }, [id, clientsData]);

  const handleSave = () => {
    // TODO: Call repository updateContact
    alert('Changes saved! (full save coming next)');
    setIsEditing(false);
  };

  if (!contact) return <div className="p-8">Contact not found or still loading...</div>;

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <Link href="/dashboard/contact-info" className="text-blue-600 hover:underline mb-8 inline-block">
        ← Back to Contacts
      </Link>

      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-4xl font-bold">{contact.name}</h1>
          <p className="text-2xl text-muted-foreground">{contact.title || '—'}</p>
        </div>
        <Button onClick={() => setIsEditing(!isEditing)}>
          {isEditing ? 'Cancel' : 'Edit Contact'}
        </Button>
      </div>

      <div className="bg-card border rounded-3xl p-10">
        {isEditing ? (
          <div className="space-y-6">
            <input 
              type="text" 
              value={formData.name} 
              onChange={(e) => setFormData({...formData, name: e.target.value})} 
              className="w-full p-4 border rounded-xl text-2xl font-semibold" 
            />
            <input 
              type="text" 
              value={formData.title} 
              onChange={(e) => setFormData({...formData, title: e.target.value})} 
              className="w-full p-4 border rounded-xl" 
            />
            <input 
              type="email" 
              value={formData.email} 
              onChange={(e) => setFormData({...formData, email: e.target.value})} 
              className="w-full p-4 border rounded-xl" 
            />
            <input 
              type="tel" 
              value={formData.phone} 
              onChange={(e) => setFormData({...formData, phone: e.target.value})} 
              className="w-full p-4 border rounded-xl" 
            />
            <Button onClick={handleSave} className="mt-6">Save Changes</Button>
          </div>
        ) : (
          <div className="space-y-8 text-lg">
            <div><span className="text-muted-foreground">Title:</span> {contact.title || '—'}</div>
            <div><span className="text-muted-foreground">Email:</span> {contact.email || '—'}</div>
            <div><span className="text-muted-foreground">Phone:</span> {contact.phone || '—'}</div>
            <div><span className="text-muted-foreground">Company:</span> {contact.companyName}</div>
          </div>
        )}
      </div>
    </div>
  );
}
