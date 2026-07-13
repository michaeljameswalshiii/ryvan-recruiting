import { NextRequest, NextResponse } from 'next/server';
import { addNoteToJob } from '@/lib/events/job-events';
import { revalidatePath } from 'next/cache';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: jobId } = await params;

    if (!jobId) {
      return NextResponse.json({ error: 'Job ID is required' }, { status: 400 });
    }

    const body = await request.json();
    const { noteText, noteType = 'general', createdBy = 'system' } = body;

    if (!noteText || noteText.trim() === '') {
      return NextResponse.json({ error: 'Note text is required' }, { status: 400 });
    }

    const result = await addNoteToJob(jobId, noteText.trim(), createdBy, noteType);

    if (!result.success) {
      return NextResponse.json({ error: result.error || 'Failed to add note' }, { status: 400 });
    }

    revalidatePath(`/dashboard/jobs/${jobId}`);

    return NextResponse.json({ success: true, eventId: result.eventId });
  } catch (error) {
    console.error('[API] Failed to add job note:', error);
    return NextResponse.json({ error: 'Failed to add note' }, { status: 500 });
  }
}
