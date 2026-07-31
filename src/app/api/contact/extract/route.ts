import { NextRequest, NextResponse } from "next/server";
import { extractContactRecordFromUrl } from "@/lib/web/contact-extractor";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const url = typeof body?.url === "string" ? body.url.trim() : "";

    if (!url) {
      return NextResponse.json(
        { success: false, error: "A website URL is required." },
        { status: 400 },
      );
    }

    const parsedUrl = new URL(url);
    if (!/^https?:$/i.test(parsedUrl.protocol)) {
      return NextResponse.json(
        { success: false, error: "Only http and https URLs are supported." },
        { status: 400 },
      );
    }

    const record = await extractContactRecordFromUrl(parsedUrl.toString());

    return NextResponse.json({
      success: true,
      record,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unable to extract contact information.";

    return NextResponse.json(
      { success: false, error: message },
      { status: 400 },
    );
  }
}
