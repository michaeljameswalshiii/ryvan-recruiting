/**
 * Server-only resume text extraction (PDF/DOCX) + structured parse.
 * Shared by parse-resume, careers apply, and replace-resume.
 */

import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import mammoth from 'mammoth';
import {
  extractNameFromFilename,
  parseResumeText,
  textFromPdfItems,
  type StructuredParsedResume,
} from '@/lib/candidates/resume-text-parser';

/** Real email shapes only (avoid binary noise). */
const BINARY_EMAIL_RE =
  /[A-Za-z0-9][A-Za-z0-9._%+-]{0,64}@[A-Za-z0-9][A-Za-z0-9.-]{0,64}\.[A-Za-z]{2,24}/g;

/**
 * Phone with real punctuation only.
 * Never match bare space-separated digit runs (PDF font metrics look like "769 605 1000").
 */
const BINARY_PHONE_RE =
  /(?:\+?1[-.\s]?)?(?:\(\d{3}\)[-.\s]?\d{3}[-.\s]?\d{4}|\d{3}[-.]\d{3}[-.]\d{4})\b/g;

/**
 * Also catch UTF-16BE-encoded emails inside PDF streams (00 6A 00 61 00 6E 00 65 … 00 40 …).
 */
function scrapeUtf16BeEmails(buffer: Buffer): string[] {
  const out: string[] = [];
  // Scan for '@' as 00 40
  for (let i = 0; i < buffer.length - 3; i++) {
    if (buffer[i] !== 0x00 || buffer[i + 1] !== 0x40) continue;
    // Walk back for local part
    let start = i;
    while (start >= 2) {
      const hi = buffer[start - 2];
      const lo = buffer[start - 1];
      if (hi !== 0x00) break;
      if (!/[A-Za-z0-9._%+-]/.test(String.fromCharCode(lo))) break;
      start -= 2;
    }
    // Walk forward for domain
    let end = i + 2;
    while (end + 1 < buffer.length) {
      const hi = buffer[end];
      const lo = buffer[end + 1];
      if (hi !== 0x00) break;
      if (!/[A-Za-z0-9.-]/.test(String.fromCharCode(lo))) break;
      end += 2;
    }
    let email = '';
    for (let p = start; p < end; p += 2) {
      if (buffer[p] === 0x00) email += String.fromCharCode(buffer[p + 1]);
    }
    if (
      /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(email) &&
      email.length < 80
    ) {
      out.push(email);
    }
  }
  return out;
}

function scrapeContactFromBinary(buffer: Buffer): string {
  const bufferStr = buffer.toString('latin1');
  const parts: string[] = [];
  const emails = [
    ...(bufferStr.match(BINARY_EMAIL_RE) || []),
    ...scrapeUtf16BeEmails(buffer),
  ];
  const phones = bufferStr.match(BINARY_PHONE_RE) || [];

  const seen = new Set<string>();
  for (const e of emails) {
    const key = e.toLowerCase();
    if (seen.has(key)) continue;
    if (e.includes('..') || e.length > 80) continue;
    // Filter binary noise that happens to look like email
    if (/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(e)) continue;
    seen.add(key);
    parts.push(e);
  }
  for (const p of phones) {
    const digits = p.replace(/\D/g, '');
    if (digits.length < 10 || digits.length > 11) continue;
    // Reject runs of identical digits / obvious junk
    if (/^(\d)\1+$/.test(digits)) continue;
    if (seen.has(digits)) continue;
    seen.add(digits);
    parts.push(p.trim());
  }
  return parts.join('\n');
}

function resolvePdfWorkerSrc(): string {
  const rel = [
    'pdfjs-dist/legacy/build/pdf.worker.mjs',
    'pdfjs-dist/build/pdf.worker.mjs',
    'pdfjs-dist/legacy/build/pdf.worker.min.mjs',
    'pdfjs-dist/build/pdf.worker.min.mjs',
  ];
  for (const r of rel) {
    const abs = path.join(process.cwd(), 'node_modules', r);
    if (fs.existsSync(abs)) {
      return pathToFileURL(abs).href;
    }
  }
  // CDN fallback last (pdfjs v5 major)
  return 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/5.4.149/pdf.worker.min.mjs';
}

async function extractPdfText(
  buffer: Buffer
): Promise<{ text: string; method: string }> {
  // Prefer legacy build for Node/serverless. Worker src must be set (pdfjs v4+);
  // never pin an old CDN worker major that doesn't match the installed package.
  const importCandidates = [
    'pdfjs-dist/legacy/build/pdf.mjs',
    'pdfjs-dist',
  ] as const;

  const workerSrc = resolvePdfWorkerSrc();
  let lastError: unknown;

  for (const modPath of importCandidates) {
    try {
      const pdfjsLib: any = await import(modPath);
      const getDocument = pdfjsLib.getDocument || pdfjsLib.default?.getDocument;
      if (!getDocument) continue;

      if (pdfjsLib.GlobalWorkerOptions) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;
      }

      const loadingTask = getDocument({
        data: new Uint8Array(buffer),
        useSystemFonts: true,
        isEvalSupported: false,
        disableFontFace: true,
      });
      const pdf = await loadingTask.promise;
      let full = '';

      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();
        const items = textContent.items as Array<{
          str?: string;
          transform?: number[];
          width?: number;
          hasEOL?: boolean;
        }>;
        const pageText = textFromPdfItems(items);
        const fallback = items
          .map((i) => i.str || '')
          .join(' ')
          .replace(/[ \t]+/g, ' ')
          .trim();
        full += (pageText || fallback) + '\n';
      }

      if (full.trim().length > 20) {
        return { text: full, method: `pdfjs:${modPath}` };
      }
    } catch (e) {
      lastError = e;
      console.warn(`[resume-extract] pdfjs failed (${modPath}):`, e);
    }
  }

  if (lastError) {
    console.warn('[resume-extract] all pdfjs paths failed:', lastError);
  }

  // Last resort: only real contact tokens — never invent phones from font tables.
  const contactOnly = scrapeContactFromBinary(buffer);
  if (contactOnly.length > 5) {
    return { text: contactOnly, method: 'binary-contact-fallback' };
  }

  return { text: '', method: '' };
}

export async function extractTextFromResumeBuffer(
  buffer: Buffer,
  fileName: string
): Promise<{ text: string; method: string }> {
  const lower = fileName.toLowerCase();
  let text = '';
  let method = '';

  if (lower.endsWith('.pdf')) {
    const result = await extractPdfText(buffer);
    text = result.text;
    method = result.method;
  } else if (lower.endsWith('.docx') || lower.endsWith('.doc')) {
    try {
      const result = await mammoth.extractRawText({ buffer });
      text = result.value || '';
      method = 'mammoth';
    } catch (e) {
      console.warn('[resume-extract] mammoth failed:', e);
    }
  }

  return { text, method };
}

export async function parseResumeBuffer(
  buffer: Buffer,
  fileName: string
): Promise<{
  parsed: StructuredParsedResume;
  text: string;
  method: string;
}> {
  const { text, method } = await extractTextFromResumeBuffer(buffer, fileName);

  // If pdf.js text is missing email/phone, graft contact tokens scraped from the
  // raw PDF (and re-parse). Letter-spaced PDFs often still embed plain emails.
  let workingText = text;
  let workingMethod = method;
  const contactOnly = scrapeContactFromBinary(buffer);
  if (contactOnly) {
    const hasEmail = /@/.test(workingText);
    const hasPhone =
      /\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/.test(workingText) ||
      /(?:\d\s+){2}\d\s*[-–.]?\s*(?:\d\s+){2}\d/.test(workingText);
    if (!hasEmail || !hasPhone) {
      workingText = [contactOnly, workingText].filter(Boolean).join('\n');
      workingMethod = method
        ? `${method}+binary-contact`
        : 'binary-contact-fallback';
    }
  }

  const parsed = parseResumeText(workingText, { filename: fileName });
  if (!parsed.name) {
    parsed.name =
      extractNameFromFilename(fileName) ||
      fileName.replace(/\.[^/.]+$/, '');
  }
  return { parsed, text: workingText, method: workingMethod };
}
