/**
 * Fetch Website Tool
 *
 * Server-side page fetch + text extraction so the AI assistant can read
 * company sites without Tavily or any third-party search API key.
 *
 * @serverOnly
 */

import { ToolResult, ToolContext, ToolParams } from "./types";

export const FETCH_WEBSITE_TOOL_NAME = "fetch_website";
export const FETCH_WEBSITE_TOOL_DESCRIPTION =
  "Fetch and read a public website by URL (homepage, About page, careers, LinkedIn company page text, etc.). " +
  "Use when the user gives a website link or asks you to examine / research a company site. " +
  "Returns page title and cleaned main text. Prefer this over claiming you cannot browse URLs.";

const MAX_CHARS = 14000;
const FETCH_TIMEOUT_MS = 12000;
const MAX_BYTES = 2_000_000;

export interface FetchWebsiteParams {
  url?: string;
  query?: string; // accepted as URL alias for ToolParams compatibility
}

export interface FetchWebsiteResultData {
  url: string;
  finalUrl: string;
  title: string;
  text: string;
  truncated: boolean;
  contentType?: string;
}

function extractUrl(params: ToolParams | FetchWebsiteParams): string | null {
  const raw =
    (params as FetchWebsiteParams).url ||
    (params as ToolParams).query ||
    "";
  const s = String(raw || "").trim();
  if (!s) return null;

  // Bare domain → https
  if (/^[a-z0-9][a-z0-9.-]+\.[a-z]{2,}(\/.*)?$/i.test(s) && !s.includes(" ")) {
    return `https://${s}`;
  }

  // Pull first URL from free text
  const m = s.match(/https?:\/\/[^\s<>"')\]]+/i);
  if (m) return m[0].replace(/[.,;:!?)]+$/, "");

  if (/^https?:\/\//i.test(s)) return s;
  return null;
}

function isBlockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, "");
  if (
    h === "localhost" ||
    h === "0.0.0.0" ||
    h === "::1" ||
    h.endsWith(".local") ||
    h.endsWith(".internal") ||
    h === "metadata.google.internal"
  ) {
    return true;
  }
  // IPv4 private / loopback / link-local / cloud metadata
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) {
    const parts = h.split(".").map(Number);
    const [a, b] = parts;
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
  }
  return false;
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => {
      const code = parseInt(n, 10);
      return Number.isFinite(code) ? String.fromCharCode(code) : "";
    });
}

function htmlToText(html: string): { title: string; text: string } {
  let title = "";
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch) {
    title = decodeHtmlEntities(titleMatch[1].replace(/\s+/g, " ").trim());
  }
  // Prefer og:title if present
  const og = html.match(
    /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i
  ) || html.match(
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i
  );
  if (og?.[1]) title = decodeHtmlEntities(og[1].trim()) || title;

  let body = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");

  // Prefer main/article content when present
  const mainMatch =
    body.match(/<main[^>]*>([\s\S]*?)<\/main>/i) ||
    body.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
  if (mainMatch) body = mainMatch[1];

  body = body
    .replace(/<\/(p|div|h[1-6]|li|tr|section|br|hr)[^>]*>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ");

  body = decodeHtmlEntities(body)
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();

  return { title, text: body };
}

/**
 * Execute website fetch
 */
export async function executeFetchWebsite(
  params: ToolParams,
  _context: ToolContext
): Promise<ToolResult> {
  const urlStr = extractUrl(params);
  if (!urlStr) {
    return {
      success: false,
      error:
        "A valid URL is required (e.g. https://example.com or example.com). Pass url or query.",
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(urlStr);
  } catch {
    return { success: false, error: `Invalid URL: ${urlStr}` };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return {
      success: false,
      error: "Only http and https URLs are allowed",
    };
  }

  if (isBlockedHost(parsed.hostname)) {
    return {
      success: false,
      error: "That host cannot be fetched for security reasons",
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(parsed.toString(), {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; TrioRecruitingBot/1.0; +https://trio-recruiting.app)",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.5",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });

    if (!response.ok) {
      return {
        success: false,
        error: `Failed to fetch page: HTTP ${response.status}`,
        metadata: { status: response.status, url: parsed.toString() },
      };
    }

    // Re-check redirects didn't land on private hosts
    const finalUrl = response.url || parsed.toString();
    try {
      const finalHost = new URL(finalUrl).hostname;
      if (isBlockedHost(finalHost)) {
        return {
          success: false,
          error: "Redirect target is not allowed",
        };
      }
    } catch {
      /* ignore */
    }

    const contentType = response.headers.get("content-type") || "";
    const buf = await response.arrayBuffer();
    if (buf.byteLength > MAX_BYTES) {
      return {
        success: false,
        error: "Page is too large to fetch",
        metadata: { bytes: buf.byteLength },
      };
    }

    const raw = new TextDecoder("utf-8", { fatal: false }).decode(buf);

    // Non-HTML: return a slice of raw text
    if (
      contentType &&
      !/text\/html|application\/xhtml|text\/plain|application\/xml|text\/xml/i.test(
        contentType
      )
    ) {
      const slice = raw.slice(0, MAX_CHARS);
      return {
        success: true,
        data: {
          url: parsed.toString(),
          finalUrl,
          title: "",
          text: slice,
          truncated: raw.length > MAX_CHARS,
          contentType,
        } satisfies FetchWebsiteResultData,
        metadata: { source: "fetch_website", contentType },
      };
    }

    const { title, text } = htmlToText(raw);
    if (!text || text.length < 40) {
      return {
        success: false,
        error:
          "Could not extract readable text from that page (may be heavily JavaScript-rendered or blocked). Try the About page URL or paste text from the site.",
        metadata: { url: finalUrl, title },
      };
    }

    const truncated = text.length > MAX_CHARS;
    const out = truncated ? text.slice(0, MAX_CHARS) + "\n…[truncated]" : text;

    return {
      success: true,
      data: {
        url: parsed.toString(),
        finalUrl,
        title: title || "(no title)",
        text: out,
        truncated,
        contentType: contentType || "text/html",
      } satisfies FetchWebsiteResultData,
      metadata: { source: "fetch_website", chars: out.length },
    };
  } catch (err) {
    const message =
      err instanceof Error
        ? err.name === "AbortError"
          ? "Website request timed out"
          : err.message
        : "Failed to fetch website";
    console.error("[fetch_website]", message);
    return {
      success: false,
      error: message,
      metadata: { type: "exception" },
    };
  } finally {
    clearTimeout(timer);
  }
}

export function formatFetchWebsiteResult(data: FetchWebsiteResultData): string {
  const lines = [
    `URL: ${data.finalUrl || data.url}`,
    data.title ? `Title: ${data.title}` : null,
    data.truncated ? "(content truncated)" : null,
    "",
    data.text,
  ].filter((x) => x !== null) as string[];
  return lines.join("\n");
}
