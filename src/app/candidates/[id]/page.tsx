"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Mail, Phone, MapPin, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function CandidateDetailPage() {
  const params = useParams();
  const router = useRouter();
  const candidateId = params.id as string;

  const [candidate, setCandidate] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Replace this with your actual data fetching logic
    // For now using placeholder
    setCandidate({
      id: candidateId,
      name: "Sample Candidate",
      title: "Software Engineer",
      email: "candidate@example.com",
      phone: "(555) 123-4567",
      location: "New York, NY",
      status: "conversation",
      created_at: "2026-05-20",
    });
    setLoading(false);
  }, [candidateId]);

  if (loading) return <div className="p-8">Loading candidate...</div>;

  return (
    <div className="p-8 overflow-auto h-full">
      <div className="max-w-5xl mx-auto">
        {/* Back Button */}
        <Button variant="ghost" onClick={() => router.back()} className="mb-6">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Candidates
        </Button>

        <div className="flex justify-between items-start mb-8">
          <div>
            <h1 className="text-4xl font-bold">{candidate.name}</h1>
            <p className="text-xl text-muted-foreground">{candidate.title}</p>
          </div>
          <Badge variant="outline" className="text-lg px-4 py-2">
            {candidate.status}
          </Badge>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Info */}
          <div className="lg:col-span-2 space-y-8">
            <Card>
              <CardHeader>
                <CardTitle>Contact Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-3">
                  <Mail className="text-muted-foreground" />
                  <a href={`mailto:${candidate.email}`} className="hover:underline">
                    {candidate.email}
                  </a>
                </div>
                <div className="flex items-center gap-3">
                  <Phone className="text-muted-foreground" />
                  <span>{candidate.phone}</span>
                </div>
                <div className="flex items-center gap-3">
                  <MapPin className="text-muted-foreground" />
                  <span>{candidate.location}</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar Info */}
          <div>
            <Card>
              <CardHeader>
                <CardTitle>Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm text-muted-foreground">Added</p>
                  <p>{candidate.created_at}</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
