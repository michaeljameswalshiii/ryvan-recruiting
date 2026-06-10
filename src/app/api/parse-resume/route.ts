import { NextRequest, NextResponse } from 'next/server';
import mammoth from 'mammoth';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// Supported file types for resume upload
const SUPPORTED_TYPES = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
const SUPPORTED_EXTENSIONS = ['.pdf', '.docx'];

// 7 days in seconds for long-lived presigned URLs
const SEVEN_DAYS_SECONDS = 604800;

/**
 * Enhanced Resume Parser with section-based extraction
 * Deployed for testing parse-resume endpoint
 */
function enhancedParseResume(text: string): {
  name: string;
  title: string;
  email: string;
  phone: string;
  linkedin: string;
  location: string;
  summary: string;
  experience: string;
  education: string;
  skills: string[];
  certifications: string[];
} {
  const result = {
    name: '',
    title: '',
    email: '',
    phone: '',
    linkedin: '',
    location: '',
    summary: '',
    experience: '',
    education: '',
    skills: [] as string[],
    certifications: [] as string[],
  };

  if (!text || text.length < 10) {
    return result;
  }

  // Name extraction - look for patterns like "Name:" or all-caps names at start
  const nameMatch = text.match(/(?:^|\n)Name[:\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})/i);
  if (nameMatch) {
    result.name = nameMatch[1].trim();
  } else {
    // Try to find capitalized words at the start (common resume format)
    const firstLineMatch = text.split('\n')[0].match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})/);
    if (firstLineMatch && firstLineMatch[1].length > 3) {
      result.name = firstLineMatch[1].trim();
    }
  }

  // Title extraction
  const titleMatch = text.match(/(?:Title|Position|Role)[:\s]+([^\n]+)/i);
  if (titleMatch) {
    result.title = titleMatch[1].trim();
  } else {
    // Common job title patterns
    const jobTitleMatch = text.match(/([A-Za-z\s]+(?:Engineer|Manager|Developer|Director|Consultant|Analyst|Designer|Specialist)){1,2}/i);
    if (jobTitleMatch) {
      result.title = jobTitleMatch[1].trim();
    }
  }

  // Email extraction
  const emailMatch = text.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/);
  if (emailMatch) {
    result.email = emailMatch[0];
  }

  // Phone extraction - various formats
  const phoneMatch = text.match(/(?:\+?\d{1,3}[-.\s]?)?(\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}/);
  if (phoneMatch) {
    result.phone = phoneMatch[0];
  }

  // LinkedIn extraction
  const linkedinMatch = text.match(/(?:linkedin\.com|www\.linkedin\.com)\/in\/[\w-]+/i);
  if (linkedinMatch) {
    result.linkedin = 'https://' + linkedinMatch[0].replace(/^https?:\/\//, '').replace(/^www\./, '');
  }

  // Location extraction
  const locationMatch = text.match(/([A-Za-z][A-Za-z\s]*,\s*[A-Z]{2})/);
  if (locationMatch) {
    result.location = locationMatch[1].trim();
  }

  // Section-based extraction
  // EXPERIENCE section
  const expMatch = text.match(/EXPERIENCE[\s\S]*?(?=EDUCATION|SKILLS|CERTIFICATIONS|SUMMARY|$)/i);
  result.experience = expMatch ? expMatch[0].replace(/^EXPERIENCE\s*/i, '').trim() : '';

  // EDUCATION section
  const eduMatch = text.match(/EDUCATION[\s\S]*?(?=EXPERIENCE|SKILLS|CERTIFICATIONS|SUMMARY|$)/i);
  result.education = eduMatch ? eduMatch[0].replace(/^EDUCATION\s*/i, '').trim() : '';

  // SKILLS section - extract as array
  const skillsMatch = text.match(/SKILLS[\s\S]*?(?=EXPERIENCE|EDUCATION|CERTIFICATIONS|SUMMARY|$)/i);
  if (skillsMatch) {
    const skillsText = skillsMatch[0].replace(/^SKILLS\s*/i, '').trim();
    result.skills = skillsText
      .split(/[,|\n•●]/)
      .map(s => s.trim())
      .filter(s => s.length > 0 && s.length < 50)
      .slice(0, 30);
  }

  // CERTIFICATIONS section
  const certMatch = text.match(/CERTIFICATIONS?|CERTIFICATES?[\s\S]*?(?=EXPERIENCE|EDUCATION|SKILLS|SUMMARY|$)/i);
  if (certMatch) {
    const certText = certMatch[0].replace(/^CERTIFICATIONS?\s*/i, '').trim();
    result.certifications = certText
      .split(/[,|\n•●]/)
      .map(s => s.trim())
      .filter(s => s.length > 0 && s.length < 100)
      .slice(0, 15);
  }

  // SUMMARY section
  const summaryMatch = text.match(/SUMMARY|PROFILE[\s\S]*?(?=EXPERIENCE|EDUCATION|SKILLS|$)/i);
  if (summaryMatch) {
    result.summary = summaryMatch[0].replace(/^(SUMMARY|PROFILE)\s*/i, '').trim().substring(0, 500);
  }

  return result;
}

/**
 * Fallback parsing using simple regex extraction
 */
function fallbackParseResume(text: string): {
  name: string;
  title: string;
  email: string;
  phone: string;
  linkedin: string;
  location: string;
  summary: string;
  experience: string;
  education: string;
  skills: string[];
  certifications: string[];
} {
  const result = {
    name: '',
    title: '',
    email: '',
    phone: '',
    linkedin: '',
    location: '',
    summary: '',
    experience: '',
    education: '',
    skills: [] as string[],
    certifications: [] as string[],
  };

  if (!text || text.length < 10) {
    return result;
  }

  // Email
  const emailMatch = text.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/);
  if (emailMatch) {
    result.email = emailMatch[0];
  }

  // Phone
  const phoneMatch = text.match(/(?:\+?\d{1,3}[-.\s]?)?(\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}/);
  if (phoneMatch) {
    result.phone = phoneMatch[0];
  }

  // LinkedIn
  const linkedinMatch = text.match(/(?:linkedin\.com|www\.linkedin\.com)\/in\/[\w-]+/i);
  if (linkedinMatch) {
    result.linkedin = 'https://' + linkedinMatch[0].replace(/^https?:\/\//, '').replace(/^www\./, '');
  }

  // Common skills detection
  const commonSkills = [
    'javascript', 'typescript', 'python', 'java', 'react', 'node', 'node.js', 'angular', 'vue',
    'aws', 'azure', 'gcp', 'docker', 'kubernetes', 'sql', 'nosql', 'mongodb',
    'postgresql', 'mysql', 'redis', 'graphql', 'rest', 'api', 'html', 'css',
    'git', 'ci/cd', 'jenkins', 'terraform', 'linux', 'windows', 'macos',
    'agile', 'scrum', 'jira', 'confluence', 'figma', 'excel', 'powerpoint'
  ];
  const lowerText = text.toLowerCase();
  for (const skill of commonSkills) {
    if (lowerText.includes(skill)) {
      result.skills.push(skill);
    }
  }
  result.skills = result.skills.slice(0, 15);

  return result;
}

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
 * Get S3 client for file uploads
 */
function getS3Client(): S3Client {
  const region = process.env.AWS_REGION || process.env.NEXT_PUBLIC_AWS_REGION || 'us-east-1';
  return new S3Client({ region });
}

/**
 * Get S3 bucket name
 */
function getBucketName(): string {
  const bucketName = process.env.AWS_S3_BUCKET_NAME || process.env.NEXT_PUBLIC_AWS_S3_BUCKET_NAME;
  if (!bucketName) {
    throw new Error('AWS_S3_BUCKET_NAME environment variable not configured');
  }
  return bucketName;
}

/**
 * Upload file to S3 with permanent key
 */
async function uploadToS3Permanent(
  buffer: Buffer,
  fileName: string,
  contentType: string,
  candidateId: string
): Promise<{ s3Key: string; presignedUrl: string }> {
  const s3Client = getS3Client();
  const bucketName = getBucketName();

  // Generate permanent S3 key with candidateId
  const timestamp = Date.now();
  const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
  const s3Key = `resumes/${candidateId}/${timestamp}-${sanitizedFileName}`;

  // Upload permanently to S3
  const putCommand = new PutObjectCommand({
    Bucket: bucketName,
    Key: s3Key,
    Body: buffer,
    ContentType: contentType,
  });

  await s3Client.send(putCommand);

  // Generate long-lived presigned URL (7 days)
  const getCommand = new GetObjectCommand({
    Bucket: bucketName,
    Key: s3Key,
  });

  const presignedUrl = await getSignedUrl(s3Client, getCommand, { expiresIn: SEVEN_DAYS_SECONDS });

  return { s3Key, presignedUrl };
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

/**
 * Fetch Google Document and export as plain text
 * Uses Google's public export feature for shared documents
 */
async function fetchGoogleDocAsText(docId: string): Promise<{ text: string; error?: string }> {
  try {
    // Try to export as plain text using Google's export API
    const exportUrl = `https://docs.google.com/document/d/${docId}/export?format=txt`;
    
    const response = await fetch(exportUrl, {
      method: 'GET',
      headers: {
        'Accept': 'text/plain',
      },
    });
    
    if (!response.ok) {
      // Fallback: try to fetch the HTML version
      const htmlUrl = `https://docs.google.com/document/d/${docId}/export?format=html`;
      const htmlResponse = await fetch(htmlUrl);
      
      if (!htmlResponse.ok) {
        return { text: '', error: 'Failed to fetch Google Doc' };
      }
      
      const htmlText = await htmlResponse.text();
      // Strip HTML tags for basic text extraction
      const text = htmlText.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      return { text };
    }
    
    const text = await response.text();
    return { text };
  } catch (err) {
    console.error('fetchGoogleDocAsText error:', err);
    return { text: '', error: 'Failed to fetch Google Doc' };
  }
}

/**
 * Extract Google Doc ID from URL
 */
function extractGoogleDocId(url: string): string | null {
  const match = url.match(/docs\.google\.com\/document\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : null;
}

export async function POST(req: NextRequest) {
  console.log('parse-resume: starting');
  let fileName = 'resume.pdf';
  
  try {
    const formData = await req.formData();
    
    // Check for Google Docs URL first
    const googleDocUrl = formData.get('googleDocUrl') as string;
    
    if (googleDocUrl) {
      // Handle Google Docs import
      console.log('parse-resume: processing Google Doc URL');
      
      const docId = extractGoogleDocId(googleDocUrl);
      if (!docId) {
        return NextResponse.json({ error: 'Invalid Google Docs URL' }, { status: 400 });
      }
      
      // Fetch the document
      const { text: rawText, error } = await fetchGoogleDocAsText(docId);
      
      if (error || !rawText) {
        return NextResponse.json({ error: error || 'Failed to fetch Google Doc content' }, { status: 400 });
      }
      
      console.log('parse-resume: Google Doc fetched, chars =', rawText.length);
      
      // Reuse the same parsing logic
      const cleanText = rawText.trim().replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim();
      const contactInfo = extractContactInfo(cleanText);
      
      // Use regex-based extraction for Google Docs content
      const parsedResume: any = {};
      
      if (cleanText.length > 50) {
        const commonSkills = ['javascript', 'typescript', 'python', 'java', 'react', 'node', 'node.js', 'angular', 'vue', 'aws', 'azure', 'gcp', 'docker', 'kubernetes', 'sql', 'nosql', 'mongodb', 'postgresql', 'mysql', 'redis', 'graphql', 'rest', 'api', 'html', 'css', 'sass', 'less', 'git', 'ci/cd', 'jenkins', 'terraform', 'linux', 'windows', 'macos', 'agile', 'scrum', 'jira', 'confluence', 'figma', 'excel', 'powerpoint'];
        const foundSkills: string[] = [];
        const lowerText = cleanText.toLowerCase();
        for (const skill of commonSkills) {
          if (lowerText.includes(skill)) {
            foundSkills.push(skill);
          }
        }
        parsedResume.skills = foundSkills.slice(0, 15);
        
        const titleMatch = cleanText.match(/(?:software|software engineer|developer|manager|director|lead|associate|junior|senior|principal|staff)\s+(?:engineer|developer|manager|analyst|designer|specialist)/i);
        if (titleMatch) {
          parsedResume.title = titleMatch[0];
        }
        
        const salaryMatch = cleanText.match(/\$[\d,]+(?:\s*-\s*\$[\d,]+|\s*(?:k|K|per year|yr))?/);
        if (salaryMatch) {
          parsedResume.salary_requirements = salaryMatch[0];
        }
      }
      
      const normalizeArray = (val: any) => {
        if (!val) return [];
        if (Array.isArray(val)) return val;
        if (typeof val === 'string') {
          return val.split(',').map((s: string) => s.trim()).filter(Boolean);
        }
        return [];
      };
      
      const finalResume = {
        name: contactInfo.name || parsedResume.name || '',
        title: parsedResume.title || '',
        email: contactInfo.email || parsedResume.email || '',
        phone: contactInfo.phone || parsedResume.phone || '',
        location: contactInfo.location || parsedResume.location || '',
        linkedin: contactInfo.linkedin || parsedResume.linkedin || '',
        summary: parsedResume.summary || '',
        salaryRequirements: parsedResume.salary_requirements || '',
        skills: normalizeArray(parsedResume.skills),
        experience: [],
        education: [],
        certifications: [],
      };
      
      console.log('parse-resume: Google Doc parsed, name =', finalResume.name, 'email =', finalResume.email);
      
      // For Google Docs, we don't upload to S3 - just return the URL
      return NextResponse.json({
        success: true,
        resume: finalResume,
        extractionMethod: 'google-doc',
        resumeUrl: googleDocUrl,
        fileKey: null,
      });
    }
    
    // Handle file upload
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

    // ===== PERMANENT S3 STORAGE + 7-DAY PRESIGNED URL =====
    let resumeUrl = '';
    let fileKey = '';
    
    // Get candidateId from formData (required for permanent S3 key)
    const candidateId = formData.get('candidateId') as string;
    
    if (candidateId && buffer.length > 0) {
      try {
        console.log('parse-resume: uploading to S3 with 7-day URL, candidateId =', candidateId);
        
        // Upload permanently to S3 with candidateId-based key
        const s3Result = await uploadToS3Permanent(
          buffer,
          fileName,
          file.type,
          candidateId
        );
        
        resumeUrl = s3Result.presignedUrl;
        fileKey = s3Result.s3Key;
        
        console.log('parse-resume: S3 upload complete, fileKey =', fileKey);
      } catch (s3Err) {
        console.error('parse-resume: S3 upload failed:', s3Err);
        // Continue without S3 URL - parsing still works
      }
    }

    return NextResponse.json({
      success: true,
      resume: finalResume,
      extractionMethod,
      rawText: cleanText.substring(0, 500),
      // Include S3 info if upload succeeded
      resumeUrl: resumeUrl || null,
      fileKey: fileKey || null,
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
