/**
 * Apollo.io product feature flag (UI + re-enable docs).
 * Tools use isApolloToolEnabled() in tool-flags.ts (same env family).
 *
 * Tools default on when a platform Apollo key is present.
 * Hard off: AI_TOOLS_APOLLO_ENABLED=false.
 * Nav/page: NEXT_PUBLIC_AI_TOOLS_APOLLO_ENABLED=true
 *
 * Code paths stay in the repo for easy restore.
 */

/** Client-safe: show AI Apollo nav/pages only when public flag is true */
export function isApolloUiEnabled(): boolean {
  const v = (process.env.NEXT_PUBLIC_AI_TOOLS_APOLLO_ENABLED || '')
    .trim()
    .toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

/** Server-safe: tools or UI should treat Apollo product as available */
export function isApolloProductEnabled(): boolean {
  const server = (process.env.AI_TOOLS_APOLLO_ENABLED || '').trim().toLowerCase();
  if (server === '1' || server === 'true' || server === 'yes' || server === 'on') {
    return true;
  }
  if (server === '0' || server === 'false' || server === 'no' || server === 'off') {
    return false;
  }
  // Fall through to public UI flag (so one NEXT_PUBLIC_ can re-enable both if desired)
  return isApolloUiEnabled();
}
