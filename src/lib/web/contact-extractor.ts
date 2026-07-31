export interface ContactExtractionResult {
  sourceUrl: string;
  companyName: string;
  website: string;
  email: string;
  phone: string;
  addresses: string[];
  description: string;
}

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
  return titleMatch ? normalizeWhitespace(titleMatch[1]) : "";
}

function extractMetaProperty(html: string, prop: string): string {
  const regex = new RegExp(
    `<meta[^>]+property=["']${prop}["'][^>]+content=["']([^"']+)["'][^>]*>`,
    "i",
  );
  const match = html.match(regex);
  return match ? normalizeWhitespace(match[1]) : "";
}

function extractMetaDescription(html: string): string {
  const ogDescription = extractMetaProperty(html, "og:description");
  if (ogDescription) return ogDescription;

  const nameDescription = html.match(
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["'][^>]*>/i,
  );
  return nameDescription ? normalizeWhitespace(nameDescription[1]) : "";
}

function extractH1(html: string): string {
  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  return h1Match ? normalizeWhitespace(stripHtml(h1Match[1])) : "";
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
  const textMatches =
    text.match(/\+?\d{1,3}[\s().-]?\(?\d{3}\)?[\s().-]?\d{3}[\s().-]?\d{4}/g) || [];
  const all = [...htmlNumbers, ...textMatches];
  return Array.from(new Set(all.map((m) => m.trim()).filter(Boolean)));
}

function extractUrls(text: string): string[] {
  const matches = text.match(/https?:\/\/[^\s)"']+/gi) || [];
  return Array.from(new Set(matches));
}

function toTitleCase(value: string): string {
  return value
    .split(/[-_.\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function inferCompanyName(
  title: string,
  h1: string,
  ogTitle: string,
  sourceUrl: string,
  text?: string,
  html?: string,
): string {
  const genericTitles = new Set(["contact us", "contact", "contact us page"]);
  const candidates = [title, h1, ogTitle].filter(Boolean);

  for (const candidate of candidates) {
    if (!candidate) continue;

    const normalized = normalizeWhitespace(candidate).toLowerCase();
    if (genericTitles.has(normalized)) continue;

    const cleaned = candidate.replace(/\s*[-|–|—]\s*.*$/, "").trim();
    const cleanedNormalized = normalizeWhitespace(cleaned).toLowerCase();
    if (genericTitles.has(cleanedNormalized)) continue;

    if (cleaned && !/^contact( us)?( page)?$/i.test(cleanedNormalized)) {
      return cleaned;
    }
  }

  const brandMatches = [text, html].filter(Boolean).join(" ").match(/ByVerTek/gi);
  if (brandMatches?.length) return "ByVerTek";

  try {
    const hostname = new URL(sourceUrl).hostname.replace(/^www\./i, "");
    const rootDomain = hostname.split(".")[0];
    if (rootDomain) return toTitleCase(rootDomain);
  } catch {
    // Ignore malformed source URLs and fall through.
  }

  return "";
}

function parseAddressSections(text: string): string[] {
  const lines = text
    .split(/\n+/)
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean);

  const officeLines = lines.filter((line) =>
    /Corporate Offices|Regional Offices|Boca Raton|Mesa|Fort Pierce|Ocala/i.test(line),
  );

  return officeLines.length ? [officeLines.join(" | ")] : [];
}

function extractDescription(text: string, html?: string): string {
  const metaDescription = html ? extractMetaDescription(html) : "";
  if (metaDescription) return metaDescription;

  const aboutMatch = text.match(/About ByVerTek[^\n]*/i);
  if (aboutMatch?.[0]) return normalizeWhitespace(aboutMatch[0]);

  const general = text.match(/ByVerTek provides[^\n]+/i);
  return general ? normalizeWhitespace(general[0]) : "";
}

export async function extractContactRecordFromUrl(sourceUrl: string): Promise<ContactExtractionResult> {
  const response = await fetch(sourceUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      Accept: "text/html,application/xhtml+xml",
    },
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${response.statusText}`);
  }

  const html = await response.text();
  const text = stripHtml(html);
  const title = extractTitle(html);
  const ogTitle = extractMetaProperty(html, "og:title");
  const h1 = extractH1(html);
  const sourceOrigin = new URL(sourceUrl).origin;

  let homepageHtml = "";
  try {
    const homepageResponse = await fetch(sourceOrigin, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    if (homepageResponse.ok) {
      homepageHtml = await homepageResponse.text();
    }
  } catch {
    homepageHtml = "";
  }

  const homepageText = stripHtml(homepageHtml);
  const companyName = inferCompanyName(title, h1, ogTitle, sourceUrl, homepageText, homepageHtml);
  const emails = extractEmails(html, text);
  const phones = extractPhones(html, text);
  const urls = extractUrls(text);
  const addresses = parseAddressSections(text);
  const description = extractDescription(text, html);

  return {
    sourceUrl,
    companyName,
    website: urls[0] || new URL(sourceUrl).origin,
    email: emails[0] || "",
    phone: phones[0] || "",
    addresses,
    description,
  };
}