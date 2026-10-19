import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { registerAllTools } from "../src/tools/index.js";
import { NetworkClient } from "../src/client.js";
import { formatDryRun } from "../src/utils/safety.js";
import { createMockServer, createMockClient, mockFn } from "./tools/_helpers.js";

const fetchMock = vi.hoisted(() => vi.fn());
vi.mock("undici", async (importOriginal) => ({ ...await importOriginal<typeof import("undici")>(), fetch: fetchMock }));

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
      // registerAllTools publishes every outputSchema as a loose Zod object.
      const schema = config.outputSchema as z.ZodType;
      expect(schema.safeParse(preview.structuredContent).success).toBe(true);
    });
  }
});

describe("cancellation through the SDK", () => {
  it("aborts the controller request when the MCP client cancels the call", async () => {
    let requestSignal: AbortSignal | undefined;
    fetchMock.mockImplementation((_url: string, options: RequestInit) => {
      requestSignal = options.signal ?? undefined;
      // A controller that never answers: settle only when the request aborts.
      return new Promise((_resolve, reject) => {
        options.signal?.addEventListener("abort", () => { reject(options.signal?.reason as DOMException); });
      });
    });
    const server = new McpServer({ name: "test", version: "0.0.0" });
    const config = { host: "192.168.1.1", apiKey: "k", verifySsl: true, readOnly: true };
    registerAllTools(server, new NetworkClient(config), true);
    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    const mcpClient = new Client({ name: "test-client", version: "0.0.0" });
    await Promise.all([server.connect(serverTransport), mcpClient.connect(clientTransport)]);

    const controller = new AbortController();
    const call = mcpClient.callTool({ name: "unifi_list_sites", arguments: {} }, undefined, { signal: controller.signal });
    await vi.waitFor(() => { expect(requestSignal).toBeDefined(); });
    controller.abort();

    await expect(call).rejects.toThrow();
    await vi.waitFor(() => { expect(requestSignal?.aborted).toBe(true); });
    await mcpClient.close();
  });
});

describe("output schemas through the SDK", () => {
  let mcpClient: Client;
  const toolClient = createMockClient();

  beforeAll(async () => {
    const server = new McpServer({ name: "test", version: "0.0.0" });
    registerAllTools(server, toolClient, false);
    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    mcpClient = new Client({ name: "test-client", version: "0.0.0" });
    await Promise.all([server.connect(serverTransport), mcpClient.connect(clientTransport)]);
  });

  afterAll(async () => {
    await mcpClient.close();
  });

  // The SDK client validates structuredContent against the published JSON
  // Schema, and the server sends what the controller returned. A schema that
  // forbids unlisted fields therefore breaks the tool the day a firmware
  // update adds one.
  it("never forbids additional properties at any depth", async () => {
    const forbidding: string[] = [];
    const walk = (node: unknown, where: string) => {
      if (node === null || typeof node !== "object") return;
      if ((node as Record<string, unknown>).additionalProperties === false) forbidding.push(where);
      for (const [key, child] of Object.entries(node)) walk(child, `${where}.${key}`);
    };
    for (const tool of (await mcpClient.listTools()).tools) walk(tool.outputSchema, tool.name);
    expect(forbidding).toEqual([]);
  });

  it("returns a resource carrying a field the schema does not list", async () => {
    mockFn(toolClient, "get").mockResolvedValueOnce({ id: "d1", name: "AP", addedInNextFirmware: true });
    const result = await mcpClient.callTool({ name: "unifi_get_device", arguments: { siteId: "s1", deviceId: "d1" } });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({ id: "d1", addedInNextFirmware: true });
  });

  it("returns a list envelope carrying a field the schema does not list", async () => {
    mockFn(toolClient, "get").mockResolvedValueOnce({ offset: 0, limit: 25, count: 1, totalCount: 1, data: [{ id: "n1", name: "LAN" }], nextCursor: "c2" });
    const result = await mcpClient.callTool({ name: "unifi_list_networks", arguments: { siteId: "s1" } });
    expect(result.isError).toBeFalsy();
  });
});

describe("tool metadata through the SDK", () => {
  let tools: Awaited<ReturnType<Client["listTools"]>>["tools"];

  beforeAll(async () => {
    const server = new McpServer({ name: "test", version: "0.0.0" });
    registerAllTools(server, createMockClient(), false);
    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    const mcpClient = new Client({ name: "test-client", version: "0.0.0" });
    await Promise.all([server.connect(serverTransport), mcpClient.connect(clientTransport)]);
    tools = (await mcpClient.listTools()).tools;
    await mcpClient.close();
  });

  it("gives every tool a readable title", () => {
    for (const tool of tools) expect(tool.title, tool.name).toMatch(/^[A-Z][^_]*$/);
  });

  it.each([
    ["unifi_get_acl_rule", "Get ACL rule"],
    ["unifi_list_mc_lag_domains", "List MC-LAG domains"],
    ["unifi_list_wifi", "List WiFi"],
    ["unifi_list_wans", "List WANs"],
    ["unifi_list_dpi_categories", "List DPI categories"],
    ["unifi_list_radius_profiles", "List RADIUS profiles"],
  ])("titles %s as %s", (name, title) => {
    expect(tools.find((tool) => tool.name === name)?.title).toBe(title);
  });

  it("marks every tool as talking to one closed system", () => {
    for (const tool of tools) expect(tool.annotations?.openWorldHint, tool.name).toBe(false);
  });
});
