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

/**
 * Parse plain / semi-HTML description into structured blocks.
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

  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line) {
      i++;
      continue;
    }

    if (looksLikeHeading(line) && !isBulletLine(line) && !isNumberedLine(line)) {
      blocks.push({ type: "h", text: line.replace(/:$/, "") });
      i++;
      continue;
    }

    if (isBulletLine(line)) {
      const items: string[] = [];
      while (i < lines.length) {
        const L = lines[i].trim();
        if (!L) {
          // blank line ends list only if next isn't still a bullet
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
