/**
 * Candidate Import API
 * Exposes the importResultAsCandidate function to client-side components
 * 
 * @serverOnly
 */

import { NextRequest, NextResponse } from 'next/server';
import { importResultAsCandidate, AIRawResult } from '@/lib/candidates/import';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    const { rawResult, source, searchQuery } = body as {
      rawResult: AIRawResult;
      source?: string;
      searchQuery?: string;
    };
    
    if (!rawResult) {
      return NextResponse.json(
        { error: 'Missing rawResult' },
        { status: 400 }
      );
    }
    
    // Validate required fields
    const name = rawResult.name || rawResult.first_name || rawResult.last_name;
    if (!name) {
      return NextResponse.json(
        { error: 'Candidate name is required' },
        { status: 400 }
      );
    }
    
    const result = await importResultAsCandidate(
      rawResult,
      source || 'apollo',
      searchQuery
    );
    
    return NextResponse.json(result);
  } catch (error) {
    console.error('[IMPORT_API] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Import failed', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
