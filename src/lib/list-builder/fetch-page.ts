/**
 * Lightweight page fetch for list-builder (server-only).
 */

const FETCH_TIMEOUT_MS = 12000;
const MAX_CHARS = 12000;

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
    if (body.length > MAX_CHARS) body = body.slice(0, MAX_CHARS);
    return { url: res.url || parsed.toString(), title, text: body };
  } catch (err: any) {
    return { error: err?.name === 'AbortError' ? 'Timeout' : err?.message || 'Fetch failed' };
  } finally {
    clearTimeout(timer);
  }
}
