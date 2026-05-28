import { NextRequest, NextResponse } from 'next/server';
import mammoth from 'mammoth';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';

const bedrock = new BedrockRuntimeClient({ region: 'us-east-1' });

function extractNameFromFilename(filename: string): string {
  const name = filename
    .replace(/\.(pdf|docx?|doc)$/i, '')
    .replace(/[-_]resume$/i, '')
    .replace(/[-_]/g, ' ')
    .trim();
  return name;
}

export async function POST(req: NextRequest) {
  console.log('parse-resume: starting');
  let fileName = 'resume.pdf';
  
  try {
    const formData = await req.formData();
    const file = formData.get('resume') as File;
    if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 });

    fileName = file.name;
    const buffer = Buffer.from(await file.arrayBuffer());
    const fileNameLower = file.name.toLowerCase();

    console.log('parse-resume: file size =', buffer.length, 'name =', fileName);

    // Extract text - first try pdfjs, then mammoth for docx, fallback to filename
    let rawText = '';
    
    try {
if (fileNameLower.endsWith('.pdf')) {
        // Try pdfjs-dist dynamic import
        try {
          const pdfjsLib = await import('pdfjs-dist');
          const getDocument = (pdfjsLib as any).getDocument;
          // Set up worker for pdfjs v3+
          if (pdfjsLib.GlobalWorkerOptions) {
            pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
          }
          if (getDocument) {
            const loadingTask = getDocument({ data: buffer });
            const pdf = await loadingTask.promise;
            let fullText = '';
            
            for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
              const page = await pdf.getPage(pageNum);
              const textContent = await page.getTextContent();
              const pageText = textContent.items
                .map((item: any) => item.str)
                .join(' ');
              fullText += pageText + '\n';
            }
            
            console.log('pdfjs extracted chars:', fullText.length);
            rawText = fullText;
          }
        } catch (pdfErr) {
          console.error('pdfjs failed:', pdfErr);
        }
        
        // If pdfjs didn't extract anything, try extracting from buffer directly
        if (!rawText || rawText.length < 10) {
          // Try to find readable text in the PDF buffer
          const bufferStr = buffer.toString('binary');
          // Look for email pattern in the binary
          const emailMatches = bufferStr.match(/[\w.-]+@[\w.-]+\.\w+/g);
          const phoneMatches = bufferStr.match(/\d{3}[-.\s]?\d{3}[-.\s]?\d{4}/g);
          
          console.log('fallback extraction - emails:', emailMatches?.length, 'phones:', phoneMatches?.length);
        }
      } else if (fileNameLower.endsWith('.docx')) {
        rawText = (await mammoth.extractRawText({ buffer })).value;
      }
    } catch (extractErr) {
      console.error('Extraction warn:', extractErr);
    }

    // Build hints from filename and regex
    const hints: any = {
      name: extractNameFromFilename(file.name),
      phone: '',
      email: '',
      location: '',
      linkedin: '',
      title: '',
    };

    // Try to extract from raw text if available
    if (rawText && rawText.length > 10) {
      const emailMatch = rawText.match(/[\w.-]+@[\w.-]+\.\w+/);
      const phoneMatch = rawText.match(/\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
      const linkedinMatch = rawText.match(/(?:linkedin\.com|www\.linkedin\.com)\/in\/[\w-]+/i);
      const locationMatch = rawText.match(/([A-Za-z][A-Za-z\s]*,\s*[A-Z]{2})/);
      
      if (emailMatch) hints.email = emailMatch[0];
      if (phoneMatch) hints.phone = phoneMatch[0];
      if (linkedinMatch) hints.linkedin = 'https://' + linkedinMatch[0].replace(/^https?:\/\//, '').replace(/^www\./, '');
      if (locationMatch) hints.location = locationMatch[1].trim();
    }

    console.log('parse-resume: hints =', hints);

    // Always generate a name from filename if empty
    let candidateName = hints.name || extractNameFromFilename(file.name);
    if (!candidateName || candidateName.length < 2) {
      candidateName = file.name.replace(/\.[^/.]+$/, '');
    }

    // Try AI extraction if we have enough text
    let cleanText = rawText.trim() || candidateName;
    cleanText = cleanText.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim();

    let parsedResume: any = {};
    
    // Only call AI if we have meaningful text
    if (cleanText.length > 20) {
      try {
        const prompt = `
You are an expert resume parser.
Extract from the resume text below:
- name (full name)
- title (job title)
- email 
- phone
- location (city, state)
- linkedin (full URL)
- summary (brief)
- skills (comma-separated)

Resume text:
${cleanText.substring(0, 4000)}

Return ONLY valid JSON:
{"name":"","title":"","email":"","phone":"","location":"","linkedin":"","summary":"","skills":[]}
`;

        const command = new InvokeModelCommand({
          modelId: 'minimax.minimax-m2',
          contentType: 'application/json',
          accept: 'application/json',
          body: JSON.stringify({
            messages: [
              { role: 'system', content: 'You are an expert resume parser.' },
              { role: 'user', content: prompt }
            ],
            temperature: 0.0,
            max_tokens: 4096,
          }),
        });

        const response = await bedrock.send(command);
        const decoder = new TextDecoder();
        const responseText = decoder.decode(response.body);
        const bedrockResponse = JSON.parse(responseText);

        let llmText = '';
        if (bedrockResponse.content?.[0]?.text) {
          llmText = bedrockResponse.content[0].text;
        } else if (bedrockResponse.output?.message?.content?.[0]?.text) {
          llmText = bedrockResponse.output.message.content[0].text;
        } else if (bedrockResponse.generation) {
          llmText = bedrockResponse.generation;
        } else {
          llmText = JSON.stringify(bedrockResponse);
        }

        const jsonMatch = llmText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsedResume = JSON.parse(jsonMatch[0]);
        }
        console.log('AI parsed:', parsedResume);
      } catch (aiErr) {
        console.error('AI parse error:', aiErr);
      }
    }

// Always prefer name from filename or hints - NOT from AI as title
    const finalName = candidateName || hints.name || parsedResume.name || '';
    // Only use AI result for title if it's not a name
    const aiTitle = parsedResume.title || '';
    const finalTitle = (aiTitle && aiTitle.length > 2 && !aiTitle.includes(finalName)) ? aiTitle : '';

    const finalResume = {
      name: finalName,
      email: hints.email || parsedResume.email || '',
      phone: hints.phone || parsedResume.phone || '',
      location: hints.location || parsedResume.location || '',
      linkedin: hints.linkedin || parsedResume.linkedin || '',
      title: finalTitle,
      summary: parsedResume.summary || '',
      skills: parsedResume.skills || [],
    };

    console.log('parse-resume: final name =', finalName, 'title =', finalTitle);

    console.log('parse-resume: finalResume =', finalResume);

    return NextResponse.json({
      success: true,
      resume: finalResume,
      rawText: cleanText.substring(0, 500)
    });

  } catch (error: any) {
    console.error('parse-resume error:', error);
    return NextResponse.json({
      success: true,
      resume: {
        name: extractNameFromFilename(fileName),
        email: '',
        phone: '',
        location: '',
        linkedin: '',
        title: '',
        summary: '',
        skills: [],
      },
      rawText: 'Parse failed'
    });
  }
}
