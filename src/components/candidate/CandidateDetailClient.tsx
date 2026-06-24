'use client';

import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { ArrowLeft, Mail, MapPin } from "lucide-react";
import { useRouter } from "next/navigation";

interface CandidateDetailClientProps {
  candidate: any;
}

export default function CandidateDetailClient({ candidate }: CandidateDetailClientProps) {
  const router = useRouter();

  return (
    <div className="max-w-7xl mx-auto p-6 bg-gray-50 min-h-screen">
      <div className="flex items-start justify-between mb-10">
        <div className="flex items-center gap-5">
          <Button variant="ghost" onClick={() => router.back()} className="text-lg">
            ← Back to Candidates
          </Button>

          <div className="flex items-center gap-5">
            <div className="w-20 h-20 bg-blue-600 rounded-2xl flex items-center justify-center text-white text-4xl font-bold">
              {candidate.name?.split(" ").map((n: string) => n[0]).join("") || "MG"}
            </div>
            <div>
              <h1 className="text-4xl font-semibold">{candidate.name}</h1>
              <p className="text-2xl text-gray-600">{candidate.title}</p>
              <p className="text-gray-500">{candidate.email}</p>
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <Button variant="outline">Edit</Button>
          <Button>Send Email</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-7 space-y-8">
          <Card>
            <CardHeader><CardTitle>Contact Information</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-6">
              <div><strong>Phone:</strong> {candidate.phone}</div>
              <div><strong>Location:</strong> {candidate.location || "Orlando, FL"}</div>
              <div><strong>Title:</strong> {candidate.title}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Pipeline Stage</CardTitle></CardHeader>
            <CardContent>
              <p className="text-lg">Interviewing — Pre-Construction Mgr / Estimator</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Notes & Activity Log</CardTitle></CardHeader>
            <CardContent>
              <p className="text-gray-500">Activity timeline will appear here (temporarily disabled for stability)</p>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-5">
          <Card className="sticky top-6">
            <CardHeader><CardTitle>Resume</CardTitle></CardHeader>
            <CardContent>
              <p className="text-gray-500">Resume viewer temporarily disabled for debugging</p>
              {/* ResumeViewer will be re-added once base page works */}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
