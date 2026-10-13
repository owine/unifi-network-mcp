import { describe, it, expect, beforeEach } from "vitest";
import { createMockServer, createMockClient, mockFn } from "./_helpers.js";
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
    risky: { "disabling the policy": { siteId: "s1", firewallPolicyId: "p1", policy: { enabled: false } } },
    benign: { siteId: "s1", firewallPolicyId: "p1", policy: { loggingEnabled: true } },
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
    describe(tool, () => {
      beforeEach(() => {
        if (current !== undefined) mockFn(client, "get").mockResolvedValue(current);
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

        it(`previews ${label} without confirm`, async () => {
          const result = await handlers.get(tool)!({ ...input, dryRun: true });
          expect(result.structuredContent).toMatchObject({ dryRun: true });
          expect(mockFn(client, write)).not.toHaveBeenCalled();
        });
      }

      it("needs no confirm for a change that opens nothing", async () => {
        const result = await handlers.get(tool)!(benign);
        expect(result.isError).toBeUndefined();
        expect(mockFn(client, write)).toHaveBeenCalledTimes(1);
      });
    });
  }
});
