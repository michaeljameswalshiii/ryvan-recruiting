import { NextRequest, NextResponse } from 'next/server';
import { addNoteToContact } from '@/lib/db/repositories/contact-repository';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id: contactId } = params;
    const body = await request.json();

    const { type, content, createdBy = 'current-user' } = body;

    if (!type || !content) {
      return NextResponse.json({ error: 'Type and content are required' }, { status: 400 });
    }

    await addNoteToContact(contactId, { type, content, createdBy });

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error('Error logging contact activity:', error);
    return NextResponse.json({ 
      error: error.message || 'Failed to log activity' 
    }, { status: 500 });
  }
}
