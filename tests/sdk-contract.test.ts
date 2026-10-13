import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { registerAllTools } from "../src/tools/index.js";
import { formatDryRun } from "../src/utils/safety.js";
import { createMockServer, createMockClient } from "./tools/_helpers.js";

/**
 * Contract tests through the real MCP SDK. The per-domain tests call
 * handlers directly, which skips the SDK's outputSchema validation — so a
 * result the SDK would reject still passes there.
 */

describe("dry-run results through the SDK", () => {
  let mcpClient: Client;

  beforeAll(async () => {
    const server = new McpServer({ name: "test", version: "0.0.0" });
    registerAllTools(server, createMockClient(), false);
    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    mcpClient = new Client({ name: "test-client", version: "0.0.0" });
    await Promise.all([server.connect(serverTransport), mcpClient.connect(clientTransport)]);
  });

  afterAll(async () => {
    await mcpClient.close();
  });

  it("returns the preview for a write tool that declares an outputSchema", async () => {
    const result = await mcpClient.callTool({
      name: "unifi_create_firewall_zone",
      arguments: { siteId: "site1", name: "IoT", networkIds: ["net1"], dryRun: true },
    });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({
      dryRun: true,
      wouldExecute: { method: "POST", path: "/sites/site1/firewall/zones" },
    });
  });
});

describe("dry-run preview against every write tool's outputSchema", () => {
  const { server, configs } = createMockServer();
  registerAllTools(server, createMockClient(), false);
  const preview = formatDryRun("PUT", "/sites/site1/things/thing1", { name: "x" });
  const writeToolsWithOutput = [...configs].filter(
    ([, config]) => "dryRun" in config.schema && config.outputSchema !== undefined
  );

  it("covers the write tools that declare an outputSchema", () => {
    expect(writeToolsWithOutput.length).toBeGreaterThan(0);
  });

  for (const [name, config] of writeToolsWithOutput) {
    it(`${name} accepts the dry-run preview as structuredContent`, () => {
      const schema = z.object(config.outputSchema as Record<string, z.ZodType>);
      expect(schema.safeParse(preview.structuredContent).success).toBe(true);
    });
  }
});
