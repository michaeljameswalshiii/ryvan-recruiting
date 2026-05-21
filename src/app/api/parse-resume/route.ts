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
 * - data: { name, email, phone, title, linkedin_url, location, notes }
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

    // Clean text: remove BOM, noise, normalize line endings
    let cleanText = resumeText
      .replace(/^\uFEFF/, "") // Remove BOM
      .replace(/mediaimage[\s\S]*?screenshot\.jpeg["']?}/g, "") // Strip image noise
      .replace(/\r\n?/g, "\n")
      .trim();

    // Strong regex pre-extraction (multiline-aware)
    const nameMatch = cleanText.match(/^[A-Z][A-Z\s.,'-]{2,}(?=\s*(?:,|\n|$))/m);
    const phoneMatch = cleanText.match(/\(\d{3}\)\s*\d{3}[-.\s]?\d{4}|\d{3}[-.\s]?\d{3}[-.\s]?\d{4}/);
    const emailMatch = cleanText.match(/[\w.%+-]+@[\w.-]+\.[a-zA-Z]{2,}/i);
    const locationMatch = cleanText.match(/^[A-Za-z\s]+,\s*[A-Z]{2}/m);
    const linkedinMatch = cleanText.match(/linkedin\.com\/in\/[\w-]+/i);

    const preExtracted = {
      name: nameMatch ? nameMatch[0].trim() : "",
      phone: phoneMatch ? phoneMatch[0] : "",
      email: emailMatch ? emailMatch[0] : "",
      location: locationMatch ? locationMatch[0] : "",
      linkedin: linkedinMatch ? `https://${linkedinMatch[0]}` : "",
    };

    // Build prompt with enhanced schema hints
    const prompt = `You are an expert resume parser. Extract structured data.

PRE-EXTRACTED HINTS (use these if they look correct):
Name: ${preExtracted.name || "(not detected)"}
Phone: ${preExtracted.phone || "(not detected)"}
Email: ${preExtracted.email || "(not detected)"}
Location: ${preExtracted.location || "(not detected)"}
LinkedIn: ${preExtracted.linkedin || "(not detected)"}

Resume text:
${cleanText.substring(0, 25000)}

Return ONLY valid JSON with this exact schema (fill every field):
{
  "name": "...",
  "email": "...",
  "phone": "...",
  "location": "...",
  "linkedin_url": "...",
  "title": "...",
  "notes": "Professional summary (2-3 sentences) + top skills + years experience"
}

Return ONLY valid JSON, no explanation.`;

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
      name: parsed.name || preExtracted.name || "",
      email: parsed.email || preExtracted.email || "",
      phone: parsed.phone || preExtracted.phone || "",
      title: parsed.title || "",
      linkedin_url: parsed.linkedin_url || preExtracted.linkedin || "",
      location: parsed.location || preExtracted.location || "",
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