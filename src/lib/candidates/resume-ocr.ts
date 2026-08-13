/**
 * Fast OCR for scanned / image-based resumes.
 * Prefers Textract sync on the first 1–2 pages (~2–5s) instead of the
 * async job API (often 20–45s).
 *
 * @serverOnly
 */

import {
  DetectDocumentTextCommand,
  GetDocumentTextDetectionCommand,
  StartDocumentTextDetectionCommand,
  TextractClient,
  type Block,
} from "@aws-sdk/client-textract";
import { PDFDocument } from "pdf-lib";

const MAX_SYNC_BYTES = 5 * 1024 * 1024;
const MAX_PAGES = 2;
const ASYNC_POLL_MS = 1500;
// Large PDFs can take several seconds to enter SUCCEEDED. Keep this below the
// route's 60-second budget while allowing the S3 async path to finish.
const ASYNC_MAX_POLLS = 30;

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

function ocrBucket() {
  return (
    process.env.AWS_S3_BUCKET_NAME ||
    process.env.NEXT_PUBLIC_AWS_S3_BUCKET_NAME ||
    ""
  ).trim();
}

/**
 * PDFs must use Textract's asynchronous S3 document API. The synchronous API
 * accepts image bytes, but commonly rejects PDF bytes (including one-page PDFs
 * extracted from a larger scanned document).
 */
async function detectPdfTextFromS3(
  s3Key: string,
): Promise<{ text: string; method: string } | null> {
  const bucket = ocrBucket();
  if (!bucket || !s3Key) return null;

  const started = Date.now();
  try {
    const start = await textractClient().send(
      new StartDocumentTextDetectionCommand({
        DocumentLocation: { S3Object: { Bucket: bucket, Name: s3Key } },
      }),
    );
    const jobId = start.JobId;
    if (!jobId) return null;

    let nextToken: string | undefined;
    const lines: string[] = [];
    for (let poll = 0; poll < ASYNC_MAX_POLLS; poll++) {
      await new Promise((resolve) => setTimeout(resolve, ASYNC_POLL_MS));
      const result = await textractClient().send(
        new GetDocumentTextDetectionCommand({
          JobId: jobId,
          NextToken: nextToken,
        }),
      );
      if (result.JobStatus === "FAILED") {
        throw new Error(result.StatusMessage || "Textract PDF job failed");
      }
      if (result.JobStatus === "SUCCEEDED") {
        lines.push(linesFromBlocks(result.Blocks));
        nextToken = result.NextToken;
        while (nextToken) {
          const page = await textractClient().send(
            new GetDocumentTextDetectionCommand({
              JobId: jobId,
              NextToken: nextToken,
            }),
          );
          lines.push(linesFromBlocks(page.Blocks));
          nextToken = page.NextToken;
        }
        const text = lines.filter(Boolean).join("\n");
        if (text.trim().length > 20) {
          console.log(
            "[resume-ocr] async PDF",
            text.length,
            "chars in",
            Date.now() - started,
            "ms",
          );
          return { text, method: "textract-pdf" };
        }
        return null;
      }
    }
    throw new Error("Textract PDF job timed out");
  } catch (error) {
    console.warn("[resume-ocr] async PDF failed:", error);
    return null;
  }
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
  opts?: { fileName?: string; s3Key?: string }
): Promise<{ text: string; method: string } | null> {
  if (!buffer?.length) return null;
  const started = Date.now();

  try {
    if (opts?.s3Key && opts.fileName?.toLowerCase().endsWith(".pdf")) {
      const pdfText = await detectPdfTextFromS3(opts.s3Key);
      if (pdfText) return pdfText;
    }

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

    // Multi-page: OCR the first two pages in parallel via sync API. Large PDF
    // pages can retain embedded image resources above Textract's sync limit;
    // in that case async S3 OCR was already attempted and there is no useful
    // local fallback to run here.
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
    if (buffer.length > MAX_SYNC_BYTES) return null;
  } catch (error) {
    console.warn("[resume-ocr] OCR unavailable:", error);
  }

  return null;
}
