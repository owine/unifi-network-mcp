import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { NetworkClient } from "../src/client.js";
import { GuardError, ROUTES, guardRequest, type Route } from "../src/guard.js";
import { registerAllTools } from "../src/tools/index.js";
import { registerDeviceTools } from "../src/tools/devices.js";
import { registerClientTools } from "../src/tools/clients.js";
import { registerNetworkTools } from "../src/tools/networks.js";
import { registerWifiTools } from "../src/tools/wifi.js";
import { registerHotspotTools } from "../src/tools/hotspot.js";
import { registerFirewallTools } from "../src/tools/firewall.js";
import { registerAclTools } from "../src/tools/acl.js";
import { registerDnsPolicyTools } from "../src/tools/dns-policies.js";
import { registerTrafficMatchingTools } from "../src/tools/traffic-matching.js";
import { WRITE_TOOL_GROUPS, WRITE_TOOLS } from "../src/write-tools.js";
import { createMockServer, createMockClient } from "./tools/_helpers.js";

// The client calls undici's fetch rather than the global one, so mock that.
const fetchMock = vi.hoisted(() => vi.fn());
vi.mock("undici", async (importOriginal) => ({ ...await importOriginal<typeof import("undici")>(), fetch: fetchMock }));

/**
 * UNIFI_NETWORK_WRITE_TOOLS limits the write tools twice over: tools not
 * enabled are never registered, and the request guard refuses the writes
 * that belong only to them.
 */

const MODULES: Record<keyof typeof WRITE_TOOL_GROUPS, (server: McpServer, client: NetworkClient, readOnly?: boolean) => void> = {
  devices: registerDeviceTools,
  clients: registerClientTools,
  networks: registerNetworkTools,
  wifi: registerWifiTools,
  hotspot: registerHotspotTools,
  firewall: registerFirewallTools,
  acl: registerAclTools,
  "dns-policies": registerDnsPolicyTools,
  "traffic-matching": registerTrafficMatchingTools,
};

function registeredTools(writeTools?: readonly string[]) {
  const { server, configs } = createMockServer();
  registerAllTools(server, createMockClient(), false, writeTools === undefined ? {} : { writeTools });
  return [...configs];
}

const readTools = registeredTools().filter(([, config]) => config.annotations.readOnlyHint === true).map(([name]) => name);

async function listedTools(writeTools?: readonly string[]): Promise<string[]> {
  const server = new McpServer({ name: "test", version: "0.0.0" });
  registerAllTools(server, createMockClient(), false, writeTools === undefined ? {} : { writeTools });
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "0.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  try {
    return (await client.listTools()).tools.map((tool) => tool.name).sort();
  } finally {
    await client.close();
  }
}

/** A concrete request for a route. */
function requestFor(route: Route): string {
  const query = (route.requiredQuery ?? []).map((key) => `${key}=x`).join("&");
  return route.template.replaceAll("{id}", "id1").replaceAll("{site}", "default") + (query ? `?${query}` : "");
}

const writeRoutes = ROUTES.filter((route) => route.tools !== undefined);
const readRoutes = ROUTES.filter((route) => route.tools === undefined);

describe("WRITE_TOOL_GROUPS", () => {
  for (const [group, register] of Object.entries(MODULES)) {
    it(`lists exactly the write tools ${group} registers`, () => {
      const { server, configs } = createMockServer();
      register(server, createMockClient(), false);
      const writes = [...configs].filter(([, config]) => config.annotations.readOnlyHint === false).map(([name]) => name);
      expect(writes.sort()).toEqual([...WRITE_TOOL_GROUPS[group as keyof typeof WRITE_TOOL_GROUPS]].sort());
    });
  }

  it("names only tools that some write route belongs to", () => {
    const routed = new Set(writeRoutes.flatMap((route) => route.tools ?? []));
    expect(WRITE_TOOLS.filter((tool) => !routed.has(tool))).toEqual([]);
    expect([...routed].filter((tool) => !WRITE_TOOLS.includes(tool))).toEqual([]);
  });
});

describe("registration with UNIFI_NETWORK_WRITE_TOOLS", () => {
  it("lists every tool when unset", async () => {
    expect(await listedTools()).toEqual([...readTools, ...WRITE_TOOLS].sort());
  });

  it("lists only the read tools when none are enabled", async () => {
    expect(await listedTools([])).toEqual([...readTools].sort());
  });

  it("lists the read tools plus exactly the enabled write tools", async () => {
    expect(await listedTools(["unifi_update_wifi", "unifi_create_voucher"])).toEqual(
      [...readTools, "unifi_update_wifi", "unifi_create_voucher"].sort()
    );
  });

  it("lists a whole group", async () => {
    expect(await listedTools([...WRITE_TOOL_GROUPS.firewall])).toEqual([...readTools, ...WRITE_TOOL_GROUPS.firewall].sort());
  });

  it("leaves read tools alone", () => {
    const names = registeredTools([]).map(([name]) => name);
    expect(names.sort()).toEqual([...readTools].sort());
  });
});

describe("guard enforcement of the enabled write tools", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockImplementation(() => Promise.resolve(new Response("{}", { headers: { "Content-Type": "application/json" } })));
  });

  for (const tool of WRITE_TOOLS) {
    it(`with only ${tool} enabled, allows exactly its writes`, () => {
      const policy = { readOnly: false, writeTools: [tool] };
      for (const route of writeRoutes) {
        const allowed = route.tools?.includes(tool) ?? false;
        const attempt = () => guardRequest(route.method, requestFor(route), policy);
        if (allowed) expect(attempt, route.template).not.toThrow();
        else expect(attempt, `${route.method} ${route.template}`).toThrow(expect.objectContaining({ reason: "tool_disabled" }));
      }
    });
  }

  it("allows every read whatever write tools are enabled", () => {
    for (const writeTools of [undefined, [], ["unifi_update_wifi"]]) {
      for (const route of readRoutes) {
        expect(() => guardRequest(route.method, requestFor(route), { readOnly: false, ...(writeTools ? { writeTools } : {}) })).not.toThrow();
      }
    }
  });

  it("refuses every write when no write tools are enabled", () => {
    for (const route of writeRoutes) {
      expect(() => guardRequest(route.method, requestFor(route), { readOnly: false, writeTools: [] }))
        .toThrow(expect.objectContaining({ reason: "tool_disabled" }));
    }
  });

  it("refuses every write in read-only mode, but still allows the stat/session query", () => {
    for (const route of writeRoutes) {
      expect(() => guardRequest(route.method, requestFor(route), { readOnly: true }))
        .toThrow(expect.objectContaining({ reason: "read_only" }));
    }
    expect(guardRequest("POST", "/api/s/default/stat/session", { readOnly: true }).tools).toBeUndefined();
  });

  it("refuses a disabled tool's write in NetworkClient without sending it", async () => {
    const client = new NetworkClient({ host: "192.168.1.1", apiKey: "k", verifySsl: true, readOnly: false, writeTools: ["unifi_update_wifi"] });
    await expect(client.post("/sites/s1/wifi/broadcasts", {})).rejects.toThrow(GuardError);
    await expect(client.delete("/sites/s1/wifi/broadcasts/w1")).rejects.toThrow(/UNIFI_NETWORK_WRITE_TOOLS does not enable/);
    expect(fetchMock).not.toHaveBeenCalled();
    await client.put("/sites/s1/wifi/broadcasts/w1", {});
    await client.get("/sites/s1/networks");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("refuses writes in NetworkClient when read-only", async () => {
    const client = new NetworkClient({ host: "192.168.1.1", apiKey: "k", verifySsl: true, readOnly: true });
    await expect(client.put("/sites/s1/wifi/broadcasts/w1", {})).rejects.toThrow(/read-only/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
