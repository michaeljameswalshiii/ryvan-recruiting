/**
 * Allowlist HTML sanitizer for job descriptions (Google Docs / Word paste).
 * Keeps structure + bold/italic/lists; strips scripts, styles, classes, links-as-scripts.
 */

const ALLOWED_TAGS = new Set([
  'p',
  'br',
  'div',
  'span',
  'strong',
  'b',
  'em',
  'i',
  'u',
  'ul',
  'ol',
  'li',
  'h1',
  'h2',
  'h3',
  'h4',
  'blockquote',
]);

/** True if string looks like HTML markup (not just angle brackets in text). */
export function looksLikeHtml(s: string): boolean {
  if (!s || !s.includes('<')) return false;
  return /<\/?(p|div|br|ul|ol|li|strong|b|em|i|h[1-6]|span)\b/i.test(s);
}

/**
 * Convert Google Docs / Word clipboard HTML into clean semantic HTML.
 */
export function sanitizeJobHtml(dirty: string): string {
  if (!dirty || !dirty.trim()) return '';

  let s = dirty
    // Drop XML / Office junk
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<\/?o:p[^>]*>/gi, '')
    .replace(/<\/?w:[^>]*>/gi, '')
    .replace(/<\/?m:[^>]*>/gi, '')
    .replace(/<meta[^>]*>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<xml[\s\S]*?<\/xml>/gi, '')
    // Normalize NBSP and smart punctuation
    .replace(/\u00a0/g, ' ')
    .replace(/[\u2013\u2014]/g, '–')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"');

  // Browser path when available
  if (typeof DOMParser !== 'undefined') {
    try {
      return sanitizeWithDom(s);
    } catch {
      /* fall through */
    }
  }

  return sanitizeWithRegex(s);
}

function sanitizeWithDom(html: string): string {
  const doc = new DOMParser().parseFromString(
    `<div id="root">${html}</div>`,
    'text/html'
  );
  const root = doc.getElementById('root');
  if (!root) return sanitizeWithRegex(html);

  // Google Docs often uses bold via font-weight or <b style="font-weight:700">
  promoteStyledBoldItalic(root);

  const out = walk(root);
  return cleanupEmpty(out)
    .replace(/\n{3,}/g, '\n')
    .trim();
}

function promoteStyledBoldItalic(root: Element): void {
  const all = root.querySelectorAll('[style]');
  all.forEach((el) => {
    const style = (el.getAttribute('style') || '').toLowerCase();
    const fw = /font-weight\s*:\s*(bold|[6-9]00)/i.test(style);
    const it = /font-style\s*:\s*italic/i.test(style);
    if (fw && el.tagName.toLowerCase() !== 'strong' && el.tagName.toLowerCase() !== 'b') {
      wrapContents(el, 'strong');
    }
    if (it && el.tagName.toLowerCase() !== 'em' && el.tagName.toLowerCase() !== 'i') {
      wrapContents(el, 'em');
    }
  });
}

function wrapContents(el: Element, tag: string): void {
  const doc = el.ownerDocument;
  if (!doc) return;
  const wrapper = doc.createElement(tag);
  while (el.firstChild) wrapper.appendChild(el.firstChild);
  el.appendChild(wrapper);
}

function walk(node: Node): string {
  if (node.nodeType === 3) {
    return escapeText(node.textContent || '');
  }
  if (node.nodeType !== 1) return '';

  const el = node as Element;
  const tag = el.tagName.toLowerCase();

  if (tag === 'br') return '<br>';

  // Convert headings
  if (/^h[1-6]$/.test(tag)) {
    const inner = childrenHtml(el);
    if (!inner.trim()) return '';
    const level = tag === 'h1' || tag === 'h2' ? 'h2' : 'h3';
    return `<${level}>${inner}</${level}>`;
  }

  if (tag === 'strong' || tag === 'b') {
    const inner = childrenHtml(el);
    return inner ? `<strong>${inner}</strong>` : '';
  }
  if (tag === 'em' || tag === 'i') {
    const inner = childrenHtml(el);
    return inner ? `<em>${inner}</em>` : '';
  }
  if (tag === 'u') {
    const inner = childrenHtml(el);
    return inner ? `<u>${inner}</u>` : '';
  }

  if (tag === 'ul' || tag === 'ol') {
    const items: string[] = [];
    el.querySelectorAll(':scope > li').forEach((li) => {
      const inner = childrenHtml(li).trim();
      if (inner) items.push(`<li>${inner}</li>`);
    });
    // Docs sometimes nests weirdly — grab any li
    if (!items.length) {
      el.querySelectorAll('li').forEach((li) => {
        const inner = childrenHtml(li).trim();
        if (inner) items.push(`<li>${inner}</li>`);
      });
    }
    if (!items.length) return '';
    return `<${tag}>${items.join('')}</${tag}>`;
  }

  if (tag === 'li') {
    const inner = childrenHtml(el).trim();
    return inner ? `<li>${inner}</li>` : '';
  }

  if (tag === 'p' || tag === 'div' || tag === 'span' || tag === 'blockquote') {
    const inner = childrenHtml(el);
    // Span: unwrap
    if (tag === 'span') return inner;
    // Empty block
    if (!inner.replace(/<br\s*\/?>/gi, '').trim()) return '';
    // Prefer p for block content
    if (tag === 'div' || tag === 'blockquote') {
      // If only inline content, wrap as p
      if (!/<(ul|ol|p|h[1-6])\b/i.test(inner)) {
        return `<p>${inner}</p>`;
      }
      return inner;
    }
    return `<p>${inner}</p>`;
  }

  if (ALLOWED_TAGS.has(tag)) {
    return childrenHtml(el);
  }

  // Unknown tag: keep text/children only
  return childrenHtml(el);
}

function childrenHtml(el: Element): string {
  let out = '';
  el.childNodes.forEach((child) => {
    out += walk(child);
  });
  return out;
}

function escapeText(t: string): string {
  return t
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function cleanupEmpty(html: string): string {
  return html
    .replace(/<p>\s*<\/p>/gi, '')
    .replace(/<p><br\s*\/?><\/p>/gi, '')
    .replace(/(<br\s*\/?>\s*){3,}/gi, '<br><br>')
    .replace(/\s+<\/(p|li|h[1-6])>/gi, '</$1>')
    .trim();
}

/** Fallback when DOMParser unavailable (SSR) */
function sanitizeWithRegex(html: string): string {
  let s = html;
  s = s.replace(/<\/?(script|style|iframe|object|embed|form|input|button)[^>]*>/gi, '');
  // Keep only allowed tags — strip attributes
  s = s.replace(/<\/?([a-z0-9]+)(\s[^>]*)?>/gi, (match, tag: string) => {
    const t = tag.toLowerCase();
    const closing = match.startsWith('</');
    if (t === 'br') return '<br>';
    if (!ALLOWED_TAGS.has(t)) return '';
    if (closing) {
      if (t === 'b') return '</strong>';
      if (t === 'i') return '</em>';
      if (t === 'h1' || t === 'h4' || t === 'h5' || t === 'h6') return '</h3>';
      if (t === 'h2') return '</h2>';
      return `</${t === 'div' || t === 'span' ? 'p' : t}>`;
    }
    if (t === 'b' || t === 'strong') return '<strong>';
    if (t === 'i' || t === 'em') return '<em>';
    if (t === 'h1' || t === 'h2') return '<h2>';
    if (t === 'h3' || t === 'h4' || t === 'h5' || t === 'h6') return '<h3>';
    if (t === 'div' || t === 'span' || t === 'blockquote') return t === 'span' ? '' : '<p>';
    return `<${t}>`;
  });
  return cleanupEmpty(s);
}

/**
 * Plain-text (• bullets, headings) → simple HTML for the editor.
 */
export function plainTextToJobHtml(plain: string): string {
  if (!plain || !plain.trim()) return '';
  if (looksLikeHtml(plain)) return sanitizeJobHtml(plain);

  const lines = plain.replace(/\r\n/g, '\n').split('\n');
  const parts: string[] = [];
  let listItems: string[] = [];
  let listType: 'ul' | 'ol' | null = null;

  const flushList = () => {
    if (listItems.length && listType) {
      parts.push(
        `<${listType}>${listItems.map((i) => `<li>${escapeText(i)}</li>`).join('')}</${listType}>`
      );
    }
    listItems = [];
    listType = null;
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flushList();
      continue;
    }
    if (/^([•·▪◦●\-\*–—]|\u2022)\s+/.test(line) || /^[•·▪◦●]\s*\S/.test(line)) {
      if (listType && listType !== 'ul') flushList();
      listType = 'ul';
      listItems.push(
        line
          .replace(/^([•·▪◦●\-\*–—]|\u2022)\s+/, '')
          .replace(/^[•·▪◦●]\s*/, '')
          .trim()
      );
      continue;
    }
    if (/^\d+[\.\)]\s+\S/.test(line)) {
      if (listType && listType !== 'ol') flushList();
      listType = 'ol';
      listItems.push(line.replace(/^\d+[\.\)]\s+/, '').trim());
      continue;
    }
    flushList();
    // Heading heuristic (ALL CAPS or ends with :)
    if (
      (line === line.toUpperCase() && /[A-Z]/.test(line) && line.length < 80) ||
      (/:$/.test(line) && line.length < 60)
    ) {
      parts.push(`<h3>${escapeText(line.replace(/:$/, ''))}</h3>`);
    } else {
      parts.push(`<p>${escapeText(line)}</p>`);
    }
  }
  flushList();
  return parts.join('');
}

/** HTML → plain text for previews / search that need text only */
export function jobHtmlToPlainText(html: string): string {
  if (!html) return '';
  if (!looksLikeHtml(html)) return html;
  return html
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/\s*p\s*>/gi, '\n\n')
    .replace(/<\/\s*h[1-6]\s*>/gi, '\n\n')
    .replace(/<\s*li[^>]*>/gi, '\n• ')
    .replace(/<\/\s*li\s*>/gi, '')
    .replace(/<\/\s*(ul|ol)\s*>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
