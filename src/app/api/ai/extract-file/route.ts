import { NextRequest, NextResponse } from 'next/server';
import mammoth from 'mammoth';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { getSession } from '@/lib/server-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB
const MAX_CHARS = 120_000;

const TEXT_EXT = new Set([
  'txt',
  'md',
  'markdown',
  'csv',
  'tsv',
  'json',
  'jsonl',
  'xml',
  'html',
  'htm',
  'log',
  'yaml',
  'yml',
  'js',
  'ts',
  'tsx',
  'jsx',
  'py',
  'sql',
  'css',
  'env',
]);

function extensionOf(name: string): string {
  const parts = name.toLowerCase().split('.');
  return parts.length > 1 ? parts[parts.length - 1] : '';
}

function truncate(text: string): { text: string; truncated: boolean } {
  if (text.length <= MAX_CHARS) return { text, truncated: false };
  return {
    text: text.slice(0, MAX_CHARS) + '\n\n…[content truncated for context limits]',
    truncated: true,
  };
}

/**
 * Extract plain text from an uploaded file for General AI chat context.
 * Supports text/csv/json/md, DOCX (mammoth). PDF/XLSX return a clear message.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.userId) {
      return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
    }

    const form = await request.formData();
    const file = form.get('file');
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: 'file is required' }, { status: 400 });
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: `File too large (max ${MAX_BYTES / (1024 * 1024)} MB)` },
        { status: 400 }
      );
    }

    const fileName = file.name || 'upload';
    const ext = extensionOf(fileName);
    const buffer = Buffer.from(await file.arrayBuffer());

    // Plain text family
    if (TEXT_EXT.has(ext) || file.type.startsWith('text/')) {
      const raw = buffer.toString('utf-8');
      const { text, truncated } = truncate(raw);
      return NextResponse.json({
        ok: true,
        fileName,
        mimeType: file.type || 'text/plain',
        charCount: text.length,
        truncated,
        text,
      });
    }

    // DOCX
    if (
      ext === 'docx' ||
      file.type ===
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ) {
      const result = await mammoth.extractRawText({ buffer });
      const { text, truncated } = truncate(result.value || '');
      return NextResponse.json({
        ok: true,
        fileName,
        mimeType: file.type || 'application/docx',
        charCount: text.length,
        truncated,
        text,
      });
    }

    // PDF — best-effort text decode is poor; ask user or use basic extraction
    if (ext === 'pdf' || file.type === 'application/pdf') {
      // Minimal PDF text scrape (no full PDF engine): extract readable strings
      const asLatin = buffer.toString('latin1');
      const streams = asLatin.match(/\((?:\\.|[^\\)]){3,}\)/g) || [];
      let scraped = streams
        .map((s) =>
          s
            .slice(1, -1)
            .replace(/\\n/g, '\n')
            .replace(/\\r/g, '')
            .replace(/\\\(/g, '(')
            .replace(/\\\)/g, ')')
            .replace(/\\\\/g, '\\')
        )
        .filter((s) => /[A-Za-z]{3,}/.test(s))
        .join('\n');

      if (scraped.length < 80) {
        return NextResponse.json({
          ok: false,
          fileName,
          error:
            'Could not extract text from this PDF. Try exporting to .txt/.docx or paste the content.',
        }, { status: 422 });
      }

      const { text, truncated } = truncate(scraped);
      return NextResponse.json({
        ok: true,
        fileName,
        mimeType: 'application/pdf',
        charCount: text.length,
        truncated,
        text,
        warning: 'PDF text extraction is best-effort; formatting may be incomplete.',
      });
    }

    // Spreadsheets
    if (ext === 'xlsx' || ext === 'xls' || ext === 'xlsm') {
      if (ext !== 'xlsx' && ext !== 'xlsm') {
        return NextResponse.json({ ok: false, fileName, error: 'Legacy .xls files are not supported. Save as .xlsx and upload again.' }, { status: 422 });
      }
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer as any);
      const sheets = workbook.worksheets.map((sheet) => {
        const rows: string[] = [];
        sheet.eachRow((row) => {
          const values = Array.isArray(row.values) ? row.values.slice(1) : [];
          rows.push(values.map((value) => String(value ?? '').replace(/\r?\n/g, ' ')).join('\t'));
        });
        return `## ${sheet.name}\n${rows.join('\n')}`;
      });
      const { text, truncated } = truncate(sheets.join('\n\n'));
      return NextResponse.json({ ok: true, fileName, mimeType: file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', charCount: text.length, truncated, text, format: 'tab-separated workbook text', sheets: workbook.worksheets.map((sheet) => sheet.name) });
    }

    // PowerPoint: extract slide titles and text from the OOXML package.
    if (ext === 'pptx') {
      const zip = await JSZip.loadAsync(buffer);
      const slideNames = Object.keys(zip.files).filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name)).sort();
      const slides = await Promise.all(slideNames.map(async (name, index) => {
        const xml = await zip.files[name].async('text');
        const text = [...xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((match) => match[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')).join(' ').trim();
        return `## Slide ${index + 1}\n${text}`;
      }));
      const { text, truncated } = truncate(slides.join('\n\n'));
      return NextResponse.json({ ok: true, fileName, mimeType: file.type || 'application/vnd.openxmlformats-officedocument.presentationml.presentation', charCount: text.length, truncated, text, format: 'presentation text', slides: slideNames.length });
    }

    return NextResponse.json(
      {
        ok: false,
        fileName,
        error: `Unsupported file type (.${ext || 'unknown'}). Supported: txt, md, csv, json, docx, pdf, xlsx, xlsm, pptx.`,
      },
      { status: 415 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Extract failed';
    console.error('[extract-file]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
