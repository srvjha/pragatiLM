import { sha256 } from "hash-wasm";

/**
 * FR-2.15. The hash identifies content within one notebook, so the same file
 * added twice is caught, while the same file in two notebooks is not a clash.
 *
 * For fetched sources the URL is hashed rather than the content, because the
 * content does not exist yet at the point the row is created. Canonicalising
 * first means a trailing slash or a tracking parameter does not defeat it.
 */
export function hashBytes(bytes: Buffer): Promise<string> {
  return sha256(bytes);
}

export function hashText(text: string): Promise<string> {
  return sha256(text.trim());
}

const TRACKING_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "gclid",
  "fbclid",
  "ref",
]);

export function canonicaliseUrl(url: URL): string {
  const canonical = new URL(url.toString());
  canonical.hash = "";

  for (const key of [...canonical.searchParams.keys()]) {
    if (TRACKING_PARAMS.has(key.toLowerCase())) canonical.searchParams.delete(key);
  }

  canonical.searchParams.sort();
  canonical.hostname = canonical.hostname.toLowerCase();

  if (canonical.pathname.endsWith("/") && canonical.pathname !== "/") {
    canonical.pathname = canonical.pathname.slice(0, -1);
  }

  return canonical.toString();
}

export function hashUrl(url: URL): Promise<string> {
  return sha256(canonicaliseUrl(url));
}
