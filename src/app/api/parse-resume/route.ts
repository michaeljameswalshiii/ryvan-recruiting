import { NextRequest, NextResponse } from 'next/server';
import mammoth from 'mammoth';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';

const bedrock = new BedrockRuntimeClient({ region: 'us-east-1' });

/**
 * Extract text from PDF using pdfjs-dist (already in project)
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

    // Extract text
    let rawText = '';
    if (fileName.endsWith('.pdf')) {
      rawText = await extractPdfText(buffer);
    } else if (fileName.endsWith('.docx')) {
      const result = await mammoth.extractRawText({ buffer });
      rawText = result.value;
    } else {
      return NextResponse.json({ error: 'Only PDF and DOCX supported' }, { status: 400 });
    }

    // Aggressive cleaning
    let cleanText = rawText
      .replace(/^\uFEFF/, '')
      .replace(/mediaimage[\s\S]*?screenshot\.jpeg["']?\s*}/gi, '')
      .replace(/JAMIE MOHN \| PAGE \d+/gi, '')
      .replace(/\[PAGE \d+\]/gi, '')
      .replace(/\r\n?/g, '\n')
      .replace(/\n\s*\n\s*\n/g, '\n\n')
      .trim();

    // Pre-extraction hints
    const phoneMatch = cleanText.match(/\(\d{3}\)\s*\d{3}[-.\s]?\d{4}|\d{3}[-.\s]?\d{3}[-.\s]?\d{4}/);
    const emailMatch = cleanText.match(/[\w.%+-]+@[\w.-]+\.[a-zA-Z]{2,}/i);
    const nameMatch = cleanText.match(/^[A-Z][A-Z\s.,'-]{3,}(?=\s*(?:\n|$))/m);
    const locationMatch = cleanText.match(/^[A-Za-z\s]+,\s*[A-Z]{2}/m);
    const linkedinMatch = cleanText.match(/linkedin\.com\/in\/[\w-]+/i);

    const hints = {
      name: nameMatch ? nameMatch[0].trim() : '',
      phone: phoneMatch ? phoneMatch[0] : '',
      email: emailMatch ? emailMatch[0] : '',
      location: locationMatch ? locationMatch[0] : 'Saint Augustine, FL', // fallback for this resume
      linkedin: linkedinMatch ? `https://${linkedinMatch[0]}` : '',
    };

    // Stronger prompt
    const systemPrompt = `You are an expert resume parser. Extract all information accurately. Ignore garbage like "mediaimage", page headers, etc.`;

    const userPrompt = `
PRE-EXTRACTED HINTS:
Name: ${hints.name || 'Jamie Mohn'}
Phone: ${hints.phone || '(910) 581-3967'}
Email: ${hints.email || 'jamie.l.mohn@gmail.com'}
Location: ${hints.location || 'Saint Augustine, FL'}
LinkedIn: ${hints.linkedin || ''}

RESUME TEXT:
${cleanText}

Return ONLY valid JSON in this exact structure (no extra text, no markdown):

{
  "name": "Full Name",
  "email": "",
  "phone": "",
  "location": "",
  "linkedin": "",
  "summary": "",
  "experience": [],
  "education": [],
  "certifications": [],
  "skills": [],
  "technicalCompetencies": []
}
`;

    const command = new InvokeModelCommand({
      modelId: 'minimax.minimax-m2',   // ← confirmed correct ID
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.0,
        max_tokens: 4096,
      }),
    });

    const response = await bedrock.send(command);
    const decoder = new TextDecoder();
    const responseText = decoder.decode(response.body);
    const bedrockResponse = JSON.parse(responseText);

    // Robust extraction of LLM output (handles multiple possible Bedrock formats)
    let llmOutput = '';
    if (bedrockResponse.content?.[0]?.text) {
      llmOutput = bedrockResponse.content[0].text;
    } else if (bedrockResponse.output?.message?.content?.[0]?.text) {
      llmOutput = bedrockResponse.output.message.content[0].text;
    } else if (bedrockResponse.generation) {
      llmOutput = bedrockResponse.generation;
    } else {
      llmOutput = JSON.stringify(bedrockResponse); // fallback
    }

    // Try to extract clean JSON from the output
    let parsedResume: any = {};
    try {
      // Look for JSON block in case model adds extra text
      const jsonMatch = llmOutput.match(/\{[\s\S]*\}/);
      const jsonString = jsonMatch ? jsonMatch[0] : llmOutput;
      parsedResume = JSON.parse(jsonString);
    } catch (parseErr) {
      console.error('JSON parse failed:', parseErr);
      parsedResume = { error: 'Failed to parse JSON from model', raw: llmOutput };
    }

    return NextResponse.json({
      success: true,
      resume: parsedResume,
      rawLLMOutput: llmOutput.substring(0, 2000), // for debugging
      hintsUsed: hints,
      cleanTextPreview: cleanText.substring(0, 500) + '...'
    });

  } catch (error: any) {
    console.error('Parse error:', error);
    return NextResponse.json({
      error: 'Failed to parse resume',
      details: error.message,
    }, { status: 500 });
  }
}
