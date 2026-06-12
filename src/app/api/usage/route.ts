/**
 * Usage Logging API Route
 * Called from client to log AI usage after each call
 * 
 * @serverOnly
 */

import { NextRequest, NextResponse } from 'next/server';
import { logBedrockUsage } from '@/lib/aws/athena-bedrock';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    const { 
      modelId, 
      inputTokens, 
      outputTokens, 
      queryPreview, 
      toolsUsed = [],
      latencyMs = 0,
      service = 'bedrock',  // 'bedrock' or 'apollo'
      resultsCount = 0,
      estimatedCost = 0,
    } = body;
    
    // Handle Apollo service (no tokens, just results)
    if (service === 'apollo') {
      await logBedrockUsage({
        modelId: modelId || 'apollo-people-search',
        inputTokens: 0,
        outputTokens: resultsCount * 100,  // Estimate tokens
        queryPreview: queryPreview || '',
        toolsUsed: ['apollo'],
        latencyMs: latencyMs || 0,
      });
      return NextResponse.json({ success: true, service: 'apollo', resultsCount });
    }
    
    // Bedrock requires tokens
    if (!modelId || (!inputTokens && inputTokens !== 0)) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }
    
    await logBedrockUsage({
      modelId,
      inputTokens,
      outputTokens: outputTokens || 0,
      queryPreview: queryPreview || '',
      toolsUsed,
      latencyMs,
    });
    
    return NextResponse.json({ success: true, service: 'bedrock' });
  } catch (error) {
    console.error('[USAGE] API error:', error);
    return NextResponse.json(
      { error: 'Failed to log usage' },
      { status: 500 }
    );
  }
}
