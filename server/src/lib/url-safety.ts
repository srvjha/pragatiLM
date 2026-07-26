import { lookup } from "node:dns/promises";
import ipaddr from "ipaddr.js";
import { badRequest } from "@/lib/errors";

/**
 * NFR-10. A user supplied URL is fetched by the server, so without this a
 * notebook source could be pointed at the metadata endpoint of a cloud host, at
 * localhost, or at anything else reachable from inside the network.
 *
 * Every address the hostname resolves to is checked, not just the first, because
 * a name can resolve to both a public and a private address.
 */
const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

// ipaddr.js range names that must never be fetched.
const BLOCKED_RANGES = new Set([
  "unspecified",
  "broadcast",
  "multicast",
  "linkLocal",
  "loopback",
  "private",
  "reserved",
  "uniqueLocal",
  "ipv4Mapped",
  "rfc6145",
  "rfc6052",
  "6to4",
  "teredo",
  "carrierGradeNat",
]);

export function assertSafeProtocol(raw: string): URL {
  let url: URL;

  try {
    url = new URL(raw);
  } catch {
    throw badRequest("That does not look like a valid URL.");
  }

  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    throw badRequest("Only http and https URLs can be added as a source.");
  }

  return url;
}

function assertPublicAddress(address: string): void {
  const parsed = ipaddr.parse(address);
  if (BLOCKED_RANGES.has(parsed.range())) {
    throw badRequest("That URL points at a private or internal address, which cannot be fetched.");
  }
}

/**
 * Resolves the hostname and rejects private, loopback and link local targets.
 * Re-run at fetch time as well as at create time, because a name can resolve
 * differently between the two, which is the DNS rebinding case.
 */
export async function assertSafeUrl(raw: string): Promise<URL> {
  const url = assertSafeProtocol(raw);

  if (ipaddr.isValid(url.hostname)) {
    assertPublicAddress(url.hostname);
    return url;
  }

  let addresses: { address: string }[];
  try {
    addresses = await lookup(url.hostname, { all: true });
  } catch {
    throw badRequest("That host could not be resolved.");
  }

  if (addresses.length === 0) {
    throw badRequest("That host could not be resolved.");
  }

  for (const { address } of addresses) assertPublicAddress(address);

  return url;
}
