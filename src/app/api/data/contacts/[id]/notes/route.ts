import { NextRequest, NextResponse } from 'next/server';
import { addNoteToContact } from '@/lib/db/repositories/contact-repository';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id: contactId } = params;
    const { type, content, createdBy = 'system' } = await request.json();

    if (!type || !content) {
      return NextResponse.json({ error: 'Type and content are required' }, { status: 400 });
    }

    const newNote = {
      id: `note_${Date.now()}`,
      type,
      content,
      createdAt: new Date().toISOString(),
      createdBy,
    };

    await addNoteToContact(contactId, newNote);

    return NextResponse.json({ 
      success: true, 
      note: newNote 
    });

  } catch (error: any) {
    console.error('Error logging contact activity:', error);
    return NextResponse.json({ 
      error: error.message || 'Failed to log activity' 
    }, { status: 500 });
  }
}
