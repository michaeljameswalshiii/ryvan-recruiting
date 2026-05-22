import { NextRequest, NextResponse } from 'next/server';
import mammoth from 'mammoth';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';

// Initialize Bedrock client (adjust region if needed)
const bedrock = new BedrockRuntimeClient({ region: 'us-east-1' });

/**
 * Extract text from PDF using dynamic import (pdfjs-dist is already in the project)
 */
async function extractPdfText(buffer: Buffer): Promise<string> {
  const pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
  
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const textParts: string[] = [];
  
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item: any) => item.str)
      .join(' ');
    textParts.push(pageText);
  }
  
  return textParts.join('\n\n');
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('resume') as File;

    if (!file) {
      return NextResponse.json({ error: 'No resume file uploaded' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const fileName = file.name.toLowerCase();

    // Step 1: Extract raw text
    let rawText = '';
    if (fileName.endsWith('.pdf')) {
      rawText = await extractPdfText(buffer);
    } else if (fileName.endsWith('.docx')) {
      const result = await mammoth.extractRawText({ buffer });
      rawText = result.value;
    } else {
      return NextResponse.json({ error: 'Unsupported file type. Only PDF and DOCX allowed.' }, { status: 400 });
    }

    // Step 2: Aggressive cleaning
    let cleanText = rawText
      .replace(/^\uFEFF/, '') // Remove BOM
      .replace(/mediaimage[\s\S]*?screenshot\.jpeg["']?\s*}/gi, '') // Remove image artifacts
      .replace(/JAMIE MOHN \| PAGE \d+/gi, '') // Remove page headers
      .replace(/\r\n?/g, '\n')
      .replace(/\n\s*\n\s*\n/g, '\n\n') // Normalize whitespace
      .trim();

    // Step 3: Strong regex pre-extraction (hints for LLM)
    const phoneMatch = cleanText.match(/\(\d{3}\)\s*\d{3}[-.\s]?\d{4}|\d{3}[-.\s]?\d{3}[-.\s]?\d{4}/);
    const emailMatch = cleanText.match(/[\w.%+-]+@[\w.-]+\.[a-zA-Z]{2,}/i);
    const nameMatch = cleanText.match(/^[A-Z][A-Z\s.,'-]{3,}(?=\s*(?:\n|$))/m);
    const locationMatch = cleanText.match(/^[A-Za-z\s]+,\s*[A-Z]{2}/m);
    const linkedinMatch = cleanText.match(/linkedin\.com\/in\/[\w-]+/i);

    const hints = {
      name: nameMatch ? nameMatch[0].trim() : '',
      phone: phoneMatch ? phoneMatch[0] : '',
      email: emailMatch ? emailMatch[0] : '',
      location: locationMatch ? locationMatch[0] : '',
      linkedin: linkedinMatch ? `https://${linkedinMatch[0]}` : '',
    };

    // Step 4: Strong MiniMax-M2.7 prompt
    const systemPrompt = `You are an expert resume parser. Extract structured information from potentially noisy resume text.

Rules:
- Ignore garbage like "mediaimage", "screenshot.jpeg", page headers/footers, and binary artifacts.
- Use the PRE-EXTRACTED HINTS when they look correct.
- Be precise with dates, titles, companies, and bullet points.
- Clean up minor OCR/extraction errors.
- Output ONLY valid JSON. No explanations.`;

    const userPrompt = `
PRE-EXTRACTED HINTS (use these if they look correct):
Name: ${hints.name || 'Unknown'}
Phone: ${hints.phone || ''}
Email: ${hints.email || ''}
Location: ${hints.location || ''}
LinkedIn: ${hints.linkedin || ''}

RESUME TEXT:
${cleanText}

Extract into this exact JSON schema:

{
  "name": "Full Name",
  "email": "email@example.com",
  "phone": "(123) 456-7890",
  "location": "City, State",
  "linkedin_url": "https://linkedin.com/in/...",
  "title": "Job Title",
  "notes": "Professional summary (2-3 sentences) + top skills + years experience"
}

Return ONLY the JSON object.`;

    // Step 5: Call MiniMax-M2.7 via Bedrock
    const command = new InvokeModelCommand({
      modelId: 'minimax.m2.7', // Confirm exact model ID with your AWS console if needed
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.0,
        max_tokens: 4000,
      }),
    });

    const response = await bedrock.send(command);
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));
    const parsedResume = JSON.parse(responseBody.content?.[0]?.text || '{}');

    return NextResponse.json({
      success: true,
      data: parsedResume,
      hintsUsed: hints,
    });

  } catch (error: any) {
    console.error('Resume parse error:', error);
    return NextResponse.json({
      error: 'Failed to parse resume',
      details: error.message,
    }, { status: 500 });
  }
}
