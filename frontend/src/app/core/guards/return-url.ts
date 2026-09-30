/**
 * Returns the address only if it is a path on this origin, otherwise null.
 * Rejects absolute URLs, protocol-relative (//host) and backslash tricks.
 */
export function safeReturnUrl(raw: unknown, origin: string = window.location.origin): string | null {
  if (typeof raw !== 'string' || !raw.startsWith('/') || raw.startsWith('//')) {
    return null;
  }
  if (raw.includes('\\') || [...raw].some((c) => c.charCodeAt(0) < 0x20)) {
    return null;
  }
  try {
    const url = new URL(raw, origin);
    return url.origin === origin ? url.pathname + url.search + url.hash : null;
  } catch {
    return null;
  }
}
