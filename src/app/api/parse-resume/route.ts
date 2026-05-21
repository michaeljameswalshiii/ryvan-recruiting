/**
 * API Route: Parse Resume
 *
 * Accepts PDF/DOCX resume via FormData and uses AI (Apollo/Bedrock) to extract
 * structured candidate data with robust pre-extraction fallback.
 *
 * Input (FormData):
 * - "resume": PDF or DOCX file
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

    // Clean text: remove BOM, normalize line endings
    let cleanText = resumeText
      .replace(/^\uFEFF/, "") // Remove BOM
      .replace(/\r\n?/g, "\n") // Normalize to \n
      .trim();

    // Pre-extract key fields using regex + line heuristics
    const lines = cleanText.split("\n").map((l) => l.trim()).filter(Boolean);

    const phoneRegex = /\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/;
    const emailRegex = /[\w.%+-]+@[\w.-]+\.[a-zA-Z]{2,}/;
    const linkedinRegex = /linkedin\.com\/in\/[\w-]+/i;
    const stateZipRegex = /\b([A-Z]{2})\s*\d{5}(?:-\d{4})?\b|\b\d{5}(?:-\d{4})?\b/;

    let extractedName = "";
    let extractedPhone = "";
    let extractedEmail = "";
    let extractedLocation = "";
    let extractedLinkedIn = "";

    // Scan first 15 lines for key fields
    for (let i = 0; i < Math.min(15, lines.length); i++) {
      const line = lines[i];

      // Name: looks like a name (title-case words, no special chars except -,.')
      if (!extractedName && /^[A-Z][a-zA-Z\s.,'-]{2,}$/.test(line) && !line.includes("@") && !phoneRegex.test(line) && line.length < 50) {
        extractedName = line;
      }

      // Phone number
      if (!extractedPhone && phoneRegex.test(line)) {
        extractedPhone = line.match(phoneRegex)?.[0] || "";
      }

      // Email
      if (!extractedEmail && emailRegex.test(line)) {
        extractedEmail = line.match(emailRegex)?.[0] || "";
      }

      // LinkedIn
      if (!extractedLinkedIn && linkedinRegex.test(line)) {
        const match = line.match(linkedinRegex);
        extractedLinkedIn = match ? `https://${match[0]}` : "";
      }

      // Location (city, state or state + zip)
      if (!extractedLocation && (
        line.includes("FL") || line.includes(", FL") ||
        line.includes("CA") || line.includes(", CA") ||
        /,?\s*[A-Z]{2}\s*\d{5}/.test(line)
      )) {
        // Try to extract city, state format
        const locationMatch = line.match(/([A-Za-z\s]+,\s*[A-Z]{2})/);
        if (locationMatch) {
          extractedLocation = locationMatch[1];
        } else {
          // Just capture the state
          const stateMatch = line.match(/\b([A-Z]{2})\b/);
          if (stateMatch) {
            extractedLocation = stateMatch[1];
          }
        }
      }
    }

    // Build strict AI prompt with pre-extracted hints
    const prompt = `Extract structured data from this resume. Use the pre-extracted hints if they look correct.

Pre-extracted (verify and use if reasonable):
Name: ${extractedName || "(not detected)"}
Phone: ${extractedPhone || "(not detected)"}
Email: ${extractedEmail || "(not detected)"}
Location: ${extractedLocation || "(not detected)"}

Resume text:
${cleanText.substring(0, 20000)}

Return ONLY valid JSON matching this exact structure:
{
  "name": "Full Name",
  "email": "email@example.com",
  "phone": "(555) 123-4567",
  "title": "Most recent job title",
  "company": "Most recent company",
  "linkedin_url": "https://linkedin.com/in/...",
  "location": "City, State",
  "notes": "Professional summary (2-3 sentences) + top 5 skills + years experience"
}

Examples:
Input: John Smith, (555) 123-4567, john@example.com
{"name": "John Smith", "email": "john@example.com", "phone": "(555) 123-4567", ...}

Input: Jane Doe
{"name": "Jane Doe", ...}

Return ONLY valid JSON, no explanation or extra text.`;

    // Call Apollo for parsing
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
      const jsonMatch = aiData.response?.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      console.error("[PARSE-RESUME] JSON extraction failed:", e);
      parsed = {};
    }

    // Post-processing: fallback to pre-extracted values if AI returned empty
    const finalData = {
      name: parsed.name || extractedName || "",
      email: parsed.email || extractedEmail || "",
      phone: parsed.phone || extractedPhone || "",
      title: parsed.title || "",
      company: parsed.company || "",
      linkedin_url: parsed.linkedin_url || extractedLinkedIn || "",
      location: parsed.location || extractedLocation || "",
      notes: parsed.notes || "",
    };

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