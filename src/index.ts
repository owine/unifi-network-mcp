#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { NetworkClient } from "./client.js";
import { registerAllTools } from "./tools/index.js";

async function main() {
  const config = loadConfig();
  const client = new NetworkClient(config);

  const server = new McpServer({
    name: "unifi-network",
    version: "1.0.0",
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
