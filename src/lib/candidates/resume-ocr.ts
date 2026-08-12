/**
 * Fast OCR for scanned / image-based resumes.
 * Prefers Textract sync on the first 1–2 pages (~2–5s) instead of the
 * async job API (often 20–45s).
 *
 * @serverOnly
 */

import {
  DetectDocumentTextCommand,
  TextractClient,
  type Block,
} from "@aws-sdk/client-textract";
import { PDFDocument } from "pdf-lib";

const MAX_SYNC_BYTES = 5 * 1024 * 1024;
const MAX_PAGES = 2;

function awsRegion() {
  return process.env.AWS_REGION || process.env.NEXT_PUBLIC_AWS_REGION || "us-east-1";
}

let cachedClient: TextractClient | null = null;
function textractClient() {
  if (cachedClient) return cachedClient;
  const accessKeyId =
    process.env.AWS_ACCESS_KEY_ID || process.env.MY_AWS_ACCESS_KEY_ID;
  const secretAccessKey =
    process.env.AWS_SECRET_ACCESS_KEY || process.env.MY_AWS_SECRET_ACCESS_KEY;
  cachedClient = new TextractClient({
    region: awsRegion(),
    ...(accessKeyId && secretAccessKey
      ? { credentials: { accessKeyId, secretAccessKey } }
      : {}),
  });
  return cachedClient;
}

function linesFromBlocks(blocks?: Block[]): string {
  return (blocks || [])
    .filter((block) => block.BlockType === "LINE" && block.Text)
    .map((block) => String(block.Text).trim())
    .filter(Boolean)
    .join("\n");
}

async function detectDocumentTextSync(buffer: Buffer): Promise<string> {
  if (buffer.length > MAX_SYNC_BYTES) {
    throw new Error("PDF page exceeds Textract sync size");
  }
  const res = await textractClient().send(
    new DetectDocumentTextCommand({
      Document: { Bytes: buffer },
    })
  );
  return linesFromBlocks(res.Blocks);
}

async function firstPagesAsSinglePdfs(
  buffer: Buffer,
  maxPages = MAX_PAGES
): Promise<Buffer[]> {
  const src = await PDFDocument.load(buffer, { ignoreEncryption: true });
  const count = Math.min(src.getPageCount(), maxPages);
  if (count <= 0) return [];
  const pages: Buffer[] = [];
  for (let i = 0; i < count; i++) {
    const out = await PDFDocument.create();
    const [page] = await out.copyPages(src, [i]);
    out.addPage(page);
    pages.push(Buffer.from(await out.save({ useObjectStreams: false })));
  }
  return pages;
}

export function looksLikeScannedPdf(buffer: Buffer): boolean {
  const sample = buffer.toString("latin1", 0, Math.min(buffer.length, 250_000));
  const images = (sample.match(/\/Subtype\s*\/Image/g) || []).length;
  const fonts = (sample.match(/\/BaseFont|\/Font\s*<</g) || []).length;
  return images >= 1 && fonts < 4;
}

export async function extractResumeTextWithOcr(
  buffer: Buffer,
  _opts?: { fileName?: string; s3Key?: string }
): Promise<{ text: string; method: string } | null> {
  if (!buffer?.length) return null;
  const started = Date.now();

  try {
    // One-page scans succeed here in ~1–3s.
    if (buffer.length <= MAX_SYNC_BYTES) {
      try {
        const text = await detectDocumentTextSync(buffer);
        if (text.trim().length > 20) {
          console.log(
            "[resume-ocr] sync whole-pdf",
            text.length,
            "chars in",
            Date.now() - started,
            "ms"
          );
          return { text, method: "textract-sync" };
        }
      } catch (error) {
        const name =
          error && typeof error === "object" && "name" in error
            ? String((error as { name?: string }).name)
            : "";
        if (
          name !== "UnsupportedDocumentException" &&
          name !== "InvalidParameterException"
        ) {
          console.warn("[resume-ocr] whole-pdf sync failed:", error);
        }
      }
    }

    // Multi-page: OCR the first two pages in parallel via sync API.
    const pagePdfs = await firstPagesAsSinglePdfs(buffer, MAX_PAGES);
    if (!pagePdfs.length) return null;

    const pageTexts = await Promise.all(
      pagePdfs.map(async (page, index) => {
        try {
          return await detectDocumentTextSync(page);
        } catch (error) {
          console.warn(`[resume-ocr] page ${index + 1} sync failed:`, error);
          return "";
        }
      })
    );
    const text = pageTexts.filter((part) => part.trim().length > 0).join("\n\n");
    if (text.trim().length > 20) {
      console.log(
        "[resume-ocr] sync pages",
        pagePdfs.length,
        text.length,
        "chars in",
        Date.now() - started,
        "ms"
      );
      return { text, method: "textract-pages" };
    }
  } catch (error) {
    console.warn("[resume-ocr] OCR unavailable:", error);
  }

  return null;
}
