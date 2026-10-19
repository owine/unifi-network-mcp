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

/** The message of a thrown value, which need not be an Error. */
export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function formatError(err: unknown) {
  let message = errorMessage(err);
  // fetch reports every network failure as "fetch failed" and keeps the reason
  // (ECONNREFUSED, ENOTFOUND, a certificate error) in cause.
  const cause = err instanceof Error ? err.cause : undefined;
  const code = cause instanceof Error && "code" in cause && typeof cause.code === "string" ? cause.code : undefined;
  if (code) {
    message += ` (${code})`;
    message += tlsHint(code);
  }
  return {
    content: [{ type: "text" as const, text: `Error: ${message}` }],
    isError: true,
  };
}

/**
 * What to do about a certificate that did not verify. Pinning makes a
 * console's own certificate trusted, but it does not lift the validity dates,
 * so an expired certificate gets its own advice.
 */
function tlsHint(code: string): string {
  if (code === "CERT_HAS_EXPIRED" || code === "CERT_NOT_YET_VALID") {
    return ". The console's TLS certificate is outside its validity dates; check the clocks on the console and this machine, and renew the certificate if it has expired (pinning it with UNIFI_NETWORK_CA_CERT does not override the dates)";
  }
  if (!/CERT|SELF_SIGNED|LEAF_SIGNATURE/.test(code)) return "";
  return ". The console's TLS certificate did not verify. For a local console with a self-signed certificate, save the certificate and point UNIFI_NETWORK_CA_CERT at it; if it is already set, the console has a new certificate, so save it again. Against api.ui.com, something between you and Ubiquiti presented this certificate: do not work around it";
}
