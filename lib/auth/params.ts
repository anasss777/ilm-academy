// lib/auth/params.ts
// Safe handling of values that arrive in URLs. Pure, so it is shared by server and client.

/**
 * Accept only an internal path. Returns it WITHOUT a locale prefix (next-intl adds that),
 * or null if the value could send the user to another site (open redirect) or into the API.
 */
export function safeNextPath(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let p = raw.trim();
  if (!p.startsWith("/") || p.startsWith("//")) return null;
  if (p.includes("\\") || /[\u0000-\u001f]/.test(p)) return null;
  p = p.replace(/^\/(ar|en)(?=\/|$)/, "") || "/";
  if (/^\/(api|auth)(\/|$)/.test(p)) return null;
  return p;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseUuid(raw: string | null | undefined): string | null {
  return raw && UUID_REGEX.test(raw) ? raw : null;
}
