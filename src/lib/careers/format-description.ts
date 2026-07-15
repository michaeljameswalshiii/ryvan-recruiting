/**
 * Format job descriptions for public careers pages.
 * Preserves bullets / numbered lists so postings stay readable.
 */

export type DescBlock =
  | { type: "p"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "h"; text: string };

/** Strip simple HTML to plain text while keeping line breaks for structure */
function htmlToRoughText(input: string): string {
  let s = input;
  s = s.replace(/<\s*br\s*\/?>/gi, "\n");
  s = s.replace(/<\/\s*p\s*>/gi, "\n\n");
  s = s.replace(/<\/\s*div\s*>/gi, "\n");
  s = s.replace(/<\/\s*h[1-6]\s*>/gi, "\n\n");
  s = s.replace(/<\s*li[^>]*>/gi, "\n• ");
  s = s.replace(/<\/\s*li\s*>/gi, "");
  s = s.replace(/<\/\s*(ul|ol)\s*>/gi, "\n\n");
  s = s.replace(/<\s*\/?\s*(ul|ol|p|div|span|strong|b|em|i|a|h[1-6])[^>]*>/gi, "");
  s = s.replace(/<[^>]+>/g, "");
  s = s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  return s;
}

function isBulletLine(line: string): boolean {
  return /^([•·▪◦●\-\*–—]|\u2022)\s+/.test(line) || /^[•·▪◦●]\s*/.test(line);
}

function isNumberedLine(line: string): boolean {
  return /^\d+[\.\)]\s+/.test(line);
}

function stripBullet(line: string): string {
  return line
    .replace(/^([•·▪◦●\-\*–—]|\u2022)\s+/, "")
    .replace(/^[•·▪◦●]\s*/, "")
    .trim();
}

function stripNumber(line: string): string {
  return line.replace(/^\d+[\.\)]\s+/, "").trim();
}

function looksLikeHeading(line: string): boolean {
  const t = line.trim();
  if (t.length < 3 || t.length > 80) return false;
  if (isBulletLine(t) || isNumberedLine(t)) return false;
  // Short line ending with colon, or ALL CAPS section titles
  if (/:$/.test(t) && t.length < 60) return true;
  if (t === t.toUpperCase() && /[A-Z]/.test(t) && t.split(/\s+/).length <= 8) {
    return true;
  }
  // Common JD section headers
  return /^(responsibilities|requirements|qualifications|about (the )?role|what you.ll do|benefits|who you are|the role|overview|summary|must have|nice to have)\b/i.test(
    t
  );
}

/** Section titles that usually introduce a list of duties/requirements */
function isListSectionHeading(line: string): boolean {
  return /^(key\s+)?responsibilities|requirements|qualifications|what you.?ll do|duties|must have|nice to have|strongly preferred|preferred|required|benefits|about (the )?role|the role|overview|summary|who you are|skills|experience\b/i.test(
    line.replace(/:$/, "").trim()
  );
}

/**
 * Parse plain / semi-HTML description into structured blocks.
 * Also treats plain newline-separated items under a section heading as bullets
 * (common when JD text has no • characters).
 */
export function parseJobDescription(raw: string): DescBlock[] {
  if (!raw || !raw.trim()) return [];

  let text = raw.includes("<") ? htmlToRoughText(raw) : raw;
  text = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  // Normalize fancy bullets
  text = text.replace(/[\u2022\u2023\u25E6\u2043\u2219]/g, "•");

  const lines = text.split("\n").map((l) => l.trimEnd());
  const blocks: DescBlock[] = [];
  let i = 0;
  /** After a list-style heading, plain lines become bullets */
  let listMode = false;

  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line) {
      // Double blank often ends a list section
      const next = lines[i + 1]?.trim() || "";
      if (listMode && !next) listMode = false;
      i++;
      continue;
    }

    if (looksLikeHeading(line) && !isBulletLine(line) && !isNumberedLine(line)) {
      blocks.push({ type: "h", text: line.replace(/:$/, "") });
      listMode = isListSectionHeading(line);
      i++;
      continue;
    }

    if (isBulletLine(line)) {
      listMode = false;
      const items: string[] = [];
      while (i < lines.length) {
        const L = lines[i].trim();
        if (!L) {
          const next = lines[i + 1]?.trim() || "";
          if (!next || !isBulletLine(next)) break;
          i++;
          continue;
        }
        if (!isBulletLine(L)) break;
        items.push(stripBullet(L));
        i++;
      }
      if (items.length) blocks.push({ type: "ul", items });
      continue;
    }

    if (isNumberedLine(line)) {
      listMode = false;
      const items: string[] = [];
      while (i < lines.length) {
        const L = lines[i].trim();
        if (!L) {
          const next = lines[i + 1]?.trim() || "";
          if (!next || !isNumberedLine(next)) break;
          i++;
          continue;
        }
        if (!isNumberedLine(L)) break;
        items.push(stripNumber(L));
        i++;
      }
      if (items.length) blocks.push({ type: "ol", items });
      continue;
    }

    // Under Responsibilities/Requirements/etc., each line is a bullet
    if (listMode) {
      const items: string[] = [];
      while (i < lines.length) {
        const L = lines[i].trim();
        if (!L) {
          // stop list on blank line if next is heading or end
          const next = lines[i + 1]?.trim() || "";
          if (!next || looksLikeHeading(next)) {
            listMode = false;
            break;
          }
          i++;
          continue;
        }
        if (looksLikeHeading(L) || isBulletLine(L) || isNumberedLine(L)) {
          break;
        }
        // Short sub-headings like "Required" / "Strongly Preferred"
        if (
          L.length < 40 &&
          /^(required|preferred|strongly preferred|nice to have|must have|minimum|bonus)\b/i.test(
            L
          )
        ) {
          if (items.length) {
            blocks.push({ type: "ul", items: [...items] });
            items.length = 0;
          }
          blocks.push({ type: "h", text: L.replace(/:$/, "") });
          i++;
          continue;
        }
        items.push(L);
        i++;
      }
      if (items.length) blocks.push({ type: "ul", items });
      continue;
    }

    // Paragraph: gather consecutive non-empty non-list lines
    const para: string[] = [line];
    i++;
    while (i < lines.length) {
      const L = lines[i].trim();
      if (!L) break;
      if (isBulletLine(L) || isNumberedLine(L) || looksLikeHeading(L)) break;
      para.push(L);
      i++;
    }
    blocks.push({ type: "p", text: para.join(" ") });
  }

  return blocks;
}

/**
 * Remove client company names from public-facing title/description text.
 */
export function redactCompanyNames(
  text: string,
  companyNames: Array<string | undefined | null>
): string {
  let out = text || "";
  const names = companyNames
    .filter((n): n is string => !!n && n.trim().length >= 2)
    .map((n) => n.trim())
    // longest first so "Auxilio Partners" beats "Auxilio"
    .sort((a, b) => b.length - a.length);

  for (const name of names) {
    // Escape regex special chars
    const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Possessive / plain forms
    const re = new RegExp(`\\b${esc}(?:['’]s)?\\b`, "gi");
    out = out.replace(re, "our client");
  }

  // Clean awkward doubles
  out = out
    .replace(/\bour client(?:['’]s)?\s+our client(?:['’]s)?\b/gi, "our client")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;:])/g, "$1");

  return out;
}

/** Plain-text preview for cards (first paragraph / lines, no raw bullets mess) */
export function descriptionPreview(raw: string, maxLen = 180): string {
  const blocks = parseJobDescription(raw);
  const parts: string[] = [];
  for (const b of blocks) {
    if (b.type === "p" || b.type === "h") parts.push(b.text);
    if (b.type === "ul" || b.type === "ol") {
      parts.push(b.items.slice(0, 2).map((x) => `• ${x}`).join(" "));
    }
    if (parts.join(" ").length > maxLen) break;
  }
  const s = parts.join(" ").replace(/\s+/g, " ").trim();
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen - 1).trimEnd() + "…";
}
