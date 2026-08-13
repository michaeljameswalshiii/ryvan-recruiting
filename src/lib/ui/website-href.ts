/** Turn a stored domain or URL into a safe http(s) href. */
export function toWebsiteHref(raw?: string | null): string | null {
  const value = String(raw || "").trim();
  if (!value || value === "—") return null;
  if (/^javascript:/i.test(value)) return null;
  if (/^https?:\/\//i.test(value)) return value;
  if (/^[\w.-]+\.[a-z]{2,}([/:?#].*)?$/i.test(value)) {
    return `https://${value.replace(/^\/+/, "")}`;
  }
  return null;
}

export function websiteLabel(raw?: string | null): string {
  const value = String(raw || "").trim();
  return value.replace(/^https?:\/\//i, "").replace(/\/$/, "") || value;
}
