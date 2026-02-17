import { describe, it, expect } from "vitest";
import { createMockServer, createMockClient, parseInputSchema } from "./_helpers.js";
import { registerAllTools } from "../../src/tools/index.js";

/**
 * Schema validation tests.
 *
 * The handler tests in other files bypass schema validation entirely
 * (createMockServer passes raw input to handlers), so these tests
 * ensure that schemas actually reject invalid inputs at the Zod level.
 */

const { server, configs } = createMockServer();
const client = createMockClient();
registerAllTools(server, client, false);

describe("required siteId field", () => {
  // Only test list tools where siteId is the sole required field
  const toolsWithOnlySiteId = [
    "unifi_list_devices",
    "unifi_list_clients",
    "unifi_list_networks",
    "unifi_list_wifi",
    "unifi_list_firewall_zones",
    "unifi_list_firewall_policies",
    "unifi_list_acl_rules",
    "unifi_list_dns_policies",
    "unifi_list_traffic_matching_lists",
  ];

  for (const toolName of toolsWithOnlySiteId) {
    describe(toolName, () => {
      const schema = parseInputSchema(configs, toolName);

      it("accepts a valid string siteId", () => {
        const result = schema.safeParse({ siteId: "site1" });
        expect(result.success).toBe(true);
      });

      it("rejects missing siteId", () => {
        const result = schema.safeParse({});
        expect(result.success).toBe(false);
      });

      it("rejects non-string siteId", () => {
        const result = schema.safeParse({ siteId: 123 });
        expect(result.success).toBe(false);
      });
    });
  }
});

describe("required compound ID fields", () => {
  const toolsWithResourceId = [
    { tool: "unifi_get_device", idField: "deviceId" },
    { tool: "unifi_get_client", idField: "clientId" },
    { tool: "unifi_get_network", idField: "networkId" },
    { tool: "unifi_get_wifi", idField: "wifiBroadcastId" },
    { tool: "unifi_get_firewall_zone", idField: "firewallZoneId" },
    { tool: "unifi_get_firewall_policy", idField: "firewallPolicyId" },
    { tool: "unifi_get_acl_rule", idField: "aclRuleId" },
    { tool: "unifi_get_dns_policy", idField: "dnsPolicyId" },
    { tool: "unifi_get_traffic_matching_list", idField: "trafficMatchingListId" },
  ];

  for (const { tool, idField } of toolsWithResourceId) {
    describe(tool, () => {
      const schema = parseInputSchema(configs, tool);

      it("accepts valid siteId and resource ID", () => {
        const result = schema.safeParse({ siteId: "site1", [idField]: "res1" });
        expect(result.success).toBe(true);
      });

      it(`rejects missing ${idField}`, () => {
        const result = schema.safeParse({ siteId: "site1" });
        expect(result.success).toBe(false);
      });

      it(`rejects non-string ${idField}`, () => {
        const result = schema.safeParse({ siteId: "site1", [idField]: 123 });
        expect(result.success).toBe(false);
      });
    });
  }
});

describe("optional dryRun field", () => {
  const toolsWithDryRun = [
    "unifi_adopt_device",
    "unifi_remove_device",
    "unifi_restart_device",
    "unifi_power_cycle_port",
    "unifi_create_network",
    "unifi_update_network",
    "unifi_delete_network",
    "unifi_create_wifi",
    "unifi_update_wifi",
    "unifi_delete_wifi",
    "unifi_create_voucher",
    "unifi_delete_voucher",
    "unifi_bulk_delete_vouchers",
  ];

  for (const toolName of toolsWithDryRun) {
    describe(toolName, () => {
      const schema = parseInputSchema(configs, toolName);

      it("accepts dryRun: true", () => {
        const base = buildMinimalInput(toolName);
        const result = schema.safeParse({ ...base, dryRun: true });
        expect(result.success).toBe(true);
      });

      it("accepts dryRun: false", () => {
        const base = buildMinimalInput(toolName);
        const result = schema.safeParse({ ...base, dryRun: false });
        expect(result.success).toBe(true);
      });

      it("accepts dryRun: undefined (omitted)", () => {
        const base = buildMinimalInput(toolName);
        const result = schema.safeParse(base);
        expect(result.success).toBe(true);
      });

      it("rejects dryRun: string", () => {
        const base = buildMinimalInput(toolName);
        const result = schema.safeParse({ ...base, dryRun: "true" });
        expect(result.success).toBe(false);
      });
    });
  }
});

describe("optional confirm field", () => {
  const toolsWithConfirm = [
    "unifi_remove_device",
    "unifi_delete_network",
    "unifi_delete_wifi",
    "unifi_delete_voucher",
    "unifi_bulk_delete_vouchers",
    "unifi_delete_firewall_zone",
    "unifi_delete_firewall_policy",
    "unifi_delete_acl_rule",
    "unifi_delete_dns_policy",
    "unifi_delete_traffic_matching_list",
  ];

  for (const toolName of toolsWithConfirm) {
    describe(toolName, () => {
      const schema = parseInputSchema(configs, toolName);

      it("accepts confirm: true", () => {
        const base = buildMinimalInput(toolName);
        const result = schema.safeParse({ ...base, confirm: true });
        expect(result.success).toBe(true);
      });

      it("accepts confirm: false", () => {
        const base = buildMinimalInput(toolName);
        const result = schema.safeParse({ ...base, confirm: false });
        expect(result.success).toBe(true);
      });

      it("accepts confirm: undefined (omitted)", () => {
        const base = buildMinimalInput(toolName);
        const result = schema.safeParse(base);
        expect(result.success).toBe(true);
      });

      it("rejects confirm: string", () => {
        const base = buildMinimalInput(toolName);
        const result = schema.safeParse({ ...base, confirm: "true" });
        expect(result.success).toBe(false);
      });

      it("rejects confirm: number", () => {
        const base = buildMinimalInput(toolName);
        const result = schema.safeParse({ ...base, confirm: 1 });
        expect(result.success).toBe(false);
      });
    });
  }
});

describe("pagination parameters", () => {
  const paginatedTools = [
    "unifi_list_devices",
    "unifi_list_clients",
    "unifi_list_networks",
    "unifi_list_wifi",
    "unifi_list_firewall_zones",
    "unifi_list_firewall_policies",
    "unifi_list_acl_rules",
    "unifi_list_dns_policies",
    "unifi_list_traffic_matching_lists",
  ];

  for (const toolName of paginatedTools) {
    describe(toolName, () => {
      const schema = parseInputSchema(configs, toolName);

      it("accepts offset and limit as numbers", () => {
        const result = schema.safeParse({
          siteId: "site1",
          offset: 0,
          limit: 25,
        });
        expect(result.success).toBe(true);
      });

      it("rejects string offset", () => {
        const result = schema.safeParse({
          siteId: "site1",
          offset: "0",
          limit: 25,
        });
        expect(result.success).toBe(false);
      });

      it("rejects string limit", () => {
        const result = schema.safeParse({
          siteId: "site1",
          offset: 0,
          limit: "25",
        });
        expect(result.success).toBe(false);
      });
    });
  }
});

/** Build minimal valid input for a tool (without dryRun/confirm) */
function buildMinimalInput(toolName: string): Record<string, unknown> {
  const inputs: Record<string, Record<string, unknown>> = {
    unifi_adopt_device: { siteId: "site1", macAddress: "00:11:22:33:44:55" },
    unifi_remove_device: { siteId: "site1", deviceId: "dev1" },
    unifi_restart_device: { siteId: "site1", deviceId: "dev1" },
    unifi_power_cycle_port: { siteId: "site1", deviceId: "dev1", portIdx: 1 },
    unifi_create_network: {
      siteId: "site1",
      name: "test",
      management: "GATEWAY",
      enabled: true,
      vlanId: 1,
    },
    unifi_update_network: {
      siteId: "site1",
      networkId: "net1",
      name: "test",
      management: "GATEWAY",
      enabled: true,
      vlanId: 1,
    },
    unifi_delete_network: { siteId: "site1", networkId: "net1" },
    unifi_create_wifi: {
      siteId: "site1",
      name: "test",
      enabled: true,
      type: "STANDARD",
      broadcastingFrequenciesGHz: ["5"],
    },
    unifi_update_wifi: { siteId: "site1", wifiBroadcastId: "wifi1" },
    unifi_delete_wifi: { siteId: "site1", wifiBroadcastId: "wifi1" },
    unifi_create_voucher: {
      siteId: "site1",
      name: "guest",
      timeLimitMinutes: 60,
    },
    unifi_delete_voucher: { siteId: "site1", voucherId: "v1" },
    unifi_bulk_delete_vouchers: {
      siteId: "site1",
      filter: "expired.eq(true)",
    },
    unifi_delete_firewall_zone: { siteId: "site1", firewallZoneId: "zone1" },
    unifi_delete_firewall_policy: {
      siteId: "site1",
      firewallPolicyId: "pol1",
    },
    unifi_delete_acl_rule: { siteId: "site1", aclRuleId: "acl1" },
    unifi_delete_dns_policy: { siteId: "site1", dnsPolicyId: "dns1" },
    unifi_delete_traffic_matching_list: {
      siteId: "site1",
      trafficMatchingListId: "tml1",
    },
  };
  return inputs[toolName] ?? { siteId: "site1" };
}
