import { X509Certificate } from "node:crypto";
import { checkServerIdentity, rootCertificates, type ConnectionOptions, type PeerCertificate } from "node:tls";
import { Agent, EnvHttpProxyAgent, type Dispatcher } from "undici";

/** Every certificate in a PEM bundle. Throws on a malformed certificate block. */
export function pemCertificates(pem: string): X509Certificate[] {
  const blocks = pem.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g) ?? [];
  return blocks.map((block) => new X509Certificate(block));
}

/**
 * Whether Node's own fetch would honour HTTP(S)_PROXY. An explicit dispatcher
 * bypasses that support, so the dispatcher has to bring its own under the
 * same switch: an operator behind a mandatory egress proxy keeps working, and
 * one who never opted in does not suddenly send console traffic to a proxy.
 */
function envProxyEnabled(): boolean {
  return process.env.NODE_USE_ENV_PROXY === "1" ||
    process.execArgv.includes("--use-env-proxy") ||
    (process.env.NODE_OPTIONS ?? "").split(/\s+/).includes("--use-env-proxy");
}

/**
 * The dispatcher for requests to the console. TLS settings live here, scoped
 * to this client, rather than in the process-wide NODE_TLS_REJECT_UNAUTHORIZED;
 * and connections stay open across the gaps between a model's calls instead of
 * paying a new TLS handshake each time.
 */
export function consoleDispatcher(tls: { verifySsl: boolean; caCert?: string }): Dispatcher {
  const connect = connectOptions(tls);
  // Through a proxy, undici takes the console's TLS settings from requestTls;
  // connect would only configure the hop to the proxy.
  return envProxyEnabled()
    ? new EnvHttpProxyAgent({ keepAliveTimeout: 60_000, connect, requestTls: connect })
    : new Agent({ keepAliveTimeout: 60_000, connect });
}

function connectOptions({ verifySsl, caCert }: { verifySsl: boolean; caCert?: string }): ConnectionOptions {
  if (!verifySsl) return { rejectUnauthorized: false };
  if (caCert === undefined) return {};
  // A console's self-signed certificate is issued to a name like unifi.local
  // but reached by IP, so its hostname never matches. Accept the console when
  // it presents exactly a pinned certificate; any other certificate, such as
  // one issued by a pinned CA, still has to match the hostname.
  const pinned = new Set(pemCertificates(caCert).map((cert) => cert.fingerprint256));
  return {
    // The pin adds to the default trust store rather than replacing it, so a
    // console with a publicly trusted certificate (or api.ui.com) still
    // verifies. allowPartialTrustChain lets a pinned certificate that is not
    // self-signed, such as a console leaf issued by a private CA, anchor the
    // chain on its own.
    ca: [...rootCertificates, caCert],
    allowPartialTrustChain: true,
    checkServerIdentity: (host: string, cert: PeerCertificate) =>
      pinned.has(cert.fingerprint256) ? undefined : checkServerIdentity(host, cert),
  };
}
