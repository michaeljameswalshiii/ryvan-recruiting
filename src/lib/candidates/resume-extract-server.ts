/**
 * Server-only resume text extraction (PDF/DOCX) + structured parse.
 * Shared by parse-resume, careers apply, and replace-resume.
 */

import mammoth from 'mammoth';
import {
  extractNameFromFilename,
  parseResumeText,
  textFromPdfItems,
  type StructuredParsedResume,
} from '@/lib/candidates/resume-text-parser';

export async function extractTextFromResumeBuffer(
  buffer: Buffer,
  fileName: string
): Promise<{ text: string; method: string }> {
  const lower = fileName.toLowerCase();
  let text = '';
  let method = '';

  if (lower.endsWith('.pdf')) {
    try {
      const pdfjsLib = await import('pdfjs-dist');
      const getDocument = (pdfjsLib as any).getDocument;
      if (pdfjsLib.GlobalWorkerOptions) {
        pdfjsLib.GlobalWorkerOptions.workerSrc =
          'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      }
      if (getDocument) {
        const pdf = await getDocument({ data: buffer }).promise;
        let full = '';
        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
          const page = await pdf.getPage(pageNum);
          const textContent = await page.getTextContent();
          const items = textContent.items as Array<{
            str?: string;
            transform?: number[];
          }>;
          const pageText = textFromPdfItems(items);
          full +=
            (pageText || items.map((i) => i.str || '').join(' ')) + '\n';
        }
        if (full.trim().length > 20) {
          text = full;
          method = 'pdfjs';
        }
      }
    } catch (e) {
      console.warn('[resume-extract] pdfjs failed:', e);
    }

    if (text.length < 10) {
      try {
        const bufferStr = buffer.toString('binary');
        const emails = bufferStr.match(/[\w.-]+@[\w.-]+\.\w+/g);
        const phones = bufferStr.match(/\d{3}[-.\s]?\d{3}[-.\s]?\d{4}/g);
        const parts: string[] = [];
        if (emails) parts.push(...emails);
        if (phones) parts.push(...phones);
        if (parts.length) {
          text = parts.join('\n');
          method = 'binary-fallback';
        }
      } catch {
        /* ignore */
      }
    }
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
  const parsed = parseResumeText(text, { filename: fileName });
  if (!parsed.name) {
    parsed.name =
      extractNameFromFilename(fileName) ||
      fileName.replace(/\.[^/.]+$/, '');
  }
  return { parsed, text, method };
}
