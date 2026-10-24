#!/usr/bin/env node
import { createRequire } from "node:module";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { NetworkClient } from "./client.js";
import { registerAllTools } from "./tools/index.js";
import { serverInstructions } from "./instructions.js";
import { openWriteLog } from "./write-log.js";

// Read at runtime rather than importing: package.json sits outside rootDir,
// so a static import would emit dist/src/ and break the published layout.
// It reads 0.0.0-development in the repo; the release workflow stamps the
// tag's version into it before packing, so a published tarball reports its own.
const { version } = createRequire(__filename)("../package.json") as {
  version: string;
};

async function main() {
  const config = loadConfig();
  const writeLog = config.writeLog === undefined ? undefined : openWriteLog(config.writeLog, config.apiKey);
  const client = new NetworkClient(config);

  const server = new McpServer(
    { name: "unifi-network", title: "UniFi Network", version },
    { instructions: serverInstructions(config.readOnly, { writeTools: config.writeTools, allowWanExposure: config.allowWanExposure === true }) }
  );

  registerAllTools(server, client, config.readOnly, {
    writeTools: config.writeTools,
    wan: { allowExposure: config.allowWanExposure === true, zoneIds: config.wanZoneIds ?? [] },
    ...(writeLog ? { writeLog } : {}),
  });

  if (config.readOnly) {
    console.error("UniFi Network MCP server running on stdio (READ-ONLY mode)");
  } else if (config.writeTools !== undefined) {
    const tools = config.writeTools.length > 0 ? config.writeTools.join(", ") : "none";
    console.error(`UniFi Network MCP server running on stdio (write tools: ${tools})`);
  } else {
    console.error("UniFi Network MCP server running on stdio");
  }
  if (!config.readOnly && config.allowWanExposure === true) {
    console.error("WAN-exposure refusals are off (UNIFI_NETWORK_ALLOW_WAN_EXPOSURE=true): such writes only need confirm.");
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err: unknown) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
