/**
 * Generate downloadable files for the AI assistant (docx, xlsx, csv, md, txt, json, html, svg).
 * Returns base64 content so the UI can offer a one-click download — no S3 required.
 *
 * @serverOnly
 */

import { Document, Packer, Paragraph, TextRun, HeadingLevel } from "docx";
import ExcelJS from "exceljs";
import type { ToolContext, ToolParams, ToolResult } from "./types";

export const GENERATE_FILE_TOOL_NAME = "generate_file";
export const GENERATE_FILE_TOOL_DESCRIPTION =
  "Create a downloadable file for the user (Word .docx, Excel .xlsx, CSV, Markdown, plain text, JSON, or HTML). " +
  "Use when the user asks for a document, spreadsheet, export, attachment, or downloadable file. " +
  "After success, tell them a Download button will appear in the chat — do NOT claim you cannot create files.";

export type GeneratedFilePayload = {
  fileName: string;
  mimeType: string;
  contentBase64: string;
  sizeBytes: number;
  format: string;
};

const MAX_CONTENT_CHARS = 400_000; // ~400KB text before encoding
const MAX_OUTPUT_BYTES = 1_500_000;

const MIME: Record<string, string> = {
  txt: "text/plain;charset=utf-8",
  md: "text/markdown;charset=utf-8",
  csv: "text/csv;charset=utf-8",
  json: "application/json;charset=utf-8",
  html: "text/html;charset=utf-8",
  svg: "image/svg+xml;charset=utf-8",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

function sanitizeFileName(name: string, ext: string): string {
  let base = String(name || "download")
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  if (!base) base = "download";
  const lower = base.toLowerCase();
  if (!lower.endsWith(`.${ext}`)) base = `${base}.${ext}`;
  return base;
}

function normalizeFormat(raw?: string): string {
  const f = String(raw || "md")
    .toLowerCase()
    .replace(/^\./, "")
    .trim();
  if (f === "markdown" || f === "text") return f === "text" ? "txt" : "md";
  if (f === "doc" || f === "word") return "docx";
  if (f === "xls" || f === "excel" || f === "spreadsheet") return "xlsx";
  if (MIME[f]) return f;
  return "md";
}

/** Parse content: plain string, or JSON for structured xlsx/csv */
function parseContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (content == null) return "";
  try {
    return JSON.stringify(content, null, 2);
  } catch {
    return String(content);
  }
}

/**
 * Optional structured rows for spreadsheets:
 * content as JSON string: { "sheets": [ { "name": "Sheet1", "headers": [...], "rows": [[...], ...] } ] }
 * or { "headers": [...], "rows": [...] }
 * or plain CSV text
 */
async function buildXlsx(content: string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Trio Recruiting AI";
  wb.created = new Date();

  let structured: any = null;
  try {
    structured = JSON.parse(content);
  } catch {
    /* plain text → one column */
  }

  if (structured && (structured.sheets || structured.headers || structured.rows)) {
    const sheets = structured.sheets
      ? structured.sheets
      : [
          {
            name: structured.sheetName || "Sheet1",
            headers: structured.headers,
            rows: structured.rows || [],
          },
        ];

    for (const sheet of sheets) {
      const ws = wb.addWorksheet(
        String(sheet.name || "Sheet1").slice(0, 31) || "Sheet1"
      );
      const headers: string[] = Array.isArray(sheet.headers)
        ? sheet.headers.map(String)
        : [];
      if (headers.length) {
        ws.addRow(headers);
        ws.getRow(1).font = { bold: true };
      }
      const rows: unknown[][] = Array.isArray(sheet.rows) ? sheet.rows : [];
      for (const row of rows) {
        if (Array.isArray(row)) ws.addRow(row.map((c) => (c == null ? "" : c)));
        else if (row && typeof row === "object") {
          if (headers.length) {
            ws.addRow(headers.map((h) => (row as any)[h] ?? ""));
          } else {
            ws.addRow(Object.values(row as object));
          }
        } else {
          ws.addRow([row]);
        }
      }
      ws.columns?.forEach((col) => {
        let max = 10;
        col.eachCell?.({ includeEmpty: true }, (cell) => {
          const len = String(cell.value ?? "").length;
          if (len > max) max = Math.min(len, 50);
        });
        col.width = max + 2;
      });
    }
  } else {
    const ws = wb.addWorksheet("Sheet1");
    const lines = content.split(/\r?\n/);
    for (const line of lines) {
      // naive CSV split if commas present
      if (line.includes(",")) {
        ws.addRow(
          line.split(",").map((c) => c.replace(/^"|"$/g, "").trim())
        );
      } else {
        ws.addRow([line]);
      }
    }
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

async function buildDocx(content: string, title?: string): Promise<Buffer> {
  const lines = content.split(/\r?\n/);
  const children: Paragraph[] = [];

  if (title) {
    children.push(
      new Paragraph({
        text: title,
        heading: HeadingLevel.HEADING_1,
        spacing: { after: 200 },
      })
    );
  }

  for (const line of lines) {
    const t = line.trimEnd();
    if (/^#{1,3}\s+/.test(t)) {
      const level = (t.match(/^#+/) || ["#"])[0].length;
      const text = t.replace(/^#{1,3}\s+/, "");
      children.push(
        new Paragraph({
          text,
          heading:
            level === 1
              ? HeadingLevel.HEADING_1
              : level === 2
                ? HeadingLevel.HEADING_2
                : HeadingLevel.HEADING_3,
          spacing: { before: 200, after: 100 },
        })
      );
    } else if (t.startsWith("- ") || t.startsWith("* ")) {
      children.push(
        new Paragraph({
          text: t.replace(/^[-*]\s+/, ""),
          bullet: { level: 0 },
        })
      );
    } else if (!t) {
      children.push(new Paragraph({ text: "" }));
    } else {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: t, size: 22 })],
          spacing: { after: 80 },
        })
      );
    }
  }

  if (children.length === 0) {
    children.push(new Paragraph({ text: content || " " }));
  }

  const doc = new Document({
    sections: [{ properties: {}, children }],
  });
  const buf = await Packer.toBuffer(doc);
  return Buffer.from(buf);
}

export async function executeGenerateFile(
  params: ToolParams,
  _context: ToolContext
): Promise<ToolResult> {
  const p = params as Record<string, unknown>;
  const format = normalizeFormat(
    String(p.format || p.file_type || p.type || "md")
  );
  const contentRaw = parseContent(p.content ?? p.body ?? p.text ?? p.query);
  const title = p.title ? String(p.title).trim() : undefined;
  let fileName = String(p.file_name || p.fileName || p.filename || title || "download");

  if (!contentRaw.trim() && format !== "xlsx") {
    return {
      success: false,
      error: "content is required (the full text/body of the file)",
    };
  }
  if (contentRaw.length > MAX_CONTENT_CHARS) {
    return {
      success: false,
      error: `content too large (max ${MAX_CONTENT_CHARS} characters)`,
    };
  }

  fileName = sanitizeFileName(fileName, format);

  try {
    let buffer: Buffer;
    if (format === "docx") {
      buffer = await buildDocx(contentRaw, title);
    } else if (format === "xlsx") {
      buffer = await buildXlsx(contentRaw || '{"headers":["Column1"],"rows":[]}');
    } else if (format === "json") {
      // pretty-print if valid JSON
      let out = contentRaw;
      try {
        out = JSON.stringify(JSON.parse(contentRaw), null, 2);
      } catch {
        /* keep as-is */
      }
      buffer = Buffer.from(out, "utf-8");
    } else if (format === "html" || format === "svg") {
      const html = contentRaw.includes("<html")
        ? contentRaw
        : format === "svg"
          ? contentRaw
          : `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${
            title || fileName
          }</title></head><body><pre style="font-family:system-ui,sans-serif;white-space:pre-wrap">${escapeHtml(
            contentRaw
          )}</pre></body></html>`;
      buffer = Buffer.from(html, "utf-8");
    } else {
      // txt, md, csv
      buffer = Buffer.from(contentRaw, "utf-8");
    }

    if (buffer.byteLength > MAX_OUTPUT_BYTES) {
      return {
        success: false,
        error: "Generated file exceeds size limit",
      };
    }

    const payload: GeneratedFilePayload = {
      fileName,
      mimeType: MIME[format] || "application/octet-stream",
      contentBase64: buffer.toString("base64"),
      sizeBytes: buffer.byteLength,
      format,
    };

    return {
      success: true,
      data: {
        status: "generated",
        fileName: payload.fileName,
        format: payload.format,
        mimeType: payload.mimeType,
        sizeBytes: payload.sizeBytes,
        /** UI uses this to offer a Download button — do not paste base64 into chat */
        contentBase64: payload.contentBase64,
        message: `File ready: ${payload.fileName} (${payload.sizeBytes} bytes). The app will show a Download button under this message.`,
      },
      metadata: {
        source: "generate_file",
        format,
        fileName: payload.fileName,
        generatedFile: true,
      },
    };
  } catch (err) {
    console.error("[generate_file]", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to generate file",
    };
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Extract file payload from tool result for API response */
export function extractGeneratedFileFromToolData(
  data: unknown
): GeneratedFilePayload | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (d.status !== "generated" || !d.contentBase64 || !d.fileName) return null;
  return {
    fileName: String(d.fileName),
    mimeType: String(d.mimeType || "application/octet-stream"),
    contentBase64: String(d.contentBase64),
    sizeBytes: Number(d.sizeBytes) || 0,
    format: String(d.format || ""),
  };
}
