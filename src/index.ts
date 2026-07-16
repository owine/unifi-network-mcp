#!/usr/bin/env node
import { createRequire } from "node:module";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { NetworkClient } from "./client.js";
import { registerAllTools } from "./tools/index.js";

// Read at runtime rather than importing: package.json sits outside rootDir,
// so a static import would emit dist/src/ and break the published layout.
const { version } = createRequire(__filename)("../package.json") as {
  version: string;
};

async function main() {
  const config = loadConfig();
  const client = new NetworkClient(config);

  const server = new McpServer({
    name: "unifi-network",
    version,
  });

  registerAllTools(server, client, config.readOnly);

  if (config.readOnly) {
    console.error("UniFi Network MCP server running on stdio (READ-ONLY mode)");
  } else {
    console.error("UniFi Network MCP server running on stdio");
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
