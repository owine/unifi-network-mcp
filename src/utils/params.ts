import { z } from "zod";

/**
 * An Integration API resource ID. IDs are interpolated into request paths, so
 * only the plain ID charset is accepted — anything else could smuggle a query
 * (`?force=true`), a fragment, or extra path segments into the request.
 */
export function resourceId() {
  return z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, "Use an ID returned by a list or get tool");
}

/**
 * A MAC address, colon- or hyphen-separated in either case. Pass it through
 * normalizeMac() before sending: the API writes MACs lowercase and
 * colon-separated.
 */
export function macAddress() {
  return z.string().regex(/^[\da-f]{2}([:-])[\da-f]{2}(\1[\da-f]{2}){4}$/i, "Use a MAC address like aa:bb:cc:dd:ee:ff");
}

/** A MAC address accepted by macAddress(), in the API's form: aa:bb:cc:dd:ee:ff. */
export function normalizeMac(mac: string): string {
  return mac.toLowerCase().replaceAll("-", ":");
}

/**
 * A site's internalReference (often default), which the controller routes
 * outside the Integration API take in place of the site UUID.
 */
export function siteReference() {
  return z.string().regex(/^[A-Za-z0-9_-]{1,64}$/)
    .describe("Site internalReference from unifi_list_sites (often default), not the Integration API UUID");
}
