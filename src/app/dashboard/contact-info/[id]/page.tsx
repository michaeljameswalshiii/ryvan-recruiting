'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Mail, Phone, MapPin, Linkedin, Calendar } from 'lucide-react';

export default function ContactDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [contact, setContact] = useState<any>(null);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    // Placeholder data - replace with real fetch
    setContact({
      id,
      name: "Paul Kiedis",
      title: "Director of Operations",
      company: "Chick-fil-A — West Boca",
      email: "paul@cfawestboca.com",
      phone: "561-555-0192",
      location: "Boca Raton, FL",
      linkedin: "linkedin.com/in/paulkiedis",
      source: "Manual",
      addedDate: "Jun 4, 2026"
    });
  }, [id]);

  if (!contact) return <div className="p-8">Loading contact...</div>;

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <Link href="/dashboard/contact-info" className="text-blue-600 hover:underline mb-6 inline-block">
        ← Back to Contacts
      </Link>

      {/* Header */}
      <div className="flex items-start gap-6 mb-10">
        <div className="w-20 h-20 bg-green-600 text-white rounded-full flex items-center justify-center text-4xl font-bold">
          PK
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-4xl font-bold">{contact.name}</h1>
            <span className="bg-green-100 text-green-700 text-sm px-3 py-1 rounded-full">Primary</span>
          </div>
          <p className="text-xl text-muted-foreground">{contact.title} • {contact.company}</p>
        </div>
        <div className="flex gap-3">
          <Button>Call</Button>
          <Button variant="outline">Edit</Button>
          <Button>Send Email</Button>
        </div>
      </div>

      {/* Contact Info Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-10 bg-card border rounded-2xl p-6">
        <div>
          <p className="text-sm text-muted-foreground">EMAIL</p>
          <p className="font-medium">{contact.email}</p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">PHONE</p>
          <p className="font-medium">{contact.phone}</p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">LOCATION</p>
          <p className="font-medium">{contact.location}</p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">LINKEDIN</p>
          <a href={`https://${contact.linkedin}`} target="_blank" className="text-blue-600 hover:underline">View Profile</a>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b mb-8">
        <div className="flex gap-8">
          {['Overview', 'Timeline', 'Open Jobs', 'Company'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab.toLowerCase())}
              className={`pb-4 border-b-2 font-medium ${activeTab === tab.toLowerCase() ? 'border-blue-600 text-blue-600' : 'border-transparent'}`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Overview Tab Content */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Activity & Notes */}
          <div className="lg:col-span-2 bg-card border rounded-2xl p-8">
            <h3 className="font-semibold mb-6">Activity & Notes</h3>
            <div className="space-y-6">
              {/* Example activity items - replace with real data later */}
              <div className="flex gap-4">
                <div className="text-sm text-muted-foreground w-24">Jun 8, 2026</div>
                <div>
                  <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded text-xs">Submittal</span>
                  <p className="mt-1">Submitted Jessica Lane for Asst. Director role...</p>
                </div>
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-8">
            {/* Open Jobs */}
            <div className="bg-card border rounded-2xl p-8">
              <div className="flex justify-between mb-6">
                <h3 className="font-semibold">Open Jobs</h3>
                <Button size="sm">+ Add Job</Button>
              </div>
              <div className="text-sm text-muted-foreground">No open jobs yet.</div>
            </div>

            {/* Quick Stats */}
            <div className="bg-card border rounded-2xl p-8">
              <h3 className="font-semibold mb-6">Quick Stats</h3>
              <div className="space-y-4 text-sm">
                <div className="flex justify-between"><span>Open jobs</span><span>2</span></div>
                <div className="flex justify-between"><span>Candidates submitted</span><span>3</span></div>
                <div className="flex justify-between"><span>Last contacted</span><span>Jun 8, 2026</span></div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add more tabs later */}
    </div>
  );
}
