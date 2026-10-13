import { describe, it, expect, beforeEach } from "vitest";
import { createMockServer, createMockClient, mockFn, parseInputSchema } from "./_helpers.js";
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

      it("should reject schema when sourceFirewallZoneId is missing", () => {
        const schema = parseInputSchema(configs, "unifi_get_firewall_policy_ordering");
        const result = schema.safeParse({
          siteId: "site1",
          destinationFirewallZoneId: "zone2",
        });
        expect(result.success).toBe(false);
      });

      it("should reject schema when destinationFirewallZoneId is missing", () => {
        const schema = parseInputSchema(configs, "unifi_get_firewall_policy_ordering");
        const result = schema.safeParse({
          siteId: "site1",
          sourceFirewallZoneId: "zone1",
        });
        expect(result.success).toBe(false);
      });

      it("should accept schema when both zone IDs are present", () => {
        const schema = parseInputSchema(configs, "unifi_get_firewall_policy_ordering");
        const result = schema.safeParse({
          siteId: "site1",
          sourceFirewallZoneId: "zone1",
          destinationFirewallZoneId: "zone2",
        });
        expect(result.success).toBe(true);
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
      // Shape captured live from an 11.0.83 user-defined policy (values replaced).
      const currentPolicy = {
        id: "policy1",
        enabled: true,
        name: "Allow SSH",
        description: "",
        index: 10000,
        action: { type: "ALLOW", allowReturnTraffic: false },
        source: { zoneId: "zone-internal" },
        destination: { zoneId: "zone-external" },
        ipProtocolScope: { ipVersion: "IPV4_AND_IPV6", protocolFilter: { type: "PRESET", preset: { name: "TCP_UDP" } } },
        loggingEnabled: false,
        reportFlowEnabled: false,
        metadata: { origin: "USER_DEFINED" },
      };
      // The documented PUT body: the GET response minus its read-only fields.
    const currentBody = Object.fromEntries(
      Object.entries(currentPolicy).filter(([field]) => !["id", "index", "metadata"].includes(field))
    );
      const path = "/sites/site123/firewall/policies/policy1";

      beforeEach(() => {
        mockFn(client, "get").mockResolvedValue(currentPolicy);
      });

      it("should register the tool", () => {
        expect(handlers.has("unifi_update_firewall_policy")).toBe(true);
      });

      it("should have correct annotations", () => {
        const config = configs.get("unifi_update_firewall_policy");
        expect(config?.annotations.idempotentHint).toBe(true);
      });

      it("keeps both changes when two updates to one policy run in parallel", async () => {
        // A controller that takes a moment to answer, so unserialised calls
        // interleave as GET, GET, PUT, PUT and the second PUT reverts the first.
        let stored: Record<string, unknown> = { ...currentPolicy };
        const later = () => new Promise((resolve) => setTimeout(resolve, 5));
        mockFn(client, "get").mockImplementation(async () => { await later(); return { ...stored }; });
        mockFn(client, "put").mockImplementation(async (_path: string, body: Record<string, unknown>) => {
          await later();
          stored = { ...stored, ...body };
          return stored;
        });

        const handler = handlers.get("unifi_update_firewall_policy");
        await Promise.all([
          handler({ siteId: "site123", firewallPolicyId: "policy1", policy: { name: "Renamed" } }),
          handler({ siteId: "site123", firewallPolicyId: "policy1", policy: { loggingEnabled: true } }),
        ]);

        expect(stored).toMatchObject({ name: "Renamed", loggingEnabled: true });
      });

      it("should read the current policy and PUT the merged full body", async () => {
        mockFn(client, "put").mockResolvedValue({ ...currentPolicy, name: "Allow SSH Updated" });

        const result = await handlers.get("unifi_update_firewall_policy")({
          siteId: "site123",
          firewallPolicyId: "policy1",
          policy: { name: "Allow SSH Updated" },
        });

        expect(mockFn(client, "get")).toHaveBeenCalledWith(path);
        expect(mockFn(client, "put")).toHaveBeenCalledWith(path, { ...currentBody, name: "Allow SSH Updated" });
        expect(result.isError).toBeUndefined();
      });

      it("should keep reportFlowEnabled=false instead of letting the PUT default it to true", async () => {
        mockFn(client, "put").mockResolvedValue(currentPolicy);

        await handlers.get("unifi_update_firewall_policy")({
          siteId: "site123",
          firewallPolicyId: "policy1",
          policy: { enabled: false },
        });

        expect(mockFn(client, "put").mock.calls[0][1].reportFlowEnabled).toBe(false);
      });

      it("should ignore read-only fields when the caller echoes back a full GET response", async () => {
        mockFn(client, "put").mockResolvedValue(currentPolicy);

        await handlers.get("unifi_update_firewall_policy")({
          siteId: "site123",
          firewallPolicyId: "policy1",
          policy: { ...currentPolicy, loggingEnabled: true },
        });

        const body = mockFn(client, "put").mock.calls[0][1];
        expect(body).toEqual({ ...currentBody, loggingEnabled: true });
      });

      it("should reject fields the PUT body does not accept", async () => {
        const result = await handlers.get("unifi_update_firewall_policy")({
          siteId: "site123",
          firewallPolicyId: "policy1",
          policy: { protocol: "TCP" },
        });

        expect(mockFn(client, "get")).not.toHaveBeenCalled();
        expect(mockFn(client, "put")).not.toHaveBeenCalled();
        expect(result.content[0].text).toContain("Fields not accepted by the firewall policy PUT body: protocol");
      });

      it("should send an explicit null to clear an optional field", async () => {
        mockFn(client, "put").mockResolvedValue(currentPolicy);

        await handlers.get("unifi_update_firewall_policy")({
          siteId: "site123",
          firewallPolicyId: "policy1",
          policy: { schedule: null },
        });

        expect(mockFn(client, "put").mock.calls[0][1].schedule).toBeNull();
      });

      it("should return the merged body as a dry run preview without writing", async () => {
        const result = await handlers.get("unifi_update_firewall_policy")({
          siteId: "site123",
          firewallPolicyId: "policy1",
          policy: { name: "Allow SSH Updated" },
          dryRun: true,
        });

        expect(mockFn(client, "put")).not.toHaveBeenCalled();
        const preview = JSON.parse(result.content[0].text);
        expect(preview.dryRun).toBe(true);
        expect(preview.wouldExecute.body).toEqual({ ...currentBody, name: "Allow SSH Updated" });
      });

      it("should return error when client.put fails", async () => {
        mockFn(client, "put").mockRejectedValue(new Error("HTTP 400: bad request"));

        const result = await handlers.get("unifi_update_firewall_policy")({
          siteId: "site123",
          firewallPolicyId: "policy1",
          policy: { name: "x" },
        });

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain("HTTP 400");
      });
    });

    describe("unifi_patch_firewall_policy", () => {
      it("should register the tool", () => {
        expect(handlers.has("unifi_patch_firewall_policy")).toBe(true);
      });

      it("should have correct annotations", () => {
        const config = configs.get("unifi_patch_firewall_policy");
        expect(config?.annotations.idempotentHint).toBe(true);
      });

      it("should return success when client.patch succeeds", async () => {
        const mockData = { id: "policy1", loggingEnabled: true };
        mockFn(client, "patch").mockResolvedValue(mockData);

        const handler = handlers.get("unifi_patch_firewall_policy");
        const policyPatch = { loggingEnabled: true, reportFlowEnabled: false };
        const result = await handler({
          siteId: "site123",
          firewallPolicyId: "policy1",
          policy: policyPatch,
        });

        expect(mockFn(client, "patch")).toHaveBeenCalledWith(
          "/sites/site123/firewall/policies/policy1",
          policyPatch
        );
        expect(result.content).toBeDefined();
      });

      it("should return dry run preview when dryRun=true", async () => {
        const handler = handlers.get("unifi_patch_firewall_policy");
        const policyPatch = { loggingEnabled: true };
        const result = await handler({
          siteId: "site123",
          firewallPolicyId: "policy1",
          policy: policyPatch,
          dryRun: true,
        });

        expect(mockFn(client, "patch")).not.toHaveBeenCalled();
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
      expect(handlers.has("unifi_patch_firewall_policy")).toBe(false);
      expect(handlers.has("unifi_delete_firewall_policy")).toBe(false);
      expect(handlers.has("unifi_reorder_firewall_policies")).toBe(false);
    });
  });
});
