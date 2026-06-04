import { NextRequest, NextResponse } from 'next/server';
import mammoth from 'mammoth';

// Supported file types for resume upload
const SUPPORTED_TYPES = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
const SUPPORTED_EXTENSIONS = ['.pdf', '.docx'];

/**
 * Extract name from filename by cleaning up common patterns
 */
function extractNameFromFilename(filename: string): string {
  const name = filename
    .replace(/\.(pdf|docx?|doc)$/i, '')
    .replace(/[-_]resume$/i, '')
    .replace(/[-_]/g, ' ')
    .trim();
  return name;
}

/**
 * Extract contact info using regex patterns from raw text
 */
function extractContactInfo(rawText: string): {
  email: string;
  phone: string;
  linkedin: string;
  location: string;
} {
  const result = {
    email: '',
    phone: '',
    linkedin: '',
    location: '',
  };

  if (!rawText || rawText.length < 10) {
    return result;
  }

  // Email pattern
  const emailMatch = rawText.match(/[\w.-]+@[\w.-]+\.\w+/);
  if (emailMatch) {
    result.email = emailMatch[0];
  }

  // Phone patterns - various formats
  const phoneMatch = rawText.match(/(?:\+1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
  if (phoneMatch) {
    result.phone = phoneMatch[0];
  }

  // LinkedIn URL
  const linkedinMatch = rawText.match(/(?:linkedin\.com|www\.linkedin\.com)\/in\/[\w-]+/i);
  if (linkedinMatch) {
    result.linkedin = 'https://' + linkedinMatch[0].replace(/^https?:\/\//, '').replace(/^www\./, '');
  }

  // Location - city, state format
  const locationMatch = rawText.match(/([A-Za-z][A-Za-z\s]*,\s*[A-Z]{2})/);
  if (locationMatch) {
    result.location = locationMatch[1].trim();
  }

  return result;
}

export async function POST(req: NextRequest) {
  console.log('parse-resume: starting');
  let fileName = 'resume.pdf';
  
  try {
    const formData = await req.formData();
    const file = formData.get('resume') as File;
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

    // Validate file type
    const fileType = file.type?.toLowerCase() || '';
    const fileNameLower = file.name.toLowerCase();
    const hasValidExtension = SUPPORTED_EXTENSIONS.some(ext => fileNameLower.endsWith(ext));
    const hasValidType = SUPPORTED_TYPES.includes(fileType);
    
    if (!hasValidExtension && !hasValidType) {
      console.log('parse-resume: unsupported file type', file.type, fileName);
      return NextResponse.json({ 
        error: 'Unsupported file type. Please upload PDF or Word (.docx) files.' 
      }, { status: 400 });
    }

    fileName = file.name;
    const buffer = Buffer.from(await file.arrayBuffer());

    console.log('parse-resume: file size =', buffer.length, 'name =', fileName, 'type =', file.type);

    // Extract text based on file type
    let rawText = '';
    let extractionMethod = '';
    
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
            if (fullText.length > 20) {
              rawText = fullText;
              extractionMethod = 'pdfjs';
            }
          }
        } catch (pdfErr) {
          console.error('pdfjs failed:', pdfErr);
        }
        
        // Fallback: if pdfjs didn't work, try binary text extraction
        if (!rawText || rawText.length < 10) {
          try {
            const bufferStr = buffer.toString('binary');
            const emailMatches = bufferStr.match(/[\w.-]+@[\w.-]+\.\w+/g);
            const phoneMatches = bufferStr.match(/\d{3}[-.\s]?\d{3}[-.\s]?\d{4}/g);
            
            if (emailMatches?.length || phoneMatches?.length) {
              console.log('binary fallback extraction - emails:', emailMatches?.length, 'phones:', phoneMatches?.length);
              const parts: string[] = [];
              if (emailMatches) parts.push(...emailMatches);
              if (phoneMatches) parts.push(...phoneMatches);
              rawText = parts.join(' ');
              extractionMethod = 'binary-fallback';
            }
          } catch (binaryErr) {
            console.error('binary extraction failed:', binaryErr);
          }
        }
      } else if (fileNameLower.endsWith('.docx')) {
        // Use mammoth for Word documents
        try {
          const result = await mammoth.extractRawText({ buffer });
          rawText = result.value;
          extractionMethod = 'mammoth';
          console.log('mammoth extracted chars:', rawText.length);
        } catch (mammothErr) {
          console.error('mammoth failed:', mammothErr);
        }
      }
    } catch (extractErr) {
      console.error('Extraction warn:', extractErr);
    }

    console.log('parse-resume: extraction method =', extractionMethod, 'chars =', rawText.length);

    // Build hints from filename and regex extraction
    const hints = {
      name: extractNameFromFilename(file.name),
      phone: '',
      email: '',
      location: '',
      linkedin: '',
      title: '',
    };

    // Extract contact info from raw text if available
    if (rawText && rawText.length > 10) {
      const contactInfo = extractContactInfo(rawText);
      hints.email = contactInfo.email;
      hints.phone = contactInfo.phone;
      hints.linkedin = contactInfo.linkedin;
      hints.location = contactInfo.location;
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
    
// Only use regex-based extraction (AI parsing disabled for now - can be re-enabled later)
    if (cleanText.length > 50) {
      // Already extracted via extractContactInfo above, so just use clean text for skills
      const commonSkills = ['javascript', 'typescript', 'python', 'java', 'react', 'node', 'node.js', 'angular', 'vue', 'aws', 'azure', 'gcp', 'docker', 'kubernetes', 'sql', 'nosql', 'mongodb', 'postgresql', 'mysql', 'redis', 'graphql', 'rest', 'api', 'html', 'css', 'sass', 'less', 'git', 'ci/cd', 'jenkins', 'terraform', 'linux', 'windows', 'macos', 'agile', 'scrum', 'jira', 'confluence', 'figma', 'sketch', 'photoshop', 'illustrator', 'excel', 'powerpoint', 'word', 'outlook', 'teams', 'slack', 'zoom'];
      const foundSkills: string[] = [];
      const lowerText = cleanText.toLowerCase();
      for (const skill of commonSkills) {
        if (lowerText.includes(skill)) {
          foundSkills.push(skill);
        }
      }
      parsedResume.skills = foundSkills.slice(0, 15);
      
      // Try to extract job title from common patterns
      const titleMatch = cleanText.match(/(?:software|software engineer|developer|manager|director|lead|associate|junior|senior|principal|staff)\s+(?:engineer|developer|manager|analyst|designer|specialist)/i);
      if (titleMatch) {
        parsedResume.title = titleMatch[0];
      }
      
      // Try to extract salary expectations
      const salaryMatch = cleanText.match(/\$[\d,]+(?:\s*-\s*\$[\d,]+|\s*(?:k|K|per year|yr))?/);
      if (salaryMatch) {
        parsedResume.salary_requirements = salaryMatch[0];
      }
      
      extractionMethod = 'regex';
    }

// Merge results: prefer regex/hints over AI, but use AI title only if it looks like a title
    const finalName = candidateName || hints.name || parsedResume.name || '';
    const aiTitle = parsedResume.title || '';
    const finalTitle = (aiTitle && aiTitle.length > 2 && aiTitle.length < 100 && !aiTitle.includes(finalName)) ? aiTitle : '';

    // Normalize all fields - ensure arrays are arrays and objects are objects
    const normalizeArray = (val: any) => {
      if (!val) return [];
      if (Array.isArray(val)) return val;
      if (typeof val === 'string') {
        return val.split(',').map((s: string) => s.trim()).filter(Boolean);
      }
      return [];
    };

    const normalizeArrayOfObjects = (val: any) => {
      if (!val) return [];
      if (Array.isArray(val)) {
        return val.map((item: any) => {
          if (typeof item === 'string') return { description: item };
          return {
            company: item.company || item.companyName || '',
            title: item.title || item.jobTitle || '',
            dates: item.dates || item.dateRange || item.startDate ? `${item.startDate || ''} - ${item.endDate || 'Present'}` : '',
            description: item.description || item.description || '',
          };
        }).filter((item: any) => Object.values(item).some((v: any) => v));
      }
      return [];
    };

    const finalResume = {
      name: finalName || parsedResume.name || '',
      title: finalTitle || parsedResume.title || '',
      email: hints.email || parsedResume.email || '',
      phone: hints.phone || parsedResume.phone || '',
      location: hints.location || parsedResume.location || parsedResume.full_address || '',
      fullAddress: parsedResume.full_address || parsedResume.fullAddress || '',
      linkedin: hints.linkedin || parsedResume.linkedin || '',
      summary: parsedResume.summary || '',
      salaryRequirements: parsedResume.salary_requirements || parsedResume.salaryRequirements || '',
      skills: normalizeArray(parsedResume.skills),
      experience: normalizeArrayOfObjects(parsedResume.experience),
      education: normalizeArrayOfObjects(parsedResume.education),
      certifications: normalizeArray(parsedResume.certifications),
    };

    console.log('parse-resume: final name =', finalName, 'title =', finalTitle, 'skills =', finalResume.skills.length, 'experience =', finalResume.experience.length);

    return NextResponse.json({
      success: true,
      resume: finalResume,
      extractionMethod,
      rawText: cleanText.substring(0, 500)
    });

  } catch (error: any) {
    console.error('parse-resume error:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to parse resume',
      resume: {
        name: extractNameFromFilename(fileName),
        email: '',
        phone: '',
        location: '',
        linkedin: '',
        title: '',
        summary: '',
        skills: [],
      }
    }, { status: 500 });
  }
}
