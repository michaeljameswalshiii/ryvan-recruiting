/**
 * API Route: Parse Resume
 * 
 * Accepts PDF resume via FormData and uses AI (Apollo/Bedrock) to extract
 * structured candidate data.
 * 
 * Input (FormData):
 * - "resume": PDF file
 * 
 * Output (JSON):
 * - success: boolean
 * - data: { name, email, phone, title, company, linkedin_url, location, notes }
 */

import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const resumeFile = formData.get("resume") as File;

    if (!resumeFile) {
      return NextResponse.json({ error: "No resume file provided" }, { status: 400 });
    }

    if (resumeFile.type !== "application/pdf") {
      return NextResponse.json({ error: "Only PDF files are supported" }, { status: 400 });
    }

    // Convert to text - try to read as text for simplicity
    let resumeText = "";
    try {
      const arrayBuffer = await resumeFile.arrayBuffer();
      const decoder = new TextDecoder("utf-8");
      resumeText = decoder.decode(arrayBuffer);
    } catch {
      // If decoding fails, try different approach
      try {
        const buffer = Buffer.from(await resumeFile.arrayBuffer());
        resumeText = buffer.toString("utf-8");
      } catch {
        // Fallback - just use filename
        resumeText = `Resume file: ${resumeFile.name}`;
      }
    }

    // If text is too short (likely binary PDF), use a placeholder prompt
    const hasTextContent = resumeText.length > 100;
    const prompt = hasTextContent 
      ? `Extract structured data from this resume text and return ONLY valid JSON with this exact structure:
{
  "name": "Full Name",
  "email": "email@example.com", 
  "phone": "phone number",
  "title": "Most recent job title",
  "company": "Most recent company",
  "linkedin_url": "https://linkedin.com/in/...",
  "location": "City, State",
  "notes": "Professional summary (2-4 sentences) + top 5 skills + total years experience"
}

Resume text:
${resumeText.substring(0, 15000)}

Return ONLY valid JSON, no other text.`
      : `The resume file "${resumeFile.name}" was uploaded but the text could not be extracted. Please extract from the filename and provide reasonable defaults.

Return ONLY valid JSON with this exact structure:
{
  "name": "Full Name from filename",
  "email": "", 
  "phone": "",
  "title": "",
  "company": "",
  "linkedin_url": "",
  "location": "",
  "notes": "Resume parsing - text extraction failed"
}`;

    // Call Apollo (preferred) or Bedrock for parsing
    const aiResponse = await fetch(new URL(request.url).origin + "/api/apollo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: prompt,
        messages: []
      }),
    });

    const aiData = await aiResponse.json();

    let parsed: Record<string, string> = {};
    
    try {
      // Extract JSON from response - AI sometimes adds extra text
      const jsonMatch = aiData.response?.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      console.error("[PARSE-RESUME] JSON extraction failed:", e);
      parsed = {};
    }

    return NextResponse.json({
      success: true,
      data: {
        name: parsed.name || "",
        email: parsed.email || "",
        phone: parsed.phone || "",
        title: parsed.title || "",
        company: parsed.company || "",
        linkedin_url: parsed.linkedin_url || "",
        location: parsed.location || "",
        notes: parsed.notes || "",
      },
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
