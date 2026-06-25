'use client';

import { useState, useMemo } from "react";
import Link from "next/link";
import { Plus, Users, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { useClients } from "@/lib/hooks/query-client";

export default function ContactsPage() {
  const [searchQuery, setSearchQuery] = useState("");

  const { data: clients = [], isLoading, error, refetch } = useClients();

  const filteredClients = useMemo(() => {
    return clients.filter((client: any) =>
      client.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      client.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (client.company || client.name || '').toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [clients, searchQuery]);

  if (isLoading) {
    return <div className="p-12 text-center">Loading contacts...</div>;
  }

if (error) {
    // Check for credential-related errors
    const isCredentialError = error.message?.includes(' credential') || 
                        error.message?.includes('DynamoDB') ||
                        error.message?.includes('AWS') ||
                        error.message?.includes('table') ||
                        error.message?.includes('NotFoundException') ||
                        error.message?.includes('Missing');
    
    return (
      <div className="p-12 text-center space-y-6">
        <p className="text-red-600 text-lg">
          {isCredentialError ? 'Credential is missing or table not set up' : `Failed to load contacts: ${error.message}`}
        </p>
        {isCredentialError && (
          <div className="text-sm text-gray-500 max-w-md mx-auto">
            <p className="mb-4">This is usually due to missing AWS credentials or DynamoDB table configuration on Vercel.</p>
            <p className="mb-2">Check Vercel Environment Variables for:</p>
            <ul className="list-disc list-inside text-left bg-gray-100 p-4 rounded-lg">
              <li>AWS_ACCESS_KEY_ID</li>
              <li>AWS_SECRET_ACCESS_KEY</li>
              <li>AWS_REGION</li>
              <li>DYNAMODB_*_TABLE</li>
            </ul>
          </div>
        )}
        <Button onClick={() => refetch()} variant="outline">
          <RefreshCw className="mr-2 h-4 w-4" /> Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Users className="h-8 w-8" /> Contacts
          </h1>
          <p className="text-muted-foreground">Manage your client contacts</p>
        </div>
        <Button asChild>
          <Link href="/dashboard/contacts/new">
            <Plus className="h-4 w-4 mr-2" /> New Contact
          </Link>
        </Button>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search contacts..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

{filteredClients.length === 0 ? (
        <div className="p-12 text-center text-gray-500 border rounded-2xl bg-muted/30">
          {clients.length === 0 ? (
            <>
              <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-xl font-medium">No contacts yet</h3>
              <p className="mt-2 text-sm">Add your first contact to get started</p>
            </>
          ) : (
            <>
              <Search className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-xl font-medium">No contacts found</h3>
              <p className="mt-2 text-sm">No contacts match your search "{searchQuery}"</p>
            </>
          )}
        </div>
      ) : (
        <div className="grid gap-4">
          {filteredClients.map((client: any) => (
            <Card key={client.id}>
              <CardContent className="p-6">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-semibold text-lg">{client.name}</h3>
                    {client.title && <p className="text-sm text-muted-foreground">{client.title}</p>}
                    {client.email && <p className="text-sm">{client.email}</p>}
                    {client.company && <p className="text-sm text-muted-foreground">at {client.company}</p>}
                  </div>
                  <Link 
                    href={`/dashboard/contacts/${client.id}`} 
                    className="text-blue-600 hover:underline text-sm font-medium"
                  >
                    View Detail →
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
