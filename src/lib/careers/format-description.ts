/**
 * Format job descriptions for public careers pages.
 * Preserves bullets / numbered lists so postings stay readable.
 *
 * Handles common source messiness:
 * - Soft-wrapped lines mid-sentence (merge continuations)
 * - Headings like RESPONSIBILITIES / QUALIFICATIONS
 * - Plain lines under a section heading treated as bullets
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
  s = s.replace(/<\/\s*li\s*>/gi, "\n");
  s = s.replace(/<\/\s*(ul|ol)\s*>/gi, "\n\n");
  s = s.replace(
    /<\s*\/?\s*(ul|ol|p|div|span|strong|b|em|i|a|h[1-6])[^>]*>/gi,
    ""
  );
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
  return (
    /^([•·▪◦●\-\*–—]|\u2022)\s+\S/.test(line) || /^[•·▪◦●]\s*\S/.test(line)
  );
}

function isNumberedLine(line: string): boolean {
  return /^\d+[\.\)]\s+\S/.test(line);
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
  if (/:$/.test(t) && t.length < 60) return true;
  if (t === t.toUpperCase() && /[A-Z]/.test(t) && t.split(/\s+/).length <= 8) {
    return true;
  }
  return /^(responsibilities|requirements|qualifications|about (the )?role|what you.ll do|benefits|who you are|the role|overview|summary|must have|nice to have)\b/i.test(
    t
  );
}

function isListSectionHeading(line: string): boolean {
  return /^(key\s+)?responsibilities|requirements|qualifications|what you.?ll do|duties|must have|nice to have|strongly preferred|preferred|required|benefits|about (the )?role|the role|overview|summary|who you are|skills|experience\b/i.test(
    line.replace(/:$/, "").trim()
  );
}

/** Collapse internal whitespace; fix space before punctuation */
function cleanItemText(s: string): string {
  return s
    .replace(/[ \t]+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/([(\[])\s+/g, "$1")
    .replace(/\s+([)\]])/g, "$1")
    .trim();
}

/**
 * True if `next` looks like a soft-wrap continuation of `prev`
 * (not a new list item / heading / sentence start).
 */
function isContinuation(prev: string, next: string): boolean {
  if (!prev || !next) return false;
  if (isBulletLine(next) || isNumberedLine(next) || looksLikeHeading(next)) {
    return false;
  }
  // New sentence starting with capital after end punctuation → new item
  if (/[.!?]"?$/.test(prev.trim()) && /^[A-Z]/.test(next.trim())) {
    return false;
  }
  // Next starts lowercase, digit mid-phrase, or open paren → continuation
  if (/^[a-z0-9(]/.test(next.trim())) return true;
  // Previous ends mid-phrase (comma, colon, or no terminal punct)
  if (/[,;:]$/.test(prev.trim())) return true;
  if (!/[.!?]$/.test(prev.trim()) && next.trim().length > 0) {
    // Prefer merge when previous is long-ish fragment (soft wrap)
    if (prev.trim().length > 40) return true;
    // Short previous without period often still a wrap ("Configure and implement")
    if (!/^[A-Z][a-z]+$/.test(prev.trim())) return true;
  }
  return false;
}

/**
 * Pre-pass: join soft-wrapped lines so mid-sentence breaks don't become
 * separate bullets.
 */
function joinSoftWraps(lines: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const cur = raw.trim();
    if (!cur) {
      out.push("");
      continue;
    }
    if (out.length === 0) {
      out.push(cur);
      continue;
    }
    // Find last non-empty output line
    let j = out.length - 1;
    while (j >= 0 && !out[j].trim()) j--;
    if (j < 0) {
      out.push(cur);
      continue;
    }
    const prev = out[j];
    // Don't join across blank (paragraph break) unless clearly a wrap
    const hadBlank = j < out.length - 1;
    if (hadBlank) {
      out.push(cur);
      continue;
    }
    if (isContinuation(prev, cur)) {
      out[j] = cleanItemText(`${prev} ${cur}`);
    } else {
      out.push(cur);
    }
  }
  return out;
}

/**
 * Parse plain / semi-HTML description into structured blocks.
 */
export function parseJobDescription(raw: string): DescBlock[] {
  if (!raw || !raw.trim()) return [];

  let text = raw.includes("<") ? htmlToRoughText(raw) : raw;
  text = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  text = text.replace(/[\u2022\u2023\u25E6\u2043\u2219]/g, "•");

  let lines = text.split("\n").map((l) => l.trimEnd());
  lines = joinSoftWraps(lines);

  const blocks: DescBlock[] = [];
  let i = 0;
  let listMode = false;

  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line) {
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
          if (!next || (!isBulletLine(next) && !isContinuation(items[items.length - 1] || "", next))) {
            break;
          }
          i++;
          continue;
        }
        if (isBulletLine(L)) {
          items.push(cleanItemText(stripBullet(L)));
          i++;
          continue;
        }
        // Continuation of previous bullet (soft wrap without bullet glyph)
        if (
          items.length &&
          isContinuation(items[items.length - 1], L) &&
          !looksLikeHeading(L) &&
          !isNumberedLine(L)
        ) {
          items[items.length - 1] = cleanItemText(
            `${items[items.length - 1]} ${L}`
          );
          i++;
          continue;
        }
        break;
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
        if (isNumberedLine(L)) {
          items.push(cleanItemText(stripNumber(L)));
          i++;
          continue;
        }
        if (
          items.length &&
          isContinuation(items[items.length - 1], L) &&
          !looksLikeHeading(L) &&
          !isBulletLine(L)
        ) {
          items[items.length - 1] = cleanItemText(
            `${items[items.length - 1]} ${L}`
          );
          i++;
          continue;
        }
        break;
      }
      if (items.length) blocks.push({ type: "ol", items });
      continue;
    }

    // Under Responsibilities/Requirements/etc., each non-continuation line is a bullet
    if (listMode) {
      const items: string[] = [];
      while (i < lines.length) {
        const L = lines[i].trim();
        if (!L) {
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
        if (items.length && isContinuation(items[items.length - 1], L)) {
          items[items.length - 1] = cleanItemText(
            `${items[items.length - 1]} ${L}`
          );
        } else {
          items.push(cleanItemText(L));
        }
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
    blocks.push({ type: "p", text: cleanItemText(para.join(" ")) });
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
  const expanded: string[] = [];

  for (const n of companyNames) {
    if (!n || n.trim().length < 2) continue;
    const full = n.trim();
    expanded.push(full);
    const first = full.split(/\s+/)[0];
    if (
      first &&
      first.length >= 4 &&
      !/^(the|and|inc|llc|ltd|corp)$/i.test(first)
    ) {
      expanded.push(first);
    }
  }

  const names = [...new Set(expanded)].sort((a, b) => b.length - a.length);

  for (const name of names) {
    const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(
      `\\b${esc}(?:[''\u2019\u2018]s|\\?\\?s)?\\b`,
      "gi"
    );
    out = out.replace(re, "our client");
  }

  out = out
    .replace(
      /\bour client(?:[''\u2019]s)?(?:[ \t]+our client(?:[''\u2019]s)?)+/gi,
      "our client"
    )
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+([,.;:])/g, "$1");

  return out;
}

/** Plain-text preview for cards */
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
