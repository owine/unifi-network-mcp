import { z } from "zod";

/**
 * An Integration API resource ID. IDs are interpolated into request paths, so
 * only the plain ID charset is accepted — anything else could smuggle a query
 * (`?force=true`), a fragment, or extra path segments into the request.
 */
export function resourceId() {
  return z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, "Use an ID returned by a list or get tool");
}
