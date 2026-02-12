export function buildQuery(params: {
  offset?: number;
  limit?: number;
  filter?: string;
}): string {
  const searchParams = new URLSearchParams();
  if (params.offset !== undefined) searchParams.set("offset", String(params.offset));
  if (params.limit !== undefined) searchParams.set("limit", String(params.limit));
  if (params.filter !== undefined) searchParams.set("filter", params.filter);
  const qs = searchParams.toString();
  return qs ? `?${qs}` : "";
}
