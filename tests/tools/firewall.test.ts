import { describe, it, expect, beforeEach } from "vitest";
import { createMockServer, createMockClient, mockFn } from "./_helpers.js";
import { registerFirewallTools } from "../../src/tools/firewall.js";

describe("registerFirewallTools", () => {
  let server: ReturnType<typeof createMockServer>["server"];
  let handlers: ReturnType<typeof createMockServer>["handlers"];
  let configs: ReturnType<typeof createMockServer>["configs"];
  let client: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    const mock = createMockServer();
    server = mock.server;
    handlers = mock.handlers;
    configs = mock.configs;
    client = createMockClient();
  });

  describe("read-only tools", () => {
    beforeEach(() => {
      registerFirewallTools(server, client, false);
    });

    describe("unifi_list_firewall_zones", () => {
      it("should register the tool", () => {
        expect(handlers.has("unifi_list_firewall_zones")).toBe(true);
      });

      it("should have correct annotations", () => {
        const config = configs.get("unifi_list_firewall_zones");
        expect(config?.annotations.readOnlyHint).toBe(true);
        expect(config?.annotations.destructiveHint).toBe(false);
      });

      it("should return success when client.get succeeds", async () => {
        const mockData = { data: [{ id: "zone1", name: "LAN" }] };
        mockFn(client, "get").mockResolvedValue(mockData);

        const handler = handlers.get("unifi_list_firewall_zones");
        const result = await handler({
          siteId: "site123",
          offset: 0,
          limit: 25,
          filter: "name.like(lan)",
        });

        expect(mockFn(client, "get")).toHaveBeenCalledWith(
          "/sites/site123/firewall/zones?offset=0&limit=25&filter=name.like%28lan%29"
        );
        expect(result.content).toBeDefined();
        expect(result.content[0].text).toContain("zone1");
        expect(result.isError).toBeUndefined();
      });

      it("should return error when client.get fails", async () => {
        const testError = new Error("API connection failed");
        mockFn(client, "get").mockRejectedValue(testError);

        const handler = handlers.get("unifi_list_firewall_zones");
        const result = await handler({ siteId: "site123" });

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain("API connection failed");
      });
    });

    describe("unifi_get_firewall_zone", () => {
      it("should register the tool", () => {
        expect(handlers.has("unifi_get_firewall_zone")).toBe(true);
      });

      it("should have correct annotations", () => {
        const config = configs.get("unifi_get_firewall_zone");
        expect(config?.annotations.readOnlyHint).toBe(true);
        expect(config?.annotations.destructiveHint).toBe(false);
      });

      it("should return success when client.get succeeds", async () => {
        const mockData = { id: "zone1", name: "LAN" };
        mockFn(client, "get").mockResolvedValue(mockData);

        const handler = handlers.get("unifi_get_firewall_zone");
        const result = await handler({ siteId: "site123", firewallZoneId: "zone1" });

        expect(mockFn(client, "get")).toHaveBeenCalledWith(
          "/sites/site123/firewall/zones/zone1"
        );
        expect(result.content).toBeDefined();
        expect(result.content[0].text).toContain("LAN");
        expect(result.isError).toBeUndefined();
      });

      it("should return error when client.get fails", async () => {
        const testError = new Error("Zone not found");
        mockFn(client, "get").mockRejectedValue(testError);

        const handler = handlers.get("unifi_get_firewall_zone");
        const result = await handler({ siteId: "site123", firewallZoneId: "zone1" });

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain("Zone not found");
      });
    });

    describe("unifi_list_firewall_policies", () => {
      it("should register the tool", () => {
        expect(handlers.has("unifi_list_firewall_policies")).toBe(true);
      });

      it("should have correct annotations", () => {
        const config = configs.get("unifi_list_firewall_policies");
        expect(config?.annotations.readOnlyHint).toBe(true);
        expect(config?.annotations.destructiveHint).toBe(false);
      });

      it("should return success when client.get succeeds", async () => {
        const mockData = { data: [{ id: "policy1", name: "Allow SSH" }] };
        mockFn(client, "get").mockResolvedValue(mockData);

        const handler = handlers.get("unifi_list_firewall_policies");
        const result = await handler({ siteId: "site123" });

        expect(mockFn(client, "get")).toHaveBeenCalledWith(
          "/sites/site123/firewall/policies"
        );
        expect(result.content).toBeDefined();
        expect(result.content[0].text).toContain("Allow SSH");
        expect(result.isError).toBeUndefined();
      });

      it("should return error when client.get fails", async () => {
        const testError = new Error("Failed to fetch policies");
        mockFn(client, "get").mockRejectedValue(testError);

        const handler = handlers.get("unifi_list_firewall_policies");
        const result = await handler({ siteId: "site123" });

        expect(result.isError).toBe(true);
      });
    });

    describe("unifi_get_firewall_policy", () => {
      it("should register the tool", () => {
        expect(handlers.has("unifi_get_firewall_policy")).toBe(true);
      });

      it("should have correct annotations", () => {
        const config = configs.get("unifi_get_firewall_policy");
        expect(config?.annotations.readOnlyHint).toBe(true);
        expect(config?.annotations.destructiveHint).toBe(false);
      });

      it("should return success when client.get succeeds", async () => {
        const mockData = { id: "policy1", name: "Allow SSH" };
        mockFn(client, "get").mockResolvedValue(mockData);

        const handler = handlers.get("unifi_get_firewall_policy");
        const result = await handler({
          siteId: "site123",
          firewallPolicyId: "policy1",
        });

        expect(mockFn(client, "get")).toHaveBeenCalledWith(
          "/sites/site123/firewall/policies/policy1"
        );
        expect(result.content).toBeDefined();
        expect(result.isError).toBeUndefined();
      });

      it("should return error when client.get fails", async () => {
        const testError = new Error("Policy not found");
        mockFn(client, "get").mockRejectedValue(testError);

        const handler = handlers.get("unifi_get_firewall_policy");
        const result = await handler({
          siteId: "site123",
          firewallPolicyId: "policy1",
        });

        expect(result.isError).toBe(true);
      });
    });

    describe("unifi_get_firewall_policy_ordering", () => {
      it("should register the tool", () => {
        expect(handlers.has("unifi_get_firewall_policy_ordering")).toBe(true);
      });

      it("should have correct annotations", () => {
        const config = configs.get("unifi_get_firewall_policy_ordering");
        expect(config?.annotations.readOnlyHint).toBe(true);
        expect(config?.annotations.destructiveHint).toBe(false);
      });

      it("should return success when client.get succeeds", async () => {
        const mockData = {
          beforeSystemDefined: ["policy1"],
          afterSystemDefined: ["policy2"],
        };
        mockFn(client, "get").mockResolvedValue(mockData);

        const handler = handlers.get("unifi_get_firewall_policy_ordering");
        const result = await handler({
          siteId: "site123",
          sourceFirewallZoneId: "zone1",
          destinationFirewallZoneId: "zone2",
        });

        expect(mockFn(client, "get")).toHaveBeenCalledWith(
          "/sites/site123/firewall/policies/ordering?sourceFirewallZoneId=zone1&destinationFirewallZoneId=zone2"
        );
        expect(result.content).toBeDefined();
        expect(result.isError).toBeUndefined();
      });

      it("should return error when client.get fails", async () => {
        const testError = new Error("Ordering not found");
        mockFn(client, "get").mockRejectedValue(testError);

        const handler = handlers.get("unifi_get_firewall_policy_ordering");
        const result = await handler({
          siteId: "site123",
          sourceFirewallZoneId: "zone1",
          destinationFirewallZoneId: "zone2",
        });

        expect(result.isError).toBe(true);
      });
    });
  });

  describe("write tools", () => {
    beforeEach(() => {
      registerFirewallTools(server, client, false);
    });

    describe("unifi_create_firewall_zone", () => {
      it("should register the tool", () => {
        expect(handlers.has("unifi_create_firewall_zone")).toBe(true);
      });

      it("should have correct annotations", () => {
        const config = configs.get("unifi_create_firewall_zone");
        expect(config?.annotations.readOnlyHint).toBe(false);
        expect(config?.annotations.destructiveHint).toBe(false);
        expect(config?.annotations.idempotentHint).toBe(false);
      });

      it("should return success when client.post succeeds", async () => {
        const mockData = { id: "zone2", name: "Guest" };
        mockFn(client, "post").mockResolvedValue(mockData);

        const handler = handlers.get("unifi_create_firewall_zone");
        const result = await handler({
          siteId: "site123",
          name: "Guest",
          networkIds: ["net1"],
        });

        expect(mockFn(client, "post")).toHaveBeenCalledWith(
          "/sites/site123/firewall/zones",
          { name: "Guest", networkIds: ["net1"] }
        );
        expect(result.content).toBeDefined();
        expect(result.isError).toBeUndefined();
      });

      it("should return error when client.post fails", async () => {
        const testError = new Error("Failed to create zone");
        mockFn(client, "post").mockRejectedValue(testError);

        const handler = handlers.get("unifi_create_firewall_zone");
        const result = await handler({
          siteId: "site123",
          name: "Guest",
          networkIds: ["net1"],
        });

        expect(result.isError).toBe(true);
      });

      it("should return dry run preview when dryRun=true", async () => {
        const handler = handlers.get("unifi_create_firewall_zone");
        const result = await handler({
          siteId: "site123",
          name: "Guest",
          networkIds: ["net1"],
          dryRun: true,
        });

        expect(mockFn(client, "post")).not.toHaveBeenCalled();
        expect(result.content).toBeDefined();
        const text = result.content[0].text;
        expect(text).toContain('"dryRun": true');
        expect(text).toContain("POST");
        expect(text).toContain("/sites/site123/firewall/zones");
      });
    });

    describe("unifi_update_firewall_zone", () => {
      it("should register the tool", () => {
        expect(handlers.has("unifi_update_firewall_zone")).toBe(true);
      });

      it("should have correct annotations", () => {
        const config = configs.get("unifi_update_firewall_zone");
        expect(config?.annotations.readOnlyHint).toBe(false);
        expect(config?.annotations.destructiveHint).toBe(false);
        expect(config?.annotations.idempotentHint).toBe(true);
      });

      it("should return success when client.put succeeds", async () => {
        const mockData = { id: "zone1", name: "LAN Updated" };
        mockFn(client, "put").mockResolvedValue(mockData);

        const handler = handlers.get("unifi_update_firewall_zone");
        const result = await handler({
          siteId: "site123",
          firewallZoneId: "zone1",
          name: "LAN Updated",
          networkIds: ["net1", "net2"],
        });

        expect(mockFn(client, "put")).toHaveBeenCalledWith(
          "/sites/site123/firewall/zones/zone1",
          { name: "LAN Updated", networkIds: ["net1", "net2"] }
        );
        expect(result.content).toBeDefined();
        expect(result.isError).toBeUndefined();
      });

      it("should return error when client.put fails", async () => {
        const testError = new Error("Zone not found");
        mockFn(client, "put").mockRejectedValue(testError);

        const handler = handlers.get("unifi_update_firewall_zone");
        const result = await handler({
          siteId: "site123",
          firewallZoneId: "zone1",
          name: "LAN Updated",
          networkIds: ["net1"],
        });

        expect(result.isError).toBe(true);
      });

      it("should return dry run preview when dryRun=true", async () => {
        const handler = handlers.get("unifi_update_firewall_zone");
        const result = await handler({
          siteId: "site123",
          firewallZoneId: "zone1",
          name: "LAN Updated",
          networkIds: ["net1"],
          dryRun: true,
        });

        expect(mockFn(client, "put")).not.toHaveBeenCalled();
        expect(result.content).toBeDefined();
        const text = result.content[0].text;
        expect(text).toContain('"dryRun": true');
        expect(text).toContain("PUT");
      });
    });

    describe("unifi_delete_firewall_zone", () => {
      it("should register the tool", () => {
        expect(handlers.has("unifi_delete_firewall_zone")).toBe(true);
      });

      it("should have correct annotations", () => {
        const config = configs.get("unifi_delete_firewall_zone");
        expect(config?.annotations.readOnlyHint).toBe(false);
        expect(config?.annotations.destructiveHint).toBe(true);
        expect(config?.description).toContain("DESTRUCTIVE:");
      });

      it("should return success when client.delete succeeds", async () => {
        const mockData = { success: true };
        mockFn(client, "delete").mockResolvedValue(mockData);

        const handler = handlers.get("unifi_delete_firewall_zone");
        const result = await handler({
          siteId: "site123",
          firewallZoneId: "zone1",
          confirm: true,
        });

        expect(mockFn(client, "delete")).toHaveBeenCalledWith(
          "/sites/site123/firewall/zones/zone1"
        );
        expect(result.content).toBeDefined();
        expect(result.isError).toBeUndefined();
      });

      it("should return error when client.delete fails", async () => {
        const testError = new Error("Zone not found");
        mockFn(client, "delete").mockRejectedValue(testError);

        const handler = handlers.get("unifi_delete_firewall_zone");
        const result = await handler({
          siteId: "site123",
          firewallZoneId: "zone1",
          confirm: true,
        });

        expect(result.isError).toBe(true);
      });

      it("should return dry run preview when dryRun=true", async () => {
        const handler = handlers.get("unifi_delete_firewall_zone");
        const result = await handler({
          siteId: "site123",
          firewallZoneId: "zone1",
          dryRun: true,
          confirm: true,
        });

        expect(mockFn(client, "delete")).not.toHaveBeenCalled();
        expect(result.content).toBeDefined();
        const text = result.content[0].text;
        expect(text).toContain('"dryRun": true');
        expect(text).toContain("DELETE");
      });

      it("should return error when confirm is not provided", async () => {
        const handler = handlers.get("unifi_delete_firewall_zone");
        const result = await handler({
          siteId: "site123",
          firewallZoneId: "zone1",
        });

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain("requires explicit confirmation");
      });

      it("should return error when confirm is false", async () => {
        const handler = handlers.get("unifi_delete_firewall_zone");
        const result = await handler({
          siteId: "site123",
          firewallZoneId: "zone1",
          confirm: false,
        });

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain("requires explicit confirmation");
      });
    });

    describe("unifi_create_firewall_policy", () => {
      it("should register the tool", () => {
        expect(handlers.has("unifi_create_firewall_policy")).toBe(true);
      });

      it("should have correct annotations", () => {
        const config = configs.get("unifi_create_firewall_policy");
        expect(config?.annotations.idempotentHint).toBe(false);
      });

      it("should return success when client.post succeeds", async () => {
        const mockData = { id: "policy1", name: "Allow SSH" };
        mockFn(client, "post").mockResolvedValue(mockData);

        const handler = handlers.get("unifi_create_firewall_policy");
        const policyConfig = { name: "Allow SSH", action: "ALLOW" };
        const result = await handler({
          siteId: "site123",
          policy: policyConfig,
        });

        expect(mockFn(client, "post")).toHaveBeenCalledWith(
          "/sites/site123/firewall/policies",
          policyConfig
        );
        expect(result.content).toBeDefined();
      });

      it("should return dry run preview when dryRun=true", async () => {
        const handler = handlers.get("unifi_create_firewall_policy");
        const policyConfig = { name: "Allow SSH", action: "ALLOW" };
        const result = await handler({
          siteId: "site123",
          policy: policyConfig,
          dryRun: true,
        });

        expect(mockFn(client, "post")).not.toHaveBeenCalled();
        expect(result.content[0].text).toContain('"dryRun": true');
      });
    });

    describe("unifi_update_firewall_policy", () => {
      it("should register the tool", () => {
        expect(handlers.has("unifi_update_firewall_policy")).toBe(true);
      });

      it("should have correct annotations", () => {
        const config = configs.get("unifi_update_firewall_policy");
        expect(config?.annotations.idempotentHint).toBe(true);
      });

      it("should return success when client.put succeeds", async () => {
        const mockData = { id: "policy1", name: "Allow SSH Updated" };
        mockFn(client, "put").mockResolvedValue(mockData);

        const handler = handlers.get("unifi_update_firewall_policy");
        const policyConfig = { name: "Allow SSH Updated", action: "ALLOW" };
        const result = await handler({
          siteId: "site123",
          firewallPolicyId: "policy1",
          policy: policyConfig,
        });

        expect(mockFn(client, "put")).toHaveBeenCalledWith(
          "/sites/site123/firewall/policies/policy1",
          policyConfig
        );
        expect(result.content).toBeDefined();
      });

      it("should return dry run preview when dryRun=true", async () => {
        const handler = handlers.get("unifi_update_firewall_policy");
        const policyConfig = { name: "Allow SSH Updated", action: "ALLOW" };
        const result = await handler({
          siteId: "site123",
          firewallPolicyId: "policy1",
          policy: policyConfig,
          dryRun: true,
        });

        expect(mockFn(client, "put")).not.toHaveBeenCalled();
        expect(result.content[0].text).toContain('"dryRun": true');
      });
    });

    describe("unifi_delete_firewall_policy", () => {
      it("should register the tool", () => {
        expect(handlers.has("unifi_delete_firewall_policy")).toBe(true);
      });

      it("should have correct annotations", () => {
        const config = configs.get("unifi_delete_firewall_policy");
        expect(config?.annotations.destructiveHint).toBe(true);
        expect(config?.description).toContain("DESTRUCTIVE:");
      });

      it("should return success when client.delete succeeds", async () => {
        const mockData = { success: true };
        mockFn(client, "delete").mockResolvedValue(mockData);

        const handler = handlers.get("unifi_delete_firewall_policy");
        const result = await handler({
          siteId: "site123",
          firewallPolicyId: "policy1",
          confirm: true,
        });

        expect(mockFn(client, "delete")).toHaveBeenCalledWith(
          "/sites/site123/firewall/policies/policy1"
        );
        expect(result.content).toBeDefined();
      });

      it("should return dry run preview when dryRun=true", async () => {
        const handler = handlers.get("unifi_delete_firewall_policy");
        const result = await handler({
          siteId: "site123",
          firewallPolicyId: "policy1",
          dryRun: true,
          confirm: true,
        });

        expect(mockFn(client, "delete")).not.toHaveBeenCalled();
        expect(result.content[0].text).toContain('"dryRun": true');
      });

      it("should return error when confirm is not provided", async () => {
        const handler = handlers.get("unifi_delete_firewall_policy");
        const result = await handler({
          siteId: "site123",
          firewallPolicyId: "policy1",
        });

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain("requires explicit confirmation");
      });

      it("should return error when confirm is false", async () => {
        const handler = handlers.get("unifi_delete_firewall_policy");
        const result = await handler({
          siteId: "site123",
          firewallPolicyId: "policy1",
          confirm: false,
        });

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain("requires explicit confirmation");
      });
    });

    describe("unifi_reorder_firewall_policies", () => {
      it("should register the tool", () => {
        expect(handlers.has("unifi_reorder_firewall_policies")).toBe(true);
      });

      it("should have correct annotations", () => {
        const config = configs.get("unifi_reorder_firewall_policies");
        expect(config?.annotations.readOnlyHint).toBe(false);
        expect(config?.annotations.idempotentHint).toBe(true);
      });

      it("should return success when client.put succeeds", async () => {
        const mockData = { success: true };
        mockFn(client, "put").mockResolvedValue(mockData);

        const handler = handlers.get("unifi_reorder_firewall_policies");
        const ordering = {
          beforeSystemDefined: ["policy1"],
          afterSystemDefined: ["policy2"],
        };
        const result = await handler({
          siteId: "site123",
          sourceFirewallZoneId: "zone1",
          destinationFirewallZoneId: "zone2",
          orderedFirewallPolicyIds: ordering,
        });

        expect(mockFn(client, "put")).toHaveBeenCalledWith(
          "/sites/site123/firewall/policies/ordering?sourceFirewallZoneId=zone1&destinationFirewallZoneId=zone2",
          { orderedFirewallPolicyIds: ordering }
        );
        expect(result.content).toBeDefined();
      });

      it("should return dry run preview when dryRun=true", async () => {
        const handler = handlers.get("unifi_reorder_firewall_policies");
        const ordering = {
          beforeSystemDefined: ["policy1"],
          afterSystemDefined: ["policy2"],
        };
        const result = await handler({
          siteId: "site123",
          sourceFirewallZoneId: "zone1",
          destinationFirewallZoneId: "zone2",
          orderedFirewallPolicyIds: ordering,
          dryRun: true,
        });

        expect(mockFn(client, "put")).not.toHaveBeenCalled();
        expect(result.content[0].text).toContain('"dryRun": true');
      });
    });
  });

  describe("readOnly mode", () => {
    beforeEach(() => {
      registerFirewallTools(server, client, true);
    });

    it("should register read tools when readOnly=true", () => {
      expect(handlers.has("unifi_list_firewall_zones")).toBe(true);
      expect(handlers.has("unifi_get_firewall_zone")).toBe(true);
      expect(handlers.has("unifi_list_firewall_policies")).toBe(true);
      expect(handlers.has("unifi_get_firewall_policy")).toBe(true);
      expect(handlers.has("unifi_get_firewall_policy_ordering")).toBe(true);
    });

    it("should not register write tools when readOnly=true", () => {
      expect(handlers.has("unifi_create_firewall_zone")).toBe(false);
      expect(handlers.has("unifi_update_firewall_zone")).toBe(false);
      expect(handlers.has("unifi_delete_firewall_zone")).toBe(false);
      expect(handlers.has("unifi_create_firewall_policy")).toBe(false);
      expect(handlers.has("unifi_update_firewall_policy")).toBe(false);
      expect(handlers.has("unifi_delete_firewall_policy")).toBe(false);
      expect(handlers.has("unifi_reorder_firewall_policies")).toBe(false);
    });
  });
});
