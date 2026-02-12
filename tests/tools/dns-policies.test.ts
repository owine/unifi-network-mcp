import { describe, it, expect, beforeEach } from "vitest";
import { createMockServer, createMockClient, mockFn } from "./_helpers.js";
import { registerDnsPolicyTools } from "../../src/tools/dns-policies.js";

describe("registerDnsPolicyTools", () => {
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
      registerDnsPolicyTools(server, client, false);
    });

    describe("unifi_list_dns_policies", () => {
      it("should register the tool", () => {
        expect(handlers.has("unifi_list_dns_policies")).toBe(true);
      });

      it("should have correct annotations", () => {
        const config = configs.get("unifi_list_dns_policies");
        expect(config?.annotations.readOnlyHint).toBe(true);
        expect(config?.annotations.destructiveHint).toBe(false);
      });

      it("should return success when client.get succeeds", async () => {
        const mockData = {
          data: [{ id: "policy1", name: "Block Ads" }],
        };
        mockFn(client, "get").mockResolvedValue(mockData);

        const handler = handlers.get("unifi_list_dns_policies");
        const result = await handler({
          siteId: "site123",
          offset: 0,
          limit: 25,
          filter: "name.like(block*)",
        });

        expect(mockFn(client, "get")).toHaveBeenCalledWith(
          "/sites/site123/dns-policies?offset=0&limit=25&filter=name.like%28block*%29"
        );
        expect(result.content).toBeDefined();
        expect(result.content[0].text).toContain("Block Ads");
        expect(result.isError).toBeUndefined();
      });

      it("should return error when client.get fails", async () => {
        const testError = new Error("API connection failed");
        mockFn(client, "get").mockRejectedValue(testError);

        const handler = handlers.get("unifi_list_dns_policies");
        const result = await handler({ siteId: "site123" });

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain("API connection failed");
      });
    });

    describe("unifi_get_dns_policy", () => {
      it("should register the tool", () => {
        expect(handlers.has("unifi_get_dns_policy")).toBe(true);
      });

      it("should have correct annotations", () => {
        const config = configs.get("unifi_get_dns_policy");
        expect(config?.annotations.readOnlyHint).toBe(true);
        expect(config?.annotations.destructiveHint).toBe(false);
      });

      it("should return success when client.get succeeds", async () => {
        const mockData = { id: "policy1", name: "Block Ads" };
        mockFn(client, "get").mockResolvedValue(mockData);

        const handler = handlers.get("unifi_get_dns_policy");
        const result = await handler({
          siteId: "site123",
          dnsPolicyId: "policy1",
        });

        expect(mockFn(client, "get")).toHaveBeenCalledWith(
          "/sites/site123/dns-policies/policy1"
        );
        expect(result.content).toBeDefined();
        expect(result.content[0].text).toContain("Block Ads");
        expect(result.isError).toBeUndefined();
      });

      it("should return error when client.get fails", async () => {
        const testError = new Error("Policy not found");
        mockFn(client, "get").mockRejectedValue(testError);

        const handler = handlers.get("unifi_get_dns_policy");
        const result = await handler({
          siteId: "site123",
          dnsPolicyId: "policy1",
        });

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain("Policy not found");
      });
    });
  });

  describe("write tools", () => {
    beforeEach(() => {
      registerDnsPolicyTools(server, client, false);
    });

    describe("unifi_create_dns_policy", () => {
      it("should register the tool", () => {
        expect(handlers.has("unifi_create_dns_policy")).toBe(true);
      });

      it("should have correct annotations", () => {
        const config = configs.get("unifi_create_dns_policy");
        expect(config?.annotations.readOnlyHint).toBe(false);
        expect(config?.annotations.destructiveHint).toBe(false);
        expect(config?.annotations.idempotentHint).toBe(false);
      });

      it("should return success when client.post succeeds", async () => {
        const mockData = { id: "policy2", name: "Block Malware" };
        mockFn(client, "post").mockResolvedValue(mockData);

        const handler = handlers.get("unifi_create_dns_policy");
        const policyConfig = {
          name: "Block Malware",
          action: "BLOCK",
          domains: ["malware.com"],
        };
        const result = await handler({
          siteId: "site123",
          policy: policyConfig,
        });

        expect(mockFn(client, "post")).toHaveBeenCalledWith(
          "/sites/site123/dns-policies",
          policyConfig
        );
        expect(result.content).toBeDefined();
        expect(result.isError).toBeUndefined();
      });

      it("should return error when client.post fails", async () => {
        const testError = new Error("Failed to create policy");
        mockFn(client, "post").mockRejectedValue(testError);

        const handler = handlers.get("unifi_create_dns_policy");
        const result = await handler({
          siteId: "site123",
          policy: { name: "Test Policy" },
        });

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain("Failed to create policy");
      });

      it("should return dry run preview when dryRun=true", async () => {
        const handler = handlers.get("unifi_create_dns_policy");
        const policyConfig = {
          name: "Block Malware",
          action: "BLOCK",
          domains: ["malware.com"],
        };
        const result = await handler({
          siteId: "site123",
          policy: policyConfig,
          dryRun: true,
        });

        expect(mockFn(client, "post")).not.toHaveBeenCalled();
        expect(result.content).toBeDefined();
        const text = result.content[0].text;
        expect(text).toContain('"dryRun": true');
        expect(text).toContain("POST");
        expect(text).toContain("/sites/site123/dns-policies");
      });
    });

    describe("unifi_update_dns_policy", () => {
      it("should register the tool", () => {
        expect(handlers.has("unifi_update_dns_policy")).toBe(true);
      });

      it("should have correct annotations", () => {
        const config = configs.get("unifi_update_dns_policy");
        expect(config?.annotations.readOnlyHint).toBe(false);
        expect(config?.annotations.destructiveHint).toBe(false);
        expect(config?.annotations.idempotentHint).toBe(true);
      });

      it("should return success when client.put succeeds", async () => {
        const mockData = { id: "policy1", name: "Block Ads Updated" };
        mockFn(client, "put").mockResolvedValue(mockData);

        const handler = handlers.get("unifi_update_dns_policy");
        const policyConfig = {
          name: "Block Ads Updated",
          action: "BLOCK",
          domains: ["ads.com", "ads2.com"],
        };
        const result = await handler({
          siteId: "site123",
          dnsPolicyId: "policy1",
          policy: policyConfig,
        });

        expect(mockFn(client, "put")).toHaveBeenCalledWith(
          "/sites/site123/dns-policies/policy1",
          policyConfig
        );
        expect(result.content).toBeDefined();
        expect(result.isError).toBeUndefined();
      });

      it("should return error when client.put fails", async () => {
        const testError = new Error("Policy not found");
        mockFn(client, "put").mockRejectedValue(testError);

        const handler = handlers.get("unifi_update_dns_policy");
        const result = await handler({
          siteId: "site123",
          dnsPolicyId: "policy1",
          policy: { name: "Updated" },
        });

        expect(result.isError).toBe(true);
      });

      it("should return dry run preview when dryRun=true", async () => {
        const handler = handlers.get("unifi_update_dns_policy");
        const policyConfig = {
          name: "Block Ads Updated",
          action: "BLOCK",
          domains: ["ads.com"],
        };
        const result = await handler({
          siteId: "site123",
          dnsPolicyId: "policy1",
          policy: policyConfig,
          dryRun: true,
        });

        expect(mockFn(client, "put")).not.toHaveBeenCalled();
        expect(result.content).toBeDefined();
        const text = result.content[0].text;
        expect(text).toContain('"dryRun": true');
        expect(text).toContain("PUT");
        expect(text).toContain("/sites/site123/dns-policies/policy1");
      });
    });

    describe("unifi_delete_dns_policy", () => {
      it("should register the tool", () => {
        expect(handlers.has("unifi_delete_dns_policy")).toBe(true);
      });

      it("should have correct annotations", () => {
        const config = configs.get("unifi_delete_dns_policy");
        expect(config?.annotations.readOnlyHint).toBe(false);
        expect(config?.annotations.destructiveHint).toBe(true);
        expect(config?.description).toContain("DESTRUCTIVE:");
      });

      it("should return success when client.delete succeeds", async () => {
        const mockData = { success: true };
        mockFn(client, "delete").mockResolvedValue(mockData);

        const handler = handlers.get("unifi_delete_dns_policy");
        const result = await handler({
          siteId: "site123",
          dnsPolicyId: "policy1",
          confirm: true,
        });

        expect(mockFn(client, "delete")).toHaveBeenCalledWith(
          "/sites/site123/dns-policies/policy1"
        );
        expect(result.content).toBeDefined();
        expect(result.isError).toBeUndefined();
      });

      it("should return error when client.delete fails", async () => {
        const testError = new Error("Policy not found");
        mockFn(client, "delete").mockRejectedValue(testError);

        const handler = handlers.get("unifi_delete_dns_policy");
        const result = await handler({
          siteId: "site123",
          dnsPolicyId: "policy1",
          confirm: true,
        });

        expect(result.isError).toBe(true);
      });

      it("should return dry run preview when dryRun=true", async () => {
        const handler = handlers.get("unifi_delete_dns_policy");
        const result = await handler({
          siteId: "site123",
          dnsPolicyId: "policy1",
          confirm: true,
          dryRun: true,
        });

        expect(mockFn(client, "delete")).not.toHaveBeenCalled();
        expect(result.content).toBeDefined();
        const text = result.content[0].text;
        expect(text).toContain('"dryRun": true');
        expect(text).toContain("DELETE");
        expect(text).toContain("/sites/site123/dns-policies/policy1");
      });

      it("should return error when confirm is not provided", async () => {
        const handler = handlers.get("unifi_delete_dns_policy");
        const result = await handler({
          siteId: "site123",
          dnsPolicyId: "policy1",
        });

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain("requires explicit confirmation");
      });

      it("should return error when confirm is false", async () => {
        const handler = handlers.get("unifi_delete_dns_policy");
        const result = await handler({
          siteId: "site123",
          dnsPolicyId: "policy1",
          confirm: false,
        });

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain("requires explicit confirmation");
      });
    });
  });

  describe("readOnly mode", () => {
    beforeEach(() => {
      registerDnsPolicyTools(server, client, true);
    });

    it("should register read tools when readOnly=true", () => {
      expect(handlers.has("unifi_list_dns_policies")).toBe(true);
      expect(handlers.has("unifi_get_dns_policy")).toBe(true);
    });

    it("should not register write tools when readOnly=true", () => {
      expect(handlers.has("unifi_create_dns_policy")).toBe(false);
      expect(handlers.has("unifi_update_dns_policy")).toBe(false);
      expect(handlers.has("unifi_delete_dns_policy")).toBe(false);
    });
  });
});
