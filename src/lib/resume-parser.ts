/**
 * Production-grade Resume Parser
 * Optimized for Claude/Minimax integration
 */

export interface ResumeExperience {
  company: string;
  title: string;
  location: string;
  dates: string;
  bullets: string[];
}

export interface ResumeEducation {
  school: string;
  degree: string;
  field: string;
  year: string;
}

export interface ParsedResume {
  fullName: string;
  title: string;
  location: string;
  phone: string;
  email: string;
  linkedin: string;
  professionalSummary: string;
  experience: ResumeExperience[];
  technologies: string[];
  education: ResumeEducation[];
  rawText: string;
}

const SYSTEM_PROMPT = `You are an expert Resume Parser specialized in turning raw resume text (from PDF/DOCX) into clean, structured candidate data for a recruiting platform.

**Rules:**
- Be extremely accurate. Never hallucinate information.
- Preserve exact dates, company names, titles, and metrics (e.g., "$4M → $15M", "200–400%").
- Extract **everything** possible.
- Output **only** valid JSON using this exact schema:

\`\`\`json
{
  "fullName": "string",
  "title": "string",
  "location": "string",
  "phone": "string",
  "email": "string",
  "linkedin": "string",
  "professionalSummary": "string",
  "experience": [
    {
      "company": "string",
      "title": "string",
      "location": "string",
      "dates": "string",
      "bullets": ["array of strings"]
    }
  ],
  "technologies": ["array of strings"],
  "education": [
    {
      "school": "string",
      "degree": "string",
      "field": "string",
      "year": "string"
    }
  ],
  "rawText": "original full text (for debugging)"
}
\`\`\``;

/**
 * Parse raw resume text using AI
 */
export async function parseResume(
  rawText: string,
  apiEndpoint: string = "/api/bedrock"
): Promise<ParsedResume> {
  const response = await fetch(apiEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [
        {
          role: "system",
          content: SYSTEM_PROMPT,
        },
        {
          role: "user",
          content: `Parse this resume:\n\n${rawText}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Resume parsing failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  // Try to parse JSON from response
  let parsed: ParsedResume;

  try {
    // Support both direct JSON responses and text responses containing JSON
    const jsonString = data.structured || data.response || data.content || data;
    if (typeof jsonString === "string") {
      const jsonMatch = jsonString.match(/\{[\s\S]*\}/);
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(jsonString);
    } else {
      parsed = jsonString;
    }
  } catch (e) {
    console.error("Failed to parse AI response:", e);
    console.error("Raw response:", JSON.stringify(data));
    throw new Error("Failed to parse AI response into valid JSON");
  }

  // Validate required fields exist
  if (!parsed.fullName) parsed.fullName = "";
  if (!parsed.title) parsed.title = "";
  if (!parsed.location) parsed.location = "";
  if (!parsed.phone) parsed.phone = "";
  if (!parsed.email) parsed.email = "";
  if (!parsed.linkedin) parsed.linkedin = "";
  if (!parsed.professionalSummary) parsed.professionalSummary = "";
  if (!parsed.experience) parsed.experience = [];
  if (!parsed.technologies) parsed.technologies = [];
  if (!parsed.education) parsed.education = [];
  if (!parsed.rawText) parsed.rawText = rawText;

  return parsed;
}

/**
 * Extract plain text from uploaded resume file (PDF/DOCX)
 * Client-side extraction helper
 */
export async function extractTextFromFile(file: File): Promise<string> {
  const extension = file.name.split(".").pop()?.toLowerCase();

  if (extension === "txt") {
    return await file.text();
  }

  if (extension === "pdf") {
    // Use pdf.js for PDF extraction
    const pdfjsLib = await import("pdfjs-dist");
    pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    let fullText = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items.map((item: unknown) => {
        const textItem = item as { str?: string };
        return textItem.str || "";
      }).join(" ");
      fullText += pageText + "\n";
    }
    return fullText.trim();
  }

  if (extension === "docx") {
    // Use mammoth.js for DOCX extraction
    const mammoth = await import("mammoth");
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value;
  }

  throw new Error(`Unsupported file format: ${extension}. Please upload a TXT, PDF, or DOCX file.`);
}

/**
 * Main entry point - parse a resume file
 */
export async function processResumeFile(file: File, apiEndpoint?: string): Promise<ParsedResume> {
  const rawText = await extractTextFromFile(file);
  return parseResume(rawText, apiEndpoint);
}

// ============================================================================
// Multi-Step Resume Parser
// ============================================================================

const STEP_PROMPTS = {
  contact: `Extract contact information from this resume. Return ONLY valid JSON with this exact structure:
{
  "fullName": "",
  "title": "",
  "location": "",
  "phone": "",
  "email": "",
  "linkedin": ""
}
Fill in each field with the extracted value, or empty string if not found. Do not add any commentary.`,

  summarySkills: `Extract professional summary and technologies/skills from this resume. Return ONLY valid JSON with this exact structure:
{
  "professionalSummary": "",
  "technologies": []
}
professionalSummary should be the full professional summary paragraph. technologies should be an array of all skills, tools, and technologies mentioned. Return empty array if none found.`,

  experience: `Extract work experience and education from this resume. Return ONLY valid JSON with this exact structure:
{
  "experience": [
    {
      "company": "",
      "title": "",
      "location": "",
      "dates": "",
      "bullets": []
    }
  ],
  "education": [
    {
      "school": "",
      "degree": "",
      "field": "",
      "year": ""
    }
  ]
}
Be very accurate with dates and bullet points. Return empty arrays if none found.`,
};

/**
 * Call the Bedrock API with a prompt
 */
async function callBedrock(systemPrompt: string, userContent: string): Promise<any> {
  const response = await fetch("/api/bedrock", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Bedrock API error: ${response.status}`);
  }

  const data = await response.json();

  // Support both structured responses and raw responses
  if (data.structured) return data.structured;
  if (data.response) return typeof data.response === "string" ? JSON.parse(data.response) : data.response;
  return data;
}

/**
 * Parse a resume using multi-step extraction for higher accuracy
 */
export async function parseResumeMultiStep(rawText: string): Promise<ParsedResume> {
  try {
    // Step 1: Extract Contact Info
    const contact = await callBedrock(STEP_PROMPTS.contact, rawText);

    // Step 2: Extract Summary + Skills
    const summarySkills = await callBedrock(STEP_PROMPTS.summarySkills, rawText);

    // Step 3: Extract Experience + Education
    const experienceEducation = await callBedrock(STEP_PROMPTS.experience, rawText);

    // Merge all results
    const final: ParsedResume = {
      fullName: contact.fullName || "",
      title: contact.title || "",
      location: contact.location || "",
      phone: contact.phone || "",
      email: contact.email || "",
      linkedin: contact.linkedin || "",
      professionalSummary: summarySkills.professionalSummary || "",
      technologies: summarySkills.technologies || [],
      experience: experienceEducation.experience || [],
      education: experienceEducation.education || [],
      rawText: rawText.substring(0, 2000),
    };

    return final;
  } catch (error) {
    console.error("Multi-step resume parse failed:", error);
    throw error;
  }
}