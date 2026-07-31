import { URL } from "url";

const DEFAULT_URL = "https://byvertek.com/contact-us/";
const targetUrl = process.argv[2] || DEFAULT_URL;

function stripHtml(input: string): string {
  return input
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?(p|div|section|article|li|tr|td|h[1-6])[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, " & ")
    .replace(/&ndash;/gi, "-")
    .replace(/&mdash;/gi, "-")
    .replace(/\s+\n/g, "\n")
    .replace(/\n\s+/g, "\n")
    .replace(/[\t\r]/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function extractTitle(html: string): string {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!titleMatch) return "";
  return normalizeWhitespace(titleMatch[1]);
}

function extractMetaProperty(html: string, prop: string): string {
  const regex = new RegExp(
    `<meta[^>]+property=["']${prop}["'][^>]+content=["']([^"']+)["'][^>]*>`,
    "i"
  );
  const match = html.match(regex);
  return match ? normalizeWhitespace(match[1]) : "";
}

function extractH1(html: string): string {
  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (!h1Match) return "";
  return normalizeWhitespace(stripHtml(h1Match[1]));
}

function extractEmails(html: string, text: string): string[] {
  const fromHtml = html.match(/mailto:([^"'\s<>]+)/gi) || [];
  const fromText = text.match(/([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/gi) || [];
  const all = [...fromHtml.map((m) => m.replace(/^mailto:/i, "")), ...fromText];
  return Array.from(new Set(all.map((m) => m.toLowerCase())));
}

function extractPhones(html: string, text: string): string[] {
  const fromHtml = html.match(/tel:([^"'\s<>]+)/gi) || [];
  const htmlNumbers = fromHtml.map((m) => m.replace(/^tel:/i, "").trim());
  const textMatches = text.match(/\+?\d{1,3}[\s().-]?\(?\d{3}\)?[\s().-]?\d{3}[\s().-]?\d{4}/g) || [];
  const all = [...htmlNumbers, ...textMatches];
  return Array.from(new Set(all.map((m) => m.trim()).filter(Boolean)));
}

function extractUrls(text: string): string[] {
  const matches = text.match(/https?:\/\/[^\s)"']+/gi) || [];
  return Array.from(new Set(matches));
}

function inferCompanyName(
  title: string,
  h1: string,
  ogTitle: string,
  text?: string,
  html?: string
): string {
  const genericTitles = new Set(["contact us", "contact", "contact us page"]);
  const candidates = [title, h1, ogTitle].filter(Boolean);
  for (const candidate of candidates) {
    if (!candidate) continue;
    const normalized = normalizeWhitespace(candidate).toLowerCase();
    if (genericTitles.has(normalized)) continue;
    const cleaned = candidate.replace(/\s*[-|–]\s*.*$/, "").trim();
    if (cleaned) return cleaned;
  }

  const brandMatches = [text, html]
    .filter(Boolean)
    .join(" ")
    .match(/ByVerTek/gi);
  if (brandMatches?.length) return "ByVerTek";

  return "";
}

function parseAddressSections(text: string) {
  const lines = text
    .split(/\n+/)
    .map((l) => normalizeWhitespace(l))
    .filter(Boolean);

  const officeLines = lines.filter((line) =>
    /Corporate Offices|Regional Offices|Boca Raton|Mesa|Fort Pierce|Ocala/i.test(line)
  );

  return officeLines.join(" | ");
}

function extractDescription(text: string): string {
  const aboutMatch = text.match(/About ByVerTek\®?[^\n]*\n([^\n]+)/i);
  if (aboutMatch?.[1]) {
    return normalizeWhitespace(aboutMatch[1]);
  }

  const general = text.match(/ByVerTek provides[^\n]+/i);
  return general ? normalizeWhitespace(general[0]) : "";
}

async function main() {
  const response = await fetch(targetUrl);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${response.statusText}`);
  }

  const html = await response.text();
  const text = stripHtml(html);
  const title = extractTitle(html);
  const ogTitle = extractMetaProperty(html, "og:title");
  const h1 = extractH1(html);

  const homepageResponse = await fetch(new URL(targetUrl).origin, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      Accept: "text/html,application/xhtml+xml",
    },
  });
  const homepageHtml = homepageResponse.ok ? await homepageResponse.text() : "";
  const homepageText = stripHtml(homepageHtml);
  const companyName = inferCompanyName(title, h1, ogTitle, homepageText, homepageHtml);
  const emails = extractEmails(html, text);
  const phones = extractPhones(html, text);
  const urls = extractUrls(text);
  const address = parseAddressSections(text);
  const description = extractDescription(text);

  const result = {
    sourceUrl: targetUrl,
    companyName,
    website: urls[0] || new URL(targetUrl).origin,
    email: emails[0] || "",
    phone: phones[0] || "",
    addresses: address ? [address] : [],
    description,
  };

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
