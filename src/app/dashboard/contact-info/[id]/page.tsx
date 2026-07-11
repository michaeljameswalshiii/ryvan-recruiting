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
  const [activeTab, setActiveTab] = useState('overview');
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<any>({});

  useEffect(() => {
    const rawData = Array.isArray(clientsData) ? clientsData : (clientsData?.clients || []);
    const found = rawData.find((item: any) => String(item.id) === String(id));
    
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
    alert('Changes saved!');
    setIsEditing(false);
  };

  if (!contact) return <div className="p-8">Contact not found...</div>;

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <Link href="/dashboard/contact-info" className="text-blue-600 hover:underline mb-8 inline-block">
        ← Back to Contacts
      </Link>

      {/* Header */}
      <div className="flex items-start gap-6 mb-10">
        <div className="w-24 h-24 bg-green-600 text-white rounded-full flex items-center justify-center text-5xl font-bold">
          {contact.name?.[0] || '?'}
        </div>
        <div className="flex-1 pt-2">
          <div className="flex items-center gap-3">
            <h1 className="text-5xl font-bold">{contact.name}</h1>
            <span className="bg-green-100 text-green-700 px-4 py-1 rounded-full text-sm">Primary</span>
          </div>
          <p className="text-2xl text-muted-foreground mt-1">{contact.title} • {contact.companyName}</p>
        </div>
        <div className="flex gap-3 pt-4">
          <Button>Call</Button>
          <Button variant="outline" onClick={() => setIsEditing(!isEditing)}>Edit</Button>
          <Button>Send Email</Button>
        </div>
      </div>

      {/* Contact Bar */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 bg-card border rounded-2xl p-8 mb-12">
        <div>
          <p className="text-xs text-muted-foreground">EMAIL</p>
          <p className="font-medium break-all">{contact.email || '—'}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">PHONE</p>
          <p className="font-medium">{contact.phone || '—'}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">LINKEDIN</p>
          <a href="#" className="text-blue-600 hover:underline">View Profile</a>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b mb-10">
        <div className="flex gap-10 text-lg">
          <button 
            onClick={() => setActiveTab('overview')}
            className={`pb-4 border-b-2 font-medium ${activeTab === 'overview' ? 'border-blue-600 text-blue-600' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
          >
            Overview
          </button>
          <button 
            onClick={() => setActiveTab('timeline')}
            className={`pb-4 border-b-2 font-medium ${activeTab === 'timeline' ? 'border-blue-600 text-blue-600' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
          >
            Timeline
          </button>
          <button 
            onClick={() => setActiveTab('jobs')}
            className={`pb-4 border-b-2 font-medium ${activeTab === 'jobs' ? 'border-blue-600 text-blue-600' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
          >
            Open Jobs
          </button>
          <button 
            onClick={() => setActiveTab('company')}
            className={`pb-4 border-b-2 font-medium ${activeTab === 'company' ? 'border-blue-600 text-blue-600' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
          >
            Company
          </button>
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 bg-card border rounded-3xl p-8">
            <h3 className="font-semibold mb-6">Activity & Notes</h3>
            <p className="text-muted-foreground">Activity log coming soon...</p>
          </div>
          <div className="bg-card border rounded-3xl p-8">
            <h3 className="font-semibold mb-6">Quick Stats</h3>
            <div className="space-y-4 text-sm">
              <div className="flex justify-between"><span>Last contacted</span><span>Jun 8, 2026</span></div>
              <div className="flex justify-between"><span>Candidates submitted</span><span>3</span></div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'timeline' && <div className="bg-card border rounded-3xl p-8 text-muted-foreground">Timeline coming soon...</div>}
      {activeTab === 'jobs' && <div className="bg-card border rounded-3xl p-8 text-muted-foreground">Open Jobs for {contact.companyName} coming soon...</div>}
      {activeTab === 'company' && <div className="bg-card border rounded-3xl p-8 text-muted-foreground">Company details coming soon...</div>}

      {/* Edit Modal */}
      {isEditing && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-3xl p-10 w-full max-w-md">
            <h3 className="text-2xl font-semibold mb-8">Edit Contact</h3>
            <input type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full p-4 border rounded-xl mb-4" />
            <input type="text" value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} className="w-full p-4 border rounded-xl mb-4" />
            <input type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full p-4 border rounded-xl mb-4" />
            <input type="tel" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} className="w-full p-4 border rounded-xl mb-4" />
            <Button onClick={handleSave} className="w-full mt-6">Save Changes</Button>
            <Button variant="outline" onClick={() => setIsEditing(false)} className="w-full mt-3">Cancel</Button>
          </div>
        </div>
      )}
    </div>
  );
}
