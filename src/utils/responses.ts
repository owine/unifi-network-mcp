export function formatSuccess(data: unknown, opts?: { structured?: boolean }) {
  const result: {
    content: { type: "text"; text: string }[];
    structuredContent?: Record<string, unknown>;
  } = {
    content: [{ type: "text" as const, text: JSON.stringify(data) }],
  };

  if (
    opts?.structured &&
    data !== null &&
    typeof data === "object" &&
    !Array.isArray(data)
  ) {
    result.structuredContent = data as Record<string, unknown>;
  }

  return result;
}

export function formatError(err: unknown) {
  let message = err instanceof Error ? err.message : String(err);
  // fetch reports every network failure as "fetch failed" and keeps the reason
  // (ECONNREFUSED, ENOTFOUND, a certificate error) in cause.
  const cause = err instanceof Error ? err.cause : undefined;
  const code = cause instanceof Error && "code" in cause && typeof cause.code === "string" ? cause.code : undefined;
  if (code) {
    message += ` (${code})`;
    if (/CERT|SELF_SIGNED|LEAF_SIGNATURE/.test(code)) {
      message += ". The console's TLS certificate did not verify; for a local console with a self-signed certificate, set UNIFI_NETWORK_VERIFY_SSL=false";
    }
  }
  return {
    content: [{ type: "text" as const, text: `Error: ${message}` }],
    isError: true,
  };
}
