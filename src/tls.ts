import { X509Certificate } from "node:crypto";
import { checkServerIdentity, type PeerCertificate } from "node:tls";
import { Agent } from "undici";

/** Every certificate in a PEM bundle. Throws on a malformed certificate block. */
export function pemCertificates(pem: string): X509Certificate[] {
  const blocks = pem.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g) ?? [];
  return blocks.map((block) => new X509Certificate(block));
}

/**
 * The dispatcher for requests to the console. TLS settings live here, scoped
 * to this client, rather than in the process-wide NODE_TLS_REJECT_UNAUTHORIZED;
 * and connections stay open across the gaps between a model's calls instead of
 * paying a new TLS handshake each time.
 */
export function consoleDispatcher(tls: { verifySsl: boolean; caCert?: string }): Agent {
  return new Agent({ keepAliveTimeout: 60_000, connect: connectOptions(tls) });
}

function connectOptions({ verifySsl, caCert }: { verifySsl: boolean; caCert?: string }) {
  if (!verifySsl) return { rejectUnauthorized: false };
  if (caCert === undefined) return {};
  // A console's self-signed certificate is issued to a name like unifi.local
  // but reached by IP, so its hostname never matches. Accept the console when
  // it presents exactly a pinned certificate; any other certificate, such as
  // one issued by a pinned CA, still has to match the hostname.
  const pinned = new Set(pemCertificates(caCert).map((cert) => cert.fingerprint256));
  return {
    ca: caCert,
    checkServerIdentity: (host: string, cert: PeerCertificate) =>
      pinned.has(cert.fingerprint256) ? undefined : checkServerIdentity(host, cert),
  };
}
