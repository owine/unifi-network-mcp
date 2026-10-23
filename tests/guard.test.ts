import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";
import { NetworkClient } from "../src/client.js";
import { GuardError, ROUTES, guardRequest, type GuardPolicy, type Route } from "../src/guard.js";
import { registerAllTools } from "../src/tools/index.js";
import { createMockServer } from "./tools/_helpers.js";

// The client calls undici's fetch rather than the global one, so mock that.
const fetchMock = vi.hoisted(() => vi.fn());
vi.mock("undici", async (importOriginal) => ({ ...await importOriginal<typeof import("undici")>(), fetch: fetchMock }));

/**
 * The request guard allowlists exactly the endpoints the tools use. The sweep
 * below calls every registered tool through a real NetworkClient, so a tool
 * whose endpoint is missing from the allowlist (or an allowlist entry no tool
 * uses) fails here rather than in production.
 */

const HOST = "https://192.168.1.1/proxy/network";
const WRITE: GuardPolicy = { readOnly: false };

const zones = [
  { id: "zone-int", name: "Internal", networkIds: ["net1"], metadata: { origin: "SYSTEM_DEFINED" } },
  { id: "zone-ext", name: "External", networkIds: [], metadata: { origin: "SYSTEM_DEFINED" } },
];
const page = (data: unknown[]) => ({ offset: 0, limit: 200, count: data.length, totalCount: data.length, data });

// A controller that answers every allowlisted endpoint plausibly.
function controller(method: string, path: string): unknown {
  if (method !== "GET") return path.endsWith("/stat/session") ? { meta: { rc: "ok" }, data: [] } : { id: "new" };
  if (path.includes("/clients/history")) return [];
  if (/\/api\/s\/[^/]+\/rest\//.test(path)) return { meta: { rc: "ok" }, data: [{ _id: "c1", name: "LAN", x_passphrase: "FAKE-SECRET-DO-NOT-USE" }] };
  if (path.endsWith("/get/setting")) return { meta: { rc: "ok" }, data: [{ _id: "c2", key: "mgmt", x_ssh_enabled: false, x_ssh_password: "FAKE-SECRET-DO-NOT-USE" }] };
  if (path.endsWith("/firewall/zones")) return page(zones);
  if (/\/wifi\/broadcasts\/[^/]+$/.test(path)) {
    return {
      id: "w1", type: "STANDARD", name: "Office", enabled: true, broadcastingFrequenciesGHz: [5],
      securityConfiguration: { type: "WPA2_PERSONAL", passphrase: "test-passphrase-fixture" },
      multicastToUnicastConversionEnabled: false, clientIsolationEnabled: false, hideName: false,
      uapsdEnabled: false, arpProxyEnabled: false, bssTransitionEnabled: false, advertiseDeviceName: false,
      channel2gLockedTo6: false, dtimPeriod2gLockedTo3: false,
    };
  }
  if (/\/networks\/[^/]+$/.test(path)) return { id: "n1", management: "UNMANAGED", name: "IoT", enabled: true, vlanId: 20 };
  if (/\/firewall\/policies\/(?!ordering)[^/]+$/.test(path)) {
    return {
      id: "p1", enabled: true, name: "Block", action: { type: "BLOCK" },
      source: { zoneId: "zone-int" }, destination: { zoneId: "zone-ext" },
      ipProtocolScope: { ipVersion: "IPV4" }, loggingEnabled: false,
    };
  }
  if (/\/acl-rules\/(?!ordering)[^/]+$/.test(path)) return { id: "r1", type: "IPV4", name: "Block", enabled: true, action: "BLOCK" };
  if (/\/dns\/policies\/[^/]+$/.test(path)) {
    return { id: "d1", type: "A_RECORD", enabled: true, domain: "nas.example.com", ipv4Address: "192.0.2.10", ttlSeconds: 60 };
  }
  if (/\/(sites|devices|clients|networks|broadcasts|vouchers|zones|policies|acl-rules|switch-stacks|mc-lag-domains|lags|lists|wans|tunnels|servers|profiles|tags|categories|applications|countries|pending-devices)$/.test(path)) {
    return page([]);
  }
  return { id: "id1" };
}

// Inputs the generated ones cannot satisfy: semantic checks inside the tool.
const overrides: Record<string, Record<string, unknown>> = {
  unifi_list_client_sessions: { start: 1789272000, end: 1789275600 },
  unifi_create_wifi: { broadcastingFrequenciesGHz: [5], arpProxyEnabled: false, bssTransitionEnabled: false, advertiseDeviceName: false, securityConfiguration: { type: "WPA2_PERSONAL", passphrase: "test-passphrase-fixture" } },
  unifi_create_dns_policy: { ipv4Address: "192.0.2.10", ttlSeconds: 60 },
  unifi_create_firewall_policy: { policy: { name: "Block", enabled: true, action: { type: "BLOCK" }, source: { zoneId: "zone-int" }, destination: { zoneId: "zone-ext" } } },
  unifi_update_firewall_zone: { firewallZoneId: "zone-int" },
  unifi_delete_firewall_zone: { firewallZoneId: "zone-int" },
  unifi_reorder_firewall_policies: { sourceFirewallZoneId: "zone-int", destinationFirewallZoneId: "zone-ext" },
  unifi_bulk_delete_vouchers: { filter: "expired.eq(true)" },
};

/** A value for every required input: the first candidate the field accepts. */
function generatedInput(schema: Record<string, unknown>): Record<string, unknown> {
  const candidates: unknown[] = ["id1", 1, true, ["id1"], {}, [{ type: "PORT_NUMBER", value: 1 }]];
  return Object.fromEntries(
    Object.entries(schema as Record<string, z.ZodType>)
      .filter(([, field]) => !field.safeParse(undefined).success)
      .map(([key, field]) => {
        if (field instanceof z.ZodEnum) return [key, field.options[0]];
        const value = candidates.find((candidate) => field.safeParse(candidate).success);
        if (value === undefined) throw new Error(`no generated value for ${key}`);
        return [key, value];
      })
  );
}

/** Parsed like the SDK parses a call, so defaults apply. */
function toolInput(name: string, schema: Record<string, unknown>, extra: Record<string, unknown> = {}): Record<string, unknown> {
  const input = { ...generatedInput(schema), ...("confirm" in schema ? { confirm: true } : {}), ...overrides[name], ...extra };
  return z.object(schema as Record<string, z.ZodType>).parse(input);
}

/** The route a URL the client fetched was allowed through. */
function routeOf(url: string, method: string): Route {
  expect(url.startsWith(HOST), url).toBe(true);
  return guardRequest(method, url.slice(HOST.length), WRITE);
}

describe("request guard", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockImplementation((url: string, options: RequestInit) => {
      const body = controller(options.method ?? "GET", new URL(url).pathname);
      return Promise.resolve(new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } }));
    });
  });

  describe("every tool's requests", () => {
    const client = new NetworkClient({ host: "192.168.1.1", apiKey: "k", verifySsl: true, readOnly: false });
    const { server, handlers, configs } = createMockServer();
    registerAllTools(server, client, false);
    const used = new Set<Route>();

    for (const [name, handler] of handlers) {
      const { schema, annotations } = configs.get(name);
      it(`${name} sends only allowlisted requests`, async () => {
        const result = await handler(toolInput(name, schema), {});
        expect(result.isError, result.content[0].text).toBeUndefined();
        expect(fetchMock).toHaveBeenCalled();
        const methods = fetchMock.mock.calls.map(([url, options]) => {
          const method = (options as RequestInit).method ?? "GET";
          used.add(routeOf(url as string, method));
          return method;
        });
        if (annotations.readOnlyHint === false) expect(methods.some((method) => method !== "GET")).toBe(true);
      });

      if (annotations.readOnlyHint === false) {
        it(`${name}'s dry run previews a request the guard maps to ${name}`, async () => {
          const result = await handler(toolInput(name, schema, { dryRun: true }), {});
          const { method, path } = (result.structuredContent as { wouldExecute: { method: string; path: string } }).wouldExecute;
          const route = guardRequest(method, `/integration/v1${path}`, { readOnly: false, writeTools: [name] });
          expect(route.tools).toContain(name);
        });
      }
    }

    it("has no allowlist entry that no tool uses", () => {
      expect(ROUTES.filter((route) => !used.has(route)).map((route) => `${route.method} ${route.template}`)).toEqual([]);
    });
  });

  describe("refusals", () => {
    const refusal = (method: string, path: string, policy = WRITE) => {
      try {
        guardRequest(method, path, policy);
      } catch (err) {
        expect(err).toBeInstanceOf(GuardError);
        return (err as GuardError).reason;
      }
      throw new Error(`${method} ${path} was allowed`);
    };

    it.each([
      ["an unknown Integration API path", "GET", "/integration/v1/sites/s1/port-forwards"],
      ["the legacy controller API", "POST", "/api/s/default/cmd/sitemgr"],
      ["a classic collection no tool reads", "GET", "/api/s/default/rest/user"],
      ["a single port forward", "GET", "/api/s/default/rest/portforward/c1"],
      ["one settings section", "GET", "/api/s/default/get/setting/mgmt"],
      ["classic settings records", "GET", "/api/s/default/rest/setting"],
      ["another application on the console", "GET", "/proxy/protect/api/cameras"],
      ["a path without the application prefix", "GET", "/sites"],
      ["a site setting", "PUT", "/integration/v1/sites/s1"],
      ["an extra segment", "GET", "/integration/v1/sites/s1/devices/d1/extra"],
      ["an over-long ID", "GET", `/integration/v1/sites/${"a".repeat(65)}`],
    ])("refuses %s", (_label, method, path) => {
      expect(refusal(method, path)).toBe("not_allowlisted");
    });

    it.each([
      ["DELETE on a list", "DELETE", "/integration/v1/sites/s1/networks"],
      ["POST on a resource", "POST", "/integration/v1/sites/s1/networks/n1"],
      ["PATCH on a network", "PATCH", "/integration/v1/sites/s1/networks/n1"],
      ["PUT on stat/session", "PUT", "/api/s/default/stat/session"],
      ["POST to client history", "POST", "/v2/api/site/default/clients/history?withinHours=1"],
      ["POST to port forwards", "POST", "/api/s/default/rest/portforward"],
      ["PUT on a port forward", "PUT", "/api/s/default/rest/portforward/c1"],
      ["DELETE of a port forward", "DELETE", "/api/s/default/rest/portforward/c1"],
      ["POST to the settings read", "POST", "/api/s/default/get/setting"],
      ["a settings write", "POST", "/api/s/default/set/setting/mgmt"],
      ["PUT on a settings section", "PUT", "/api/s/default/rest/setting/mgmt/c2"],
    ])("refuses the wrong method on a known path: %s", (_label, method, path) => {
      expect(refusal(method, path)).toBe("not_allowlisted");
    });

    it("does not treat ordering as a policy ID, so an update cannot reach the ordering endpoint", () => {
      const reorder = "/integration/v1/sites/s1/firewall/policies/ordering?sourceFirewallZoneId=a&destinationFirewallZoneId=b";
      expect(refusal("PUT", reorder, { readOnly: false, writeTools: ["unifi_update_firewall_policy"] })).toBe("tool_disabled");
      expect(refusal("PATCH", "/integration/v1/sites/s1/firewall/policies/ordering")).toBe("not_allowlisted");
      expect(refusal("DELETE", "/integration/v1/sites/s1/acl-rules/ordering")).toBe("not_allowlisted");
      expect(refusal("PUT", "/integration/v1/sites/s1/firewall/policies/ORDERING", { readOnly: false, writeTools: ["unifi_update_firewall_policy"] })).toBe("not_allowlisted");
    });

    it.each(["HEAD", "OPTIONS", "TRACE", "CONNECT", "get", "PROPFIND"])("refuses method %s", (method) => {
      expect(refusal(method, "/integration/v1/sites")).toBe("method");
    });

    it.each([
      ["dot-segments", "/integration/v1/sites/../../api/s/default/cmd/sitemgr"],
      ["a lone dot-dot", "/integration/v1/sites/s1/devices/.."],
      ["encoded dot-segments", "/integration/v1/sites/s1/devices/%2e%2e/%2e%2e/networks"],
      ["an encoded slash", "/integration/v1/sites/s1%2fdevices"],
      ["any percent-encoding", "/integration/v1/sites/s%41"],
      ["backslashes", "/integration/v1/sites/s1/devices/x\\..\\networks"],
      ["an empty segment", "/integration/v1/sites//devices"],
      ["a path parameter", "/integration/v1/sites/s1;x=1/devices"],
      ["a fragment", "/integration/v1/sites/s1/devices#/x"],
      ["a control character", "/integration/v1/sites/s1\n/devices"],
      ["a NUL", "/integration/v1/sites/s1\u0000/devices"],
      ["a fragment in the query", "/integration/v1/sites?filter=x#y"],
    ])("refuses a path containing %s", (_label, path) => {
      expect(refusal("GET", path)).toBe("malformed");
    });

    it.each([
      ["a query parameter the endpoint does not take", "/integration/v1/sites/s1/networks/n1?force=true", "GET"],
      ["force on a delete that has none", "/integration/v1/sites/s1/firewall/policies/p1?force=true", "DELETE"],
      ["a bulk voucher delete without a filter", "/integration/v1/sites/s1/hotspot/vouchers", "DELETE"],
      ["client history without its window", "/v2/api/site/default/clients/history", "GET"],
    ])("refuses %s", (_label, path, method) => {
      expect(refusal(method, path)).toBe("query");
    });

    it("allows an encoded query value, which is not part of the path", () => {
      expect(() => guardRequest("GET", "/integration/v1/sites?filter=name.eq%28%27a%27%29&offset=0", WRITE)).not.toThrow();
    });
  });

  describe("through NetworkClient", () => {
    it.each([
      ["a connector path in an ID", "/sites/x/../../../v1/connector/consoles/other/proxy/protect/api"],
      ["another application as segments", "/sites/proxy/protect"],
      ["a Protect path", "/../../protect/api/cameras"],
      ["an encoded traversal", "/sites/s1/devices/%2e%2e%2f%2e%2e%2fv1%2fconnector"],
    ])("sends nothing for %s, even behind the Cloud Connector", async (_label, path) => {
      const client = new NetworkClient({ host: "api.ui.com", consoleId: "console1", apiKey: "k", verifySsl: true, readOnly: false });
      await expect(client.get(path)).rejects.toThrow(GuardError);
      await expect(client.delete(path)).rejects.toThrow(/request guard/);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("adds the Cloud Connector prefix only after the guard passes", async () => {
      const client = new NetworkClient({ host: "api.ui.com", consoleId: "console1", apiKey: "k", verifySsl: true, readOnly: false });
      await client.get("/sites");
      expect(fetchMock.mock.calls[0][0]).toBe("https://api.ui.com/v1/connector/consoles/console1/proxy/network/integration/v1/sites");
    });

    it("lets a zone delete read the zones for its WAN check when it is the only write tool enabled", async () => {
      const writeTools = ["unifi_delete_firewall_zone"];
      const client = new NetworkClient({ host: "192.168.1.1", apiKey: "k", verifySsl: true, readOnly: false, writeTools });
      const { server, handlers } = createMockServer();
      registerAllTools(server, client, false, { writeTools });
      const result = await handlers.get("unifi_delete_firewall_zone")({ siteId: "s1", firewallZoneId: "zone-int", confirm: true }, {});
      expect(result.isError).toBeUndefined();
      expect(fetchMock.mock.calls.map(([url, options]) => `${(options as RequestInit).method} ${url as string}`)).toEqual([
        `GET ${HOST}/integration/v1/sites/s1/firewall/zones?offset=0&limit=200`,
        `DELETE ${HOST}/integration/v1/sites/s1/firewall/zones/zone-int`,
      ]);
    });

    it("guards the controller history routes too", async () => {
      const client = new NetworkClient({ host: "192.168.1.1", apiKey: "k", verifySsl: true, readOnly: true });
      await client.getClientHistory("default", 24);
      await client.getClientSessions("default", { start: 1789272000, end: 1789275600, limit: 10 });
      expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
        `${HOST}/v2/api/site/default/clients/history?withinHours=24`,
        `${HOST}/api/s/default/stat/session`,
      ]);
    });

    it("guards the classic port-forward and settings reads too", async () => {
      const client = new NetworkClient({ host: "192.168.1.1", apiKey: "k", verifySsl: true, readOnly: true });
      await client.getClassic("default", "portforward");
      await client.getClassicSettings("default");
      expect(fetchMock.mock.calls.map(([url, options]) => `${(options as RequestInit).method} ${url as string}`)).toEqual([
        `GET ${HOST}/api/s/default/rest/portforward`,
        `GET ${HOST}/api/s/default/get/setting`,
      ]);
    });

    it("sends nothing for a classic collection outside the allowlist or a bad site reference", async () => {
      const client = new NetworkClient({ host: "192.168.1.1", apiKey: "k", verifySsl: true, readOnly: true });
      await expect(client.getClassic("default", "user" as never)).rejects.toThrow();
      await expect(client.getClassic("../x", "portforward")).rejects.toThrow("internalReference");
      await expect(client.getClassicSettings("default/../x")).rejects.toThrow("internalReference");
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});
