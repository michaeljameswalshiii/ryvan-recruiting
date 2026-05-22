/**
 * API Route: Parse Resume (ENHANCED VERSION)
 * 
 * Accepts PDF/DOCX resume via FormData and uses AI to extract
 * structured candidate data with robust pre-extraction fallback.
 * 
 * ENHANCEMENTS v2:
 * - Strong system prompt with garbage rejection rules
 * - Pre-extracted hints template for better accuracy
 * - More aggressive text cleaning (page headers, mediaimage noise)
 * - Uses MiniMax via /api/bedrock with temperature 0.0
 * 
 * Input (FormData):
 * - "resume": PDF or DOCX file
 * 
 * Output (JSON):
 * - success: boolean
 * - data: { name, email, phone, title, linkedin_url, location, notes }
 */

import { NextRequest, NextResponse } from "next/server";

// ============================================================================
// Enhanced System Prompt - Expert Resume Parser
// ============================================================================

const SYSTEM_PROMPT = `You are an expert resume parser. Your job is to extract structured information from potentially noisy, messy, or partially corrupted resume text.

Rules:
- Ignore all garbage such as "mediaimage", "screenshot.jpeg", binary artifacts, page numbers ("PAGE 2"), repeated headers/footers, and any non-resume content.
- Use the PRE-EXTRACTED HINTS when they are provided and look correct.
- Be extremely accurate with dates, job titles, company names, and bullet points.
- Clean up minor OCR or extraction errors automatically.
- Output ONLY valid JSON. No explanations, no markdown, no extra text.`;

// ============================================================================
// User Prompt Template with Pre-Extracted Hints
// ============================================================================

function buildUserPrompt(rawText: string, hints: {
  name?: string;
  phone?: string;
  email?: string;
  location?: string;
  linkedin?: string;
}): string {
  return `PRE-EXTRACTED HINTS (use these if they look correct):
Name: ${hints.name || 'Unknown'}
Phone: ${hints.phone || ''}
Email: ${hints.email || ''}
Location: ${hints.location || ''}
LinkedIn: ${hints.linkedin || ''}

RESUME TEXT (may be noisy):
${rawText}

Extract the full resume into this exact JSON schema:

{
  "name": "Full Name",
  "email": "email@example.com",
  "phone": "(123) 456-7890",
  "location": "City, State",
  "linkedin_url": "https://linkedin.com/in/...",
  "title": "Job Title",
  "notes": "Professional summary (2-3 sentences) + top skills + years experience"
}

Return ONLY the JSON object. Do not add any other text.`;
}

// ============================================================================
// Aggressive Text Cleaning
// ============================================================================

function cleanResumeText(text: string): string {
  return text
    .replace(/^\uFEFF/, '')  // Remove BOM
    .replace(/mediaimage[\s\S]*?screenshot\.jpeg["']?\s*}/gi, '')  // Strip image noise
    .replace(/\r\n?/g, '\n')  // Normalize line endings
    .replace(/JAMIE MOHN \| PAGE \d+/gi, '')  // Remove page headers (e.g., "JAMIE MOHN | PAGE 2")
    .replace(/PAGE \d+/gi, '')  // Remove standalone page numbers
    .replace(/^\s*\d+\s*$/gm, '')  // Remove single-digit page numbers on lines
    .trim();
}

// ============================================================================
// Regex Pre-Extraction (Fallback Values)
// ============================================================================

interface PreExtractedHints {
  name: string;
  phone: string;
  email: string;
  location: string;
  linkedin: string;
}

function extractHints(text: string): PreExtractedHints {
  // Phone: (123) 456-7890 or 123-456-7890
  const phoneMatch = text.match(/\(\d{3}\)\s*\d{3}[-.\s]?\d{4}|\d{3}[-.\s]?\d{3}[-.\s]?\d{4}/);
  
  // Email: standard email pattern
  const emailMatch = text.match(/[\w.%+-]+@[\w.-]+\.[a-zA-Z]{2,}/i);
  
  // Name: Capitalized words at start (first line that looks like a name)
  const nameMatch = text.match(/^[A-Z][A-Z\s.,'-]{3,}(?=\s*(?:,|\n|$))/m);
  
  // Location: City, State (e.g., "San Francisco, CA")
  const locationMatch = text.match(/^[A-Za-z\s]+,\s*[A-Z]{2}/m);
  
  // LinkedIn: linkedin.com/in/...
  const linkedinMatch = text.match(/linkedin\.com\/in\/[\w-]+/i);
  
  return {
    name: nameMatch ? nameMatch[0].trim() : '',
    phone: phoneMatch ? phoneMatch[0] : '',
    email: emailMatch ? emailMatch[0] : '',
    location: locationMatch ? locationMatch[0].trim() : '',
    linkedin: linkedinMatch ? `https://${linkedinMatch[0]}` : '',
  };
}

// ============================================================================
// Main Handler
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const resumeFile = formData.get("resume") as File;

    if (!resumeFile) {
      return NextResponse.json({ error: "No resume file provided" }, { status: 400 });
    }

    const fileType = resumeFile.type;
    const isPDF = fileType === "application/pdf";
    const isDOCX = fileType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

    if (!isPDF && !isDOCX) {
      return NextResponse.json({ error: "Only PDF and DOCX files are supported" }, { status: 400 });
    }

    let resumeText = "";

    // Handle PDF files with pdfjs-dist
    if (isPDF) {
      try {
        const pdfjsLib = await import("pdfjs-dist");
        pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

        const arrayBuffer = await resumeFile.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

        const textParts: string[] = [];
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          const pageText = content.items
            .map((item: any) => item.str)
            .join(" ");
          textParts.push(pageText);
        }
        resumeText = textParts.join("\n\n");
      } catch (e) {
        console.warn("[PARSE-RESUME] PDF.js extraction failed, falling back to binary decode:", e);
        // Fallback: try to extract text from binary
        const buffer = Buffer.from(await resumeFile.arrayBuffer());
        resumeText = buffer.toString("utf-8");
      }
    }

    // Handle DOCX files with mammoth
    if (isDOCX) {
      try {
        const mammoth = await import("mammoth");
        const arrayBuffer = await resumeFile.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        resumeText = result.value;
      } catch (e) {
        console.warn("[PARSE-RESUME] Mammoth extraction failed:", e);
        resumeText = "";
      }
    }

    // ============================================================================
    // ENHANCED: Aggressive cleaning
    // ============================================================================
    const cleanText = cleanResumeText(resumeText);
    console.log(`[PARSE-RESUME] Cleaned text length: ${cleanText.length} chars`);

    // ============================================================================
    // ENHANCED: Regex pre-extraction (fallback)
    // ============================================================================
    const hints = extractHints(cleanText);
    console.log("[PARSE-RESUME] Pre-extracted hints:", {
      name: hints.name ? "found" : "not found",
      phone: hints.phone ? "found" : "not found",
      email: hints.email ? "found" : "not found",
      location: hints.location ? "found" : "not found",
      linkedin: hints.linkedin ? "found" : "not found",
    });

    // ============================================================================
    // ENHANCED: Build prompts with hints
    // ============================================================================
    const userPrompt = buildUserPrompt(cleanText.substring(0, 25000), hints);

    // ============================================================================
    // ENHANCED: Call Bedrock with MiniMax (temperature 0.0)
    // ============================================================================
    const appUrl = request.url ? new URL(request.url).origin : 
      process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001";

const aiResponse = await fetch(`${appUrl}/api/bedrock`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt }
        ],
        // Disable tools to avoid unexpected tool calling behavior for resume parsing
        // Temperature 0.0 and max_tokens 4000 for consistent JSON output
        useTools: false,
        assistantMode: true,
        temperature: 0.0,
        max_tokens: 4000,
      }),
    });

    const aiData = await aiResponse.json();
    console.log("[PARSE-RESUME] Bedrock response received");

    // ============================================================================
    // Parse JSON response
    // ============================================================================
    let parsed: Record<string, string> = {};

    try {
      // Try to extract JSON from response
      const responseText = aiData.response || aiData.error || "";
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
        console.log("[PARSE-RESUME] JSON parsed successfully");
      }
    } catch (e) {
      console.error("[PARSE-RESUME] JSON extraction/parse failed:", e);
      parsed = {};
    }

    // ============================================================================
    // Post-processing: fallback to pre-extracted values if AI returned empty
    // ============================================================================
    const finalData = {
      name: parsed.name || hints.name || "",
      email: parsed.email || hints.email || "",
      phone: parsed.phone || hints.phone || "",
      title: parsed.title || "",
      linkedin_url: parsed.linkedin_url || hints.linkedin || "",
      location: parsed.location || hints.location || "",
      notes: parsed.notes || "",
    };

    console.log("[PARSE-RESUME] Final data:", {
      name: finalData.name ? "found" : "empty",
      email: finalData.email ? "found" : "empty",
      phone: finalData.phone ? "found" : "empty",
    });

    return NextResponse.json({
      success: true,
      data: finalData,
    });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to parse resume";
    console.error("[PARSE-RESUME] Error:", message);
    return NextResponse.json({
      error: "Failed to parse resume",
      details: message
    }, { status: 500 });
  }
}
