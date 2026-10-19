import { describe, it, expect, beforeEach } from "vitest";
import { createMockServer, createMockClient, mockFn, answerWanLookups } from "./_helpers.js";
import { registerAllTools } from "../../src/tools/index.js";
import type { NetworkClient } from "../../src/client.js";

/**
 * Writes that are routine in general but open access with particular inputs
 * (an ALLOW rule, an open SSID, a large batch of guest codes) need
 * confirm: true. The same tools need no confirmation for other changes, and
 * a dry run never does.
 */

const blockPolicy = {
  id: "p1",
  enabled: true,
  name: "Block IoT to LAN",
  action: { type: "BLOCK" },
  source: { zoneId: "zone-iot" },
  destination: { zoneId: "zone-lan" },
  ipProtocolScope: { ipVersion: "IPV4_AND_IPV6" },
  loggingEnabled: false,
};

const wifiRequired = {
  name: "Office",
  enabled: true,
  type: "STANDARD",
  broadcastingFrequenciesGHz: [2.4, 5],
  multicastToUnicastConversionEnabled: false,
  clientIsolationEnabled: false,
  hideName: false,
  uapsdEnabled: false,
  arpProxyEnabled: false,
  bssTransitionEnabled: false,
  advertiseDeviceName: false,
  channel2gLockedTo6: false,
  dtimPeriod2gLockedTo3: false,
};
const securedSsid = { id: "w1", ...wifiRequired, securityConfiguration: { type: "WPA2_PERSONAL", passphrase: "correct-horse" } };

const blockAcl = { id: "r1", type: "IPV4", name: "Block cameras", enabled: true, action: "BLOCK" };

const allowPolicy = { ...blockPolicy, name: "Allow IoT to NAS", action: { type: "ALLOW" } };
const disabledAllowPolicy = { ...allowPolicy, enabled: false };
const allowAcl = { id: "r1", type: "IPV4", name: "Allow camera NVR", enabled: true, action: "ALLOW", sourceFilter: { type: "IP_ADDRESSES", ipAddresses: ["10.0.0.5"] } };
const disabledAllowAcl = { ...allowAcl, enabled: false };
const openSsid = { id: "w1", ...wifiRequired, securityConfiguration: { type: "OPEN" }, hotspotConfiguration: { type: "CAPTIVE_PORTAL" } };
const disabledOpenSsid = { ...openSsid, enabled: false };

interface Case {
  tool: string;
  write: "post" | "put" | "patch";
  current?: unknown;
  risky: Record<string, Record<string, unknown>>;
  benign: Record<string, unknown>;
}

const cases: Case[] = [
  {
    tool: "unifi_create_firewall_policy",
    write: "post",
    risky: { "an ALLOW policy": { siteId: "s1", policy: { ...blockPolicy, id: undefined, action: { type: "ALLOW" } } } },
    benign: { siteId: "s1", policy: { name: "Block", action: { type: "BLOCK" } } },
  },
  {
    tool: "unifi_update_firewall_policy",
    write: "put",
    current: blockPolicy,
    risky: {
      "a switch to ALLOW": { siteId: "s1", firewallPolicyId: "p1", policy: { action: { type: "ALLOW" } } },
      "disabling a blocking policy": { siteId: "s1", firewallPolicyId: "p1", policy: { enabled: false } },
    },
    benign: { siteId: "s1", firewallPolicyId: "p1", policy: { name: "Renamed" } },
  },
  {
    tool: "unifi_patch_firewall_policy",
    write: "patch",
    current: blockPolicy,
    risky: { "disabling a blocking policy": { siteId: "s1", firewallPolicyId: "p1", policy: { enabled: false } } },
    benign: { siteId: "s1", firewallPolicyId: "p1", policy: { loggingEnabled: true } },
  },
  {
    tool: "unifi_patch_firewall_policy",
    write: "patch",
    current: disabledAllowPolicy,
    risky: { "enabling a disabled ALLOW": { siteId: "s1", firewallPolicyId: "p1", policy: { enabled: true } } },
    benign: { siteId: "s1", firewallPolicyId: "p1", policy: { reportFlowEnabled: false } },
  },
  {
    tool: "unifi_patch_firewall_policy",
    write: "patch",
    current: allowPolicy,
    risky: { "moving an ALLOW's destination": { siteId: "s1", firewallPolicyId: "p1", policy: { destination: { zoneId: "zone-gateway" } } } },
    // Restating an ALLOW's own action opens nothing; this used to be refused as a "create".
    benign: { siteId: "s1", firewallPolicyId: "p1", policy: { action: { type: "ALLOW" }, loggingEnabled: true } },
  },
  {
    tool: "unifi_update_firewall_policy",
    write: "put",
    current: disabledAllowPolicy,
    risky: { "enabling a disabled ALLOW": { siteId: "s1", firewallPolicyId: "p1", policy: { enabled: true } } },
    benign: { siteId: "s1", firewallPolicyId: "p1", policy: { name: "Renamed" } },
  },
  {
    tool: "unifi_update_firewall_policy",
    write: "put",
    current: allowPolicy,
    risky: {
      "widening an ALLOW's source": { siteId: "s1", firewallPolicyId: "p1", policy: { source: { zoneId: "zone-lan" } } },
      "making an ALLOW always active": { siteId: "s1", firewallPolicyId: "p1", policy: { schedule: null } },
    },
    benign: { siteId: "s1", firewallPolicyId: "p1", policy: { loggingEnabled: true } },
  },
  {
    tool: "unifi_create_firewall_policy",
    write: "post",
    risky: { "a lower-case allow": { siteId: "s1", policy: { ...blockPolicy, id: undefined, action: { type: "allow" } } } },
    benign: { siteId: "s1", policy: { name: "Reject", action: { type: "REJECT" } } },
  },
  {
    tool: "unifi_create_wifi",
    write: "post",
    risky: { "an open SSID": { siteId: "s1", ...wifiRequired, securityConfiguration: { type: "OPEN" } } },
    benign: { siteId: "s1", ...wifiRequired, securityConfiguration: { type: "WPA2_PERSONAL", passphrase: "correct-horse" } },
  },
  {
    tool: "unifi_update_wifi",
    write: "put",
    current: securedSsid,
    risky: { "a security type change": { siteId: "s1", wifiBroadcastId: "w1", securityConfiguration: { type: "OPEN" } } },
    benign: { siteId: "s1", wifiBroadcastId: "w1", name: "Renamed" },
  },
  {
    tool: "unifi_update_wifi",
    write: "put",
    current: disabledOpenSsid,
    risky: { "enabling an open SSID": { siteId: "s1", wifiBroadcastId: "w1", enabled: true } },
    benign: { siteId: "s1", wifiBroadcastId: "w1", name: "Renamed" },
  },
  {
    tool: "unifi_update_wifi",
    write: "put",
    current: openSsid,
    risky: {
      "removing an open SSID's captive portal": { siteId: "s1", wifiBroadcastId: "w1", hotspotConfiguration: null },
      "moving an open SSID to another network": { siteId: "s1", wifiBroadcastId: "w1", network: { type: "SPECIFIC", networkId: "lan" } },
    },
    benign: { siteId: "s1", wifiBroadcastId: "w1", hideName: true },
  },
  {
    tool: "unifi_create_wifi",
    write: "post",
    risky: { "a lower-case open SSID": { siteId: "s1", ...wifiRequired, securityConfiguration: { type: "open" } } },
    benign: { siteId: "s1", ...wifiRequired, securityConfiguration: { type: "WPA3_PERSONAL", passphrase: "correct-horse" } },
  },
  {
    tool: "unifi_create_acl_rule",
    write: "post",
    risky: { "an ALLOW rule": { siteId: "s1", type: "IPV4", name: "Allow cams", enabled: true, action: "ALLOW" } },
    benign: { siteId: "s1", type: "IPV4", name: "Block cams", enabled: true, action: "BLOCK" },
  },
  {
    tool: "unifi_update_acl_rule",
    write: "put",
    current: blockAcl,
    risky: {
      "a switch to ALLOW": { siteId: "s1", aclRuleId: "r1", action: "ALLOW" },
      "disabling a BLOCK rule": { siteId: "s1", aclRuleId: "r1", enabled: false },
    },
    benign: { siteId: "s1", aclRuleId: "r1", name: "Renamed" },
  },
  {
    tool: "unifi_update_acl_rule",
    write: "put",
    current: disabledAllowAcl,
    risky: { "enabling a disabled ALLOW": { siteId: "s1", aclRuleId: "r1", enabled: true } },
    benign: { siteId: "s1", aclRuleId: "r1", name: "Renamed" },
  },
  {
    tool: "unifi_update_acl_rule",
    write: "put",
    current: allowAcl,
    risky: {
      "an ALLOW opened to all sources": { siteId: "s1", aclRuleId: "r1", sourceFilter: null },
      "a type change": { siteId: "s1", aclRuleId: "r1", type: "MAC", sourceFilter: { type: "MAC_ADDRESSES", macAddresses: ["aa:bb:cc:dd:ee:ff"] } },
    },
    benign: { siteId: "s1", aclRuleId: "r1", description: "NVR only" },
  },
  {
    tool: "unifi_create_voucher",
    write: "post",
    risky: { "more than 10 codes": { siteId: "s1", name: "Event", timeLimitMinutes: 60, count: 50 } },
    benign: { siteId: "s1", name: "Guest", timeLimitMinutes: 60, count: 5 },
  },
];

describe("confirmation for writes that open access", () => {
  let client: NetworkClient;
  let handlers: Map<string, (...args: any[]) => any>;
  let configs: ReturnType<typeof createMockServer>["configs"];

  beforeEach(() => {
    const server = createMockServer();
    client = createMockClient();
    registerAllTools(server.server, client, false);
    handlers = server.handlers;
    configs = server.configs;
  });

  for (const { tool, write, current, risky, benign } of cases) {
    describe(`${tool}${current === undefined ? "" : ` on ${(current as { name: string }).name}${(current as { enabled?: boolean }).enabled === false ? " (disabled)" : ""}`}`, () => {
      beforeEach(() => {
        // ALLOW policies read the zones first (tests/tools/wan-exposure.test.ts).
        answerWanLookups(client, current);
        mockFn(client, write).mockResolvedValue({ id: "new" });
      });

      it("declares an optional confirm input", () => {
        expect(configs.get(tool)?.schema).toHaveProperty("confirm");
      });

      for (const [label, input] of Object.entries(risky)) {
        it(`requires confirm for ${label}`, async () => {
          const result = await handlers.get(tool)!(input);
          expect(result.isError).toBe(true);
          expect(result.content[0].text).toContain("confirmation");
          expect(mockFn(client, write)).not.toHaveBeenCalled();
        });

        it(`executes ${label} with confirm`, async () => {
          const result = await handlers.get(tool)!({ ...input, confirm: true });
          expect(result.isError).toBeUndefined();
          expect(mockFn(client, write)).toHaveBeenCalledTimes(1);
        });

        it(`previews ${label} without confirm, saying the real call needs it`, async () => {
          const result = await handlers.get(tool)!({ ...input, dryRun: true });
          expect(result.structuredContent).toMatchObject({ dryRun: true, confirmationRequired: expect.any(String) });
          expect(mockFn(client, write)).not.toHaveBeenCalled();
        });
      }

      it("previews a change that opens nothing without asking for confirm", async () => {
        const result = await handlers.get(tool)!({ ...benign, dryRun: true });
        expect(result.structuredContent).toMatchObject({ dryRun: true });
        expect(result.structuredContent).not.toHaveProperty("confirmationRequired");
      });

      it("needs no confirm for a change that opens nothing", async () => {
        const result = await handlers.get(tool)!(benign);
        expect(result.isError).toBeUndefined();
        expect(mockFn(client, write)).toHaveBeenCalledTimes(1);
      });
    });
  }
});

describe("confirmation for reorders that move an ALLOW ahead of a BLOCK", () => {
  let client: NetworkClient;
  let handlers: Map<string, (...args: any[]) => any>;

  // Each GET answered by path: the current order, then the rules it moves past one another.
  function controller(resources: Record<string, unknown>) {
    mockFn(client, "get").mockImplementation((path: string) =>
      path in resources ? Promise.resolve(resources[path]) : Promise.reject(new Error(`HTTP 404: no ${path}`)));
    mockFn(client, "put").mockResolvedValue({});
  }

  beforeEach(() => {
    const server = createMockServer();
    client = createMockClient();
    // The WAN refusal for reorders has its own suite (tests/tools/wan-exposure.test.ts).
    registerAllTools(server.server, client, false, { wan: { allowExposure: true, zoneIds: [] } });
    handlers = server.handlers;
  });

  describe("unifi_reorder_acl_rules", () => {
    const acl = (action: string, enabled = true) => ({ type: "IPV4", name: action, enabled, action });
    beforeEach(() => {
      controller({
        "/sites/s1/acl-rules/ordering": { orderedAclRuleIds: ["block", "allow", "allow2", "offblock"] },
        "/sites/s1/acl-rules/block": acl("BLOCK"),
        "/sites/s1/acl-rules/allow": acl("ALLOW"),
        "/sites/s1/acl-rules/allow2": acl("ALLOW"),
        "/sites/s1/acl-rules/offblock": acl("BLOCK", false),
      });
    });
    const reorder = (ids: string[], extra: Record<string, unknown> = {}) =>
      handlers.get("unifi_reorder_acl_rules")!({ siteId: "s1", orderedAclRuleIds: ids, ...extra });

    it("requires confirm to move an ALLOW ahead of a BLOCK", async () => {
      const result = await reorder(["allow", "block", "allow2", "offblock"]);
      expect(result.content[0].text).toContain("confirmation");
      expect(mockFn(client, "put")).not.toHaveBeenCalled();
    });

    it("executes it with confirm", async () => {
      const result = await reorder(["allow", "block", "allow2", "offblock"], { confirm: true });
      expect(result.isError).toBeUndefined();
      expect(mockFn(client, "put")).toHaveBeenCalledTimes(1);
    });

    it("says so in a dry run", async () => {
      const result = await reorder(["allow", "block", "allow2", "offblock"], { dryRun: true });
      expect(result.structuredContent).toMatchObject({ dryRun: true, confirmationRequired: expect.stringContaining("ALLOW rule ahead of a BLOCK") });
    });

    it.each([
      ["an ALLOW past an ALLOW", ["block", "allow2", "allow", "offblock"]],
      ["a BLOCK moved earlier", ["block", "offblock", "allow", "allow2"]],
      ["an ALLOW past a disabled BLOCK", ["block", "allow", "offblock", "allow2"]],
      ["the same order", ["block", "allow", "allow2", "offblock"]],
    ])("needs no confirm for %s", async (_label, ids) => {
      const result = await reorder(ids);
      expect(result.isError).toBeUndefined();
      expect(mockFn(client, "put")).toHaveBeenCalledTimes(1);
    });
  });

  describe("unifi_reorder_firewall_policies", () => {
    const orderingPath = "/sites/s1/firewall/policies/ordering?sourceFirewallZoneId=zone-iot&destinationFirewallZoneId=zone-lan";
    const policy = (type: string) => ({ ...blockPolicy, action: { type } });
    beforeEach(() => {
      controller({
        [orderingPath]: { orderedFirewallPolicyIds: { beforeSystemDefined: ["block", "block2"], afterSystemDefined: ["allow"] } },
        "/sites/s1/firewall/policies/block": policy("BLOCK"),
        "/sites/s1/firewall/policies/block2": policy("REJECT"),
        "/sites/s1/firewall/policies/allow": policy("ALLOW"),
      });
    });
    const reorder = (beforeSystemDefined: string[], afterSystemDefined: string[]) =>
      handlers.get("unifi_reorder_firewall_policies")!({
        siteId: "s1", sourceFirewallZoneId: "zone-iot", destinationFirewallZoneId: "zone-lan",
        orderedFirewallPolicyIds: { beforeSystemDefined, afterSystemDefined },
      });

    it.each([
      ["an ALLOW ahead of a BLOCK", ["allow", "block", "block2"], []],
      ["an ALLOW ahead of the system-defined policies", ["block", "block2", "allow"], []],
      ["a BLOCK behind the system-defined policies", ["block"], ["block2", "allow"]],
    ])("requires confirm to move %s", async (_label, before, after) => {
      const result = await reorder(before, after);
      expect(result.content[0].text).toContain("confirmation");
      expect(mockFn(client, "put")).not.toHaveBeenCalled();
    });

    it("needs no confirm to swap two blocking policies", async () => {
      const result = await reorder(["block2", "block"], ["allow"]);
      expect(result.isError).toBeUndefined();
      expect(mockFn(client, "put")).toHaveBeenCalledTimes(1);
    });
  });
});
