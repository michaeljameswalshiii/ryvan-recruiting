/**
 * Fetch Website Tool
 *
 * Server-side page fetch + text extraction so the AI assistant can read
 * company sites without Tavily or any third-party search API key.
 *
 * Hardened against bot-blocks and anti-hallucination for company creation.
 *
 * @serverOnly
 */

import { ToolResult, ToolContext, ToolParams } from "./types";
import { hostnameFrom } from "@/lib/ai/company-from-website";
import { isLinkedInProfileUrl } from "@/lib/ai/crm-write-loop";

export const FETCH_WEBSITE_TOOL_NAME = "fetch_website";
export const FETCH_WEBSITE_TOOL_DESCRIPTION =
  "Fetch and read a public website by URL (homepage, About page, careers, etc.). " +
  "Use when the user gives a website link or asks you to examine / research a company site. " +
  "Returns page title, cleaned main text, and grounding flags. " +
  "If fetch fails or text is thin, do NOT invent company details — report the error. " +
  "Prefer this over claiming you cannot browse URLs.";

const MAX_CHARS = 14000;
const FETCH_TIMEOUT_MS = 14000;
const MAX_BYTES = 2_000_000;

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
const BOT_UA =
  "Mozilla/5.0 (compatible; TrioRecruitingBot/1.1; +https://trio-recruiting.app)";

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
  /** True when page could not be read — model must not invent company facts */
  fetchFailed?: boolean;
  /** True when HTTP ok but almost no text (JS shell / block page) */
  insufficientText?: boolean;
  httpStatus?: number;
  domain?: string;
  metaDescription?: string;
  groundingNote?: string;
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

function extractMetaDescription(html: string): string {
  const patterns = [
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i,
    /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["']/i,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]?.trim()) return decodeHtmlEntities(m[1].trim());
  }
  return "";
}

function htmlToText(html: string): {
  title: string;
  text: string;
  metaDescription: string;
} {
  let title = "";
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch) {
    title = decodeHtmlEntities(titleMatch[1].replace(/\s+/g, " ").trim());
  }
  const og =
    html.match(
      /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i
    ) ||
    html.match(
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i
    );
  if (og?.[1]) title = decodeHtmlEntities(og[1].trim()) || title;

  const metaDescription = extractMetaDescription(html);

  let body = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");

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

  // Prepend meta description if body is thin
  let text = body;
  if (metaDescription && text.length < 200) {
    text = `${metaDescription}\n\n${text}`.trim();
  } else if (metaDescription && !text.includes(metaDescription.slice(0, 40))) {
    text = `${metaDescription}\n\n${text}`.trim();
  }

  return { title, text, metaDescription };
}

async function fetchOnce(
  url: string,
  userAgent: string,
  signal: AbortSignal
): Promise<{
  ok: boolean;
  status: number;
  finalUrl: string;
  contentType: string;
  raw: string;
  error?: string;
}> {
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal,
      headers: {
        "User-Agent": userAgent,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.5",
        "Accept-Language": "en-US,en;q=0.9",
        "Cache-Control": "no-cache",
      },
    });

    const finalUrl = response.url || url;
    try {
      if (isBlockedHost(new URL(finalUrl).hostname)) {
        return {
          ok: false,
          status: response.status,
          finalUrl,
          contentType: "",
          raw: "",
          error: "Redirect target is not allowed",
        };
      }
    } catch {
      /* ignore */
    }

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        finalUrl,
        contentType: response.headers.get("content-type") || "",
        raw: "",
        error: `HTTP ${response.status}`,
      };
    }

    const contentType = response.headers.get("content-type") || "";
    const buf = await response.arrayBuffer();
    if (buf.byteLength > MAX_BYTES) {
      return {
        ok: false,
        status: response.status,
        finalUrl,
        contentType,
        raw: "",
        error: "Page is too large to fetch",
      };
    }

    const raw = new TextDecoder("utf-8", { fatal: false }).decode(buf);
    return {
      ok: true,
      status: response.status,
      finalUrl,
      contentType,
      raw,
    };
  } catch (err) {
    const message =
      err instanceof Error
        ? err.name === "AbortError"
          ? "Website request timed out"
          : err.message
        : "Failed to fetch website";
    return {
      ok: false,
      status: 0,
      finalUrl: url,
      contentType: "",
      raw: "",
      error: message,
    };
  }
}

/**
 * Execute website fetch with browser UA fallback and optional About paths.
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
      data: {
        fetchFailed: true,
        groundingNote:
          "No URL — do not invent company fields. Ask the user for a valid website.",
      },
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(urlStr);
  } catch {
    return {
      success: false,
      error: `Invalid URL: ${urlStr}`,
      data: { fetchFailed: true, url: urlStr },
    };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return {
      success: false,
      error: "Only http and https URLs are allowed",
      data: { fetchFailed: true },
    };
  }

  if (isBlockedHost(parsed.hostname)) {
    return {
      success: false,
      error: "That host cannot be fetched for security reasons",
      data: { fetchFailed: true },
    };
  }

  if (isLinkedInProfileUrl(parsed.toString())) {
    return {
      success: true,
      data: {
        url: parsed.toString(),
        finalUrl: parsed.toString(),
        title: "",
        text: "",
        truncated: false,
        domain: hostnameFrom(parsed.hostname),
        fetchFailed: true,
        insufficientText: true,
        groundingNote:
          "LinkedIn profile pages cannot be scraped. Use Apollo (apollo_lookup / the APOLLO LOOKUP block) as source of truth. " +
          "Do not retry fetch_website or web_search on this URL. " +
          "If the user asked to create a company and contact, call create_company_with_primary_contact now.",
      } satisfies FetchWebsiteResultData,
      metadata: { skipped: "linkedin_profile" },
    };
  }

  const domain = hostnameFrom(parsed.hostname);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  // Candidate URLs: as given, then common About pages if homepage is thin/blocked
  const origins = [`${parsed.protocol}//${parsed.host}`];
  const pathCandidates = [
    parsed.toString(),
    `${origins[0]}/`,
    `${origins[0]}/about/`,
    `${origins[0]}/about-us/`,
    `${origins[0]}/who-we-are/`,
    `${origins[0]}/structural-engineers-about-us/who-we-are/`,
  ];
  // Dedupe preserving order
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const u of pathCandidates) {
    const k = u.replace(/\/$/, "") || u;
    if (seen.has(k)) continue;
    seen.add(k);
    urls.push(u);
  }

  try {
    let lastError = "";
    let lastStatus = 0;

    for (const tryUrl of urls) {
      // Prefer browser UA first (many contractor sites block bot UA with 403)
      for (const ua of [BROWSER_UA, BOT_UA]) {
        const res = await fetchOnce(tryUrl, ua, controller.signal);
        lastStatus = res.status;
        if (!res.ok) {
          lastError = res.error || `HTTP ${res.status}`;
          // On 403/401 try next UA; on other errors try next path
          if (res.status === 403 || res.status === 401) continue;
          break;
        }

        const contentType = res.contentType;
        if (
          contentType &&
          !/text\/html|application\/xhtml|text\/plain|application\/xml|text\/xml/i.test(
            contentType
          )
        ) {
          const slice = res.raw.slice(0, MAX_CHARS);
          return {
            success: true,
            data: {
              url: parsed.toString(),
              finalUrl: res.finalUrl,
              title: "",
              text: slice,
              truncated: res.raw.length > MAX_CHARS,
              contentType,
              domain,
              fetchFailed: false,
              insufficientText: slice.length < 40,
              groundingNote:
                "Non-HTML response. Use only this text; do not invent location or industry.",
            } satisfies FetchWebsiteResultData,
            metadata: { source: "fetch_website", contentType },
          };
        }

        const { title, text, metaDescription } = htmlToText(res.raw);
        if (!text || text.length < 40) {
          lastError =
            "Could not extract readable text (JS-rendered or blocked)";
          lastStatus = res.status;
          continue; // try next path
        }

        const truncated = text.length > MAX_CHARS;
        const out = truncated
          ? text.slice(0, MAX_CHARS) + "\n…[truncated]"
          : text;

        return {
          success: true,
          data: {
            url: parsed.toString(),
            finalUrl: res.finalUrl,
            title: title || "(no title)",
            text: out,
            truncated,
            contentType: contentType || "text/html",
            domain,
            metaDescription: metaDescription || undefined,
            fetchFailed: false,
            insufficientText: false,
            httpStatus: res.status,
            groundingNote:
              "GROUNDED: Extract company name, industry, location, and description ONLY from Title + Text below. " +
              "Never infer country from letters in the domain (e.g. structuralbr.com ≠ Brazil). " +
              "If location is not in the text, leave city/state empty.",
          } satisfies FetchWebsiteResultData,
          metadata: {
            source: "fetch_website",
            chars: out.length,
            path: tryUrl,
          },
        };
      }
    }

    // All attempts failed
    return {
      success: false,
      error:
        lastError ||
        "Failed to fetch page. Site may block automated access (403) or require JavaScript.",
      data: {
        url: parsed.toString(),
        finalUrl: parsed.toString(),
        title: "",
        text: "",
        truncated: false,
        domain,
        fetchFailed: true,
        insufficientText: true,
        httpStatus: lastStatus || undefined,
        groundingNote:
          "FETCH FAILED — Do NOT invent industry, city, state, or description. " +
          "Offer minimal company draft: name (from domain label only) + domain. " +
          "Ask user to paste About-page text or confirm minimal record. " +
          "Never map \"br\" in a brand domain to Brazil.",
      } satisfies FetchWebsiteResultData,
      metadata: {
        status: lastStatus,
        url: parsed.toString(),
        fetchFailed: true,
      },
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to fetch website";
    console.error("[fetch_website]", message);
    return {
      success: false,
      error: message,
      data: {
        url: parsed.toString(),
        finalUrl: parsed.toString(),
        title: "",
        text: "",
        truncated: false,
        domain,
        fetchFailed: true,
        groundingNote:
          "FETCH FAILED — Do not invent company fields. Minimal name+domain only.",
      } satisfies FetchWebsiteResultData,
      metadata: { type: "exception", fetchFailed: true },
    };
  } finally {
    clearTimeout(timer);
  }
}

export function formatFetchWebsiteResult(data: FetchWebsiteResultData): string {
  if (data.fetchFailed || data.insufficientText) {
    return [
      "=== WEBSITE FETCH FAILED / INSUFFICIENT TEXT ===",
      `URL: ${data.finalUrl || data.url}`,
      data.domain ? `Domain: ${data.domain}` : null,
      data.httpStatus ? `HTTP: ${data.httpStatus}` : null,
      "",
      data.groundingNote ||
        "Do NOT invent industry, location, or description from the domain name alone.",
      "",
      "For create_company: use only name (domain label) + domain; set website_fetch_failed:true.",
      'Never infer Brazil from "br" inside a brand (structuralbr.com is not Brazil).',
    ]
      .filter((x) => x !== null)
      .join("\n");
  }

  const lines = [
    "=== WEBSITE CONTENT (use only this text for company facts) ===",
    `URL: ${data.finalUrl || data.url}`,
    data.domain ? `Domain: ${data.domain}` : null,
    data.title ? `Title: ${data.title}` : null,
    data.metaDescription ? `Meta: ${data.metaDescription}` : null,
    data.truncated ? "(content truncated)" : null,
    data.groundingNote || null,
    "",
    data.text,
  ].filter((x) => x !== null) as string[];
  return lines.join("\n");
}
