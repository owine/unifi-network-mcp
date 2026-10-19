import { readFileSync } from "node:fs";
import { isAbsolute } from "node:path";
import { z } from "zod";
import { pemCertificates } from "./tls.js";
import { errorMessage } from "./utils/responses.js";
import { WRITE_TOOL_GROUPS, WRITE_TOOLS, parseWriteTools } from "./write-tools.js";

function holdsCertificate(pem: string): boolean {
  try {
    return pemCertificates(pem).length > 0;
  } catch {
    return false;
  }
}

/**
 * Whether host is api.ui.com however it is written: URL parsing lower-cases
 * it and drops a port, and a trailing dot names the same host. The request
 * goes to api.ui.com in each case, so each must get the same treatment.
 */
export function isSiteManagerHost(host: string): boolean {
  try {
    return new URL(`https://${host}`).hostname.replace(/\.$/, "") === "api.ui.com";
  } catch {
    return false;
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  writeTools: z.string()
    .transform((value, ctx) => {
      const { tools, unknown } = parseWriteTools(value);
      if (unknown.length > 0) {
        ctx.addIssue({
          code: "custom",
          message: `UNIFI_NETWORK_WRITE_TOOLS names unknown write tools or groups: ${unknown.join(", ")}. Groups: ${Object.keys(WRITE_TOOL_GROUPS).join(", ")}. Tools: ${WRITE_TOOLS.join(", ")}. Use "none" for no write tools.`,
        });
        return z.NEVER;
      }
      return tools;
    })
    .optional()
    .describe("The write tools to register; undefined registers them all"),
  allowWanExposure: z
    .literal(true)
    .optional()
    .describe("When true, writes that could let traffic in from the WAN fall back to the confirm flow instead of being refused"),
  wanZoneIds: z
    .array(z.string().regex(UUID, "UNIFI_NETWORK_WAN_ZONE_IDS must be a comma-separated list of firewall zone IDs (UUIDs)"))
    .transform((ids) => ids.map((id) => id.toLowerCase()))
    .optional()
    .describe("Firewall zone IDs to treat as the WAN, in addition to the system-defined External zone"),
  writeLog: z.string()
    .refine(isAbsolute, "UNIFI_NETWORK_WRITE_LOG must be an absolute path (MCP hosts do not expand ~)")
    .optional()
    .describe("JSON Lines file every write tool call is appended to"),
  caCert: z.string()
    .refine(holdsCertificate, "UNIFI_NETWORK_CA_CERT must name a PEM file containing a certificate")
    .optional()
    .describe("PEM certificate(s) to trust for the console, e.g. its own self-signed certificate"),
}).refine((config) => config.verifySsl || config.caCert === undefined, {
  path: ["caCert"],
  message: "UNIFI_NETWORK_CA_CERT pins a certificate to verify against; it cannot be combined with UNIFI_NETWORK_VERIFY_SSL=false",
}).refine((config) => config.verifySsl || !isSiteManagerHost(config.host), {
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
      console.error(`Configuration error: cannot read UNIFI_NETWORK_CA_CERT (${caCertPath}): ${errorMessage(err)}`);
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
    ...(process.env.UNIFI_NETWORK_ALLOW_WAN_EXPOSURE?.toLowerCase() === "true"
      ? { allowWanExposure: true } : {}),
    ...(process.env.UNIFI_NETWORK_WAN_ZONE_IDS
      ? { wanZoneIds: process.env.UNIFI_NETWORK_WAN_ZONE_IDS.split(",").map((id) => id.trim()).filter((id) => id !== "") } : {}),
    ...(process.env.UNIFI_NETWORK_WRITE_LOG
      ? { writeLog: process.env.UNIFI_NETWORK_WRITE_LOG } : {}),
    ...(process.env.UNIFI_NETWORK_WRITE_TOOLS !== undefined
      ? { writeTools: process.env.UNIFI_NETWORK_WRITE_TOOLS } : {}),
  });

  if (!result.success) {
    console.error(`Configuration error:\n${z.prettifyError(result.error)}`);
    return process.exit(1);
  }

  const config = result.data;
  if (config.readOnly && config.writeTools !== undefined) {
    // Still validated above, so a typo shows up before writes are turned on.
    console.error("Ignoring UNIFI_NETWORK_WRITE_TOOLS: the server is read-only, so no write tools load. Set UNIFI_NETWORK_READ_ONLY=false to use it.");
    delete config.writeTools;
  }
  if (config.readOnly && config.writeLog !== undefined) {
    // Nothing would be logged, and opening the file could stop the server.
    console.error("Ignoring UNIFI_NETWORK_WRITE_LOG: the server is read-only, so there are no write calls to log. Set UNIFI_NETWORK_READ_ONLY=false to use it.");
    delete config.writeLog;
  }
  return config;
}
