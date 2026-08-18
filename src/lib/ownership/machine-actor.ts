/**
 * Machine / connector ids that must never show as Account Rep.
 * Shared by server assignment and list UI.
 */

export function isMachineActorId(value?: string | null): boolean {
  const s = String(value || "").trim();
  if (!s) return true;
  if (/^(mcp|system|current-user)$/i.test(s)) return true;
  if (/^mcp:/i.test(s)) return true;
  if (/^mcp(oauth|key)_/i.test(s)) return true;
  if (/^trio_oauth/i.test(s)) return true;
  return false;
}

export function displayOwnerName(value?: string | null): string {
  const s = String(value || "").trim();
  if (!s || isMachineActorId(s)) return "";
  return s;
}
