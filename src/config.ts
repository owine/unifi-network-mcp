import { z } from "zod";

const configSchema = z.object({
  host: z.string().min(1).describe("UniFi Network host (IP or hostname)"),
  apiKey: z.string().min(1).describe("UniFi Network API key"),
  verifySsl: z
    .boolean()
    .default(true)
    .describe("Verify SSL certificates"),
  readOnly: z
    .boolean()
    .default(true)
    .describe("When true, only read-only tools are registered"),
});

export type Config = z.infer<typeof configSchema>;

export function loadConfig(): Config {
  const result = configSchema.safeParse({
    host: process.env.UNIFI_NETWORK_HOST,
    apiKey: process.env.UNIFI_NETWORK_API_KEY,
    verifySsl:
      process.env.UNIFI_NETWORK_VERIFY_SSL?.toLowerCase() !== "false",
    readOnly:
      process.env.UNIFI_NETWORK_READ_ONLY?.toLowerCase() !== "false",
  });

  if (!result.success) {
    console.error("Configuration error:", result.error.format());
    process.exit(1);
  }

  return result.data;
}
