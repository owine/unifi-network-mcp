import { readFileSync } from "node:fs";
import { z } from "zod";
import { pemCertificates } from "./tls.js";

function holdsCertificate(pem: string): boolean {
  try {
    return pemCertificates(pem).length > 0;
  } catch {
    return false;
  }
}

const configSchema = z.object({
  host: z.string().min(1).describe("UniFi Network host (IP or hostname)"),
  apiKey: z.string().min(1).describe("UniFi Network API key"),
  // Console/host IDs are hex, UUID- or colon-shaped depending on vintage, so
  // hyphens and underscores are allowed; the charset still excludes anything
  // that could escape the URL path segment it is interpolated into.
  consoleId: z.string().regex(/^[A-Za-z0-9:_-]{1,128}$/).optional()
    .describe("Optional Cloud Connector console ID; only used when host is api.ui.com"),
  verifySsl: z
    .boolean()
    .default(true)
    .describe("Verify SSL certificates"),
  readOnly: z
    .boolean()
    .default(true)
    .describe("When true, only read-only tools are registered"),
  caCert: z.string()
    .refine(holdsCertificate, "UNIFI_NETWORK_CA_CERT must name a PEM file containing a certificate")
    .optional()
    .describe("PEM certificate(s) to trust for the console, e.g. its own self-signed certificate"),
}).refine((config) => config.verifySsl || config.caCert === undefined, {
  path: ["caCert"],
  message: "UNIFI_NETWORK_CA_CERT pins a certificate to verify against; it cannot be combined with UNIFI_NETWORK_VERIFY_SSL=false",
}).refine((config) => config.verifySsl || config.host !== "api.ui.com", {
  // Opting out of verification is for local consoles with self-signed
  // certificates. A Site Manager key reaches every console on the account
  // and crosses the internet, so it never goes out unverified.
  path: ["verifySsl"],
  message: "TLS verification cannot be disabled for api.ui.com; unset UNIFI_NETWORK_VERIFY_SSL",
});

export type Config = z.infer<typeof configSchema>;

export function loadConfig(): Config {
  const caCertPath = process.env.UNIFI_NETWORK_CA_CERT;
  let caCert: string | undefined;
  if (caCertPath) {
    try {
      caCert = readFileSync(caCertPath, "utf8");
    } catch (err) {
      console.error(`Configuration error: cannot read UNIFI_NETWORK_CA_CERT (${caCertPath}): ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }
  }

  const result = configSchema.safeParse({
    host: process.env.UNIFI_NETWORK_HOST,
    apiKey: process.env.UNIFI_NETWORK_API_KEY,
    ...(process.env.UNIFI_NETWORK_CONSOLE_ID
      ? { consoleId: process.env.UNIFI_NETWORK_CONSOLE_ID } : {}),
    verifySsl:
      process.env.UNIFI_NETWORK_VERIFY_SSL?.toLowerCase() !== "false",
    readOnly:
      process.env.UNIFI_NETWORK_READ_ONLY?.toLowerCase() !== "false",
    ...(caCert !== undefined ? { caCert } : {}),
  });

  if (!result.success) {
    console.error(`Configuration error:\n${z.prettifyError(result.error)}`);
    process.exit(1);
  }

  return result.data;
}
