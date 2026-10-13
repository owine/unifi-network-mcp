import { describe, it, expect, beforeEach } from "vitest";
import { createMockServer, createMockClient, mockFn } from "./_helpers.js";
import { registerAllTools } from "../../src/tools/index.js";
import type { NetworkClient } from "../../src/client.js";

/**
 * Parallel updates to one resource must not lose a write. Each merge tool
 * reads the resource, merges and PUTs it back; unserialised, two calls would
 * interleave GET, GET, PUT, PUT and the second PUT would revert the first.
 */

// Yield to the event loop, so unserialised calls interleave.
const tick = () => new Promise((resolve) => setImmediate(resolve));

const firewallPolicy = {
  id: "p1", enabled: true, name: "Allow SSH", action: { type: "ALLOW" },
  source: { zoneId: "z1" }, destination: { zoneId: "z2" },
  ipProtocolScope: { ipVersion: "IPV4" }, loggingEnabled: false,
};

const cases = [
  {
    tool: "unifi_update_firewall_policy",
    current: firewallPolicy,
    a: { siteId: "s1", firewallPolicyId: "p1", policy: { name: "Renamed" } },
    b: { siteId: "s1", firewallPolicyId: "p1", policy: { loggingEnabled: true } },
    expected: { name: "Renamed", loggingEnabled: true },
  },
  {
    tool: "unifi_update_wifi",
    current: {
      id: "w1", type: "STANDARD", name: "Office", enabled: true, broadcastingFrequenciesGHz: [5],
      securityConfiguration: { type: "WPA2_PERSONAL", passphrase: "correct-horse" },
      multicastToUnicastConversionEnabled: false, clientIsolationEnabled: false, hideName: false,
      uapsdEnabled: false, arpProxyEnabled: false, bssTransitionEnabled: false, advertiseDeviceName: false,
      channel2gLockedTo6: false, dtimPeriod2gLockedTo3: false,
    },
    a: { siteId: "s1", wifiBroadcastId: "w1", name: "Renamed" },
    b: { siteId: "s1", wifiBroadcastId: "w1", hideName: true },
    expected: { name: "Renamed", hideName: true },
  },
  {
    tool: "unifi_update_acl_rule",
    current: { id: "r1", type: "IPV4", name: "Block cams", enabled: true, action: "BLOCK" },
    a: { siteId: "s1", aclRuleId: "r1", name: "Renamed" },
    b: { siteId: "s1", aclRuleId: "r1", description: "Cameras stay off the LAN" },
    expected: { name: "Renamed", description: "Cameras stay off the LAN" },
  },
  {
    tool: "unifi_update_network",
    current: { id: "n1", management: "UNMANAGED", name: "IoT", enabled: true, vlanId: 20 },
    a: { siteId: "s1", networkId: "n1", name: "Renamed" },
    b: { siteId: "s1", networkId: "n1", vlanId: 30 },
    expected: { name: "Renamed", vlanId: 30 },
  },
  {
    tool: "unifi_update_dns_policy",
    current: { id: "d1", type: "A_RECORD", enabled: true, domain: "nas.example.com", ipv4Address: "192.0.2.10", ttlSeconds: 3600 },
    a: { siteId: "s1", dnsPolicyId: "d1", ipv4Address: "192.0.2.20" },
    b: { siteId: "s1", dnsPolicyId: "d1", ttlSeconds: 60 },
    expected: { ipv4Address: "192.0.2.20", ttlSeconds: 60 },
  },
];

describe("parallel updates to one resource", () => {
  let client: NetworkClient;
  let handlers: ReturnType<typeof createMockServer>["handlers"];
  let stored: Record<string, unknown>;

  beforeEach(() => {
    const server = createMockServer();
    client = createMockClient();
    registerAllTools(server.server, client, false);
    handlers = server.handlers;
    // A controller holding one resource, answering after a tick.
    mockFn(client, "get").mockImplementation(async () => {
      await tick();
      return { ...stored };
    });
    for (const method of ["put", "patch"] as const) {
      mockFn(client, method).mockImplementation(async (_path: string, body: Record<string, unknown>) => {
        await tick();
        stored = { ...stored, ...body };
        return stored;
      });
    }
  });

  for (const { tool, current, a, b, expected } of cases) {
    it(`${tool} keeps both changes`, async () => {
      stored = { ...current };
      const results = await Promise.all([handlers.get(tool)(a), handlers.get(tool)(b)]);
      expect(results.map((r) => r.isError)).toEqual([undefined, undefined]);
      expect(stored).toMatchObject(expected);
    });
  }

  it("queues a firewall PATCH behind an in-flight update of the same policy", async () => {
    stored = { ...firewallPolicy };
    // Hold the update between its read and its write: the GET snapshots the
    // policy when called and answers only when released.
    let releaseGet!: () => void;
    mockFn(client, "get").mockImplementation(() => {
      const snapshot = { ...stored };
      return new Promise((resolve) => (releaseGet = () => { resolve(snapshot); }));
    });

    const update = handlers.get("unifi_update_firewall_policy")({ siteId: "s1", firewallPolicyId: "p1", policy: { name: "Renamed" } });
    await tick();
    const patch = handlers.get("unifi_patch_firewall_policy")({ siteId: "s1", firewallPolicyId: "p1", policy: { loggingEnabled: true } });
    await tick();
    await tick();
    releaseGet();
    await Promise.all([update, patch]);

    expect(stored).toMatchObject({ name: "Renamed", loggingEnabled: true });
  });
});
