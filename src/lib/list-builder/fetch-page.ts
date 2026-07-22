/**
 * Lightweight page fetch for list-builder (server-only).
 */

const FETCH_TIMEOUT_MS = 8_000;
const MAX_CHARS = 12_000;

const JUNK_EMAIL =
  /noreply|no-reply|donotreply|privacy@|support@example|sentry\.io|wixpress|cloudflare|schema\.org|example\.com|domain\.com|email\.com|your@|placeholder/i;

/** Pull public emails / phones from raw page text (no inventing). */
export function extractContactSignals(text: string): {
  emails: string[];
  phones: string[];
} {
  const emails = new Set<string>();
  const phones = new Set<string>();
  const emailRe = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  for (const m of text.match(emailRe) || []) {
    const e = m.toLowerCase();
    if (JUNK_EMAIL.test(e)) continue;
    if (e.endsWith('.png') || e.endsWith('.jpg') || e.endsWith('.gif')) continue;
    emails.add(e);
  }
  // US-style phones
  const phoneRe =
    /(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}\b/g;
  for (const m of text.match(phoneRe) || []) {
    const digits = (m.match(/\d/g) || []).join('');
    if (digits.length < 10 || digits.length > 11) continue;
    // Drop obvious non-phones (years, ids)
    if (/^20\d{2}/.test(digits)) continue;
    phones.add(m.trim());
  }
  return { emails: [...emails].slice(0, 8), phones: [...phones].slice(0, 8) };
}

export async function fetchPageText(
  urlInput: string
): Promise<{ url: string; title: string; text: string } | { error: string }> {
  let url = (urlInput || '').trim();
  if (!url) return { error: 'No URL' };
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { error: 'Invalid URL' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(parsed.toString(), {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'TrioSourcingBot/1.0 (+https://turnkey-optimization.vercel.app; list-builder)',
        Accept: 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
    });
    if (!res.ok) return { error: `HTTP ${res.status}` };
    const html = await res.text();
    // Prefer mailto: / tel: before stripping tags
    const mailto = [
      ...html.matchAll(/mailto:([^"'?\s>]+)/gi),
    ].map((m) => decodeURIComponent(m[1]).split('?')[0]);
    const tel = [
      ...html.matchAll(/tel:([^"'\s>]+)/gi),
    ].map((m) => decodeURIComponent(m[1]));

    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = titleMatch
      ? titleMatch[1].replace(/\s+/g, ' ').trim()
      : '';
    let body = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    // Re-inject structured contacts so regex can see them
    if (mailto.length) body += ' ' + mailto.join(' ');
    if (tel.length) body += ' ' + tel.join(' ');
    if (body.length > MAX_CHARS) body = body.slice(0, MAX_CHARS);
    return { url: res.url || parsed.toString(), title, text: body };
  } catch (err: any) {
    return { error: err?.name === 'AbortError' ? 'Timeout' : err?.message || 'Fetch failed' };
  } finally {
    clearTimeout(timer);
  }
}

/** Homepage + common contact paths (stops early when email+phone found). */
export async function fetchCompanyContactPages(
  website: string
): Promise<{ url: string; title: string; text: string } | { error: string }> {
  let base = (website || '').trim();
  if (!base) return { error: 'No URL' };
  if (!/^https?:\/\//i.test(base)) base = `https://${base}`;

  let origin: string;
  try {
    origin = new URL(base).origin;
  } catch {
    return { error: 'Invalid URL' };
  }

  const paths = ['', '/contact', '/contact-us', '/about', '/about-us'];
  let combined = '';
  let bestUrl = base;
  let bestTitle = '';

  for (const path of paths) {
    const page = await fetchPageText(path ? `${origin}${path}` : base);
    if ('error' in page) continue;
    bestUrl = page.url || bestUrl;
    bestTitle = page.title || bestTitle;
    combined += `\n${page.text}`;
    const sig = extractContactSignals(combined);
    if (sig.emails.length && sig.phones.length) {
      return {
        url: bestUrl,
        title: bestTitle,
        text: combined.slice(0, MAX_CHARS),
      };
    }
  }

  if (!combined.trim()) return { error: 'No pages fetched' };
  return {
    url: bestUrl,
    title: bestTitle,
    text: combined.slice(0, MAX_CHARS),
  };
}
