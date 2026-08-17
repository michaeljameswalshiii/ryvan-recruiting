// src/app/api/jobs/[id]/notes/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { addNoteToJob, getJobEvents } from '@/lib/events/job-events';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: jobId } = await params;
  console.log(`[Job Notes API] POST for job ${jobId}`);

  try {
    const body = await request.json();
    const { noteText, noteType, createdBy = 'system' } = body;

    // Detail text optional
    const text = typeof noteText === 'string' ? noteText.trim() : '';
    const result = await addNoteToJob(jobId, text, createdBy, noteType);

    console.log(`[Job Notes API] Note added successfully:`, result);

    // Return fresh events
    const events = await getJobEvents(jobId, { limit: 20 });

    return NextResponse.json({ 
      success: true, 
      recordResult: result, 
      events: events.events 
    });
  } catch (error: any) {
    console.error(`[Job Notes API] Failed to add job note:`, error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
