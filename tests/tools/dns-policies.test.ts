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
          "/sites/site123/dns/policies?offset=0&limit=25&filter=name.like%28block*%29"
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
          "/sites/site123/dns/policies/policy1"
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
        const mockData = { id: "policy2", type: "A_RECORD" };
        mockFn(client, "post").mockResolvedValue(mockData);

        const handler = handlers.get("unifi_create_dns_policy");
        const result = await handler({
          siteId: "site123",
          type: "A_RECORD",
          enabled: true,
          domain: "example.com",
          ipv4Address: "192.168.1.1",
          ttlSeconds: 3600,
        });

        expect(mockFn(client, "post")).toHaveBeenCalledWith(
          "/sites/site123/dns/policies",
          {
            type: "A_RECORD",
            enabled: true,
            domain: "example.com",
            ipv4Address: "192.168.1.1",
            ttlSeconds: 3600,
          }
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
          type: "A_RECORD",
          enabled: true,
          domain: "example.com",
          ipv4Address: "192.168.1.1",
          ttlSeconds: 3600,
        });

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain("Failed to create policy");
      });

      it("should return dry run preview when dryRun=true", async () => {
        const handler = handlers.get("unifi_create_dns_policy");
        const result = await handler({
          siteId: "site123",
          type: "A_RECORD",
          enabled: true,
          domain: "example.com",
          ipv4Address: "192.168.1.1",
          ttlSeconds: 3600,
          dryRun: true,
        });

        expect(mockFn(client, "post")).not.toHaveBeenCalled();
        expect(result.content).toBeDefined();
        const text = result.content[0].text;
        expect(text).toContain('"dryRun": true');
        expect(text).toContain("POST");
        expect(text).toContain("/sites/site123/dns/policies");
      });

      it.each([
        ["AAAA_RECORD", { ipv6Address: "2001:db8::10", ttlSeconds: 300 }],
        ["CNAME_RECORD", { targetDomain: "target.example.com", ttlSeconds: 604800 }],
        ["MX_RECORD", { mailServerDomain: "mail.example.com", priority: 10 }],
        ["TXT_RECORD", { text: "v=spf1 -all" }],
        [
          "SRV_RECORD",
          { serverDomain: "ldap.example.com", service: "_ldap", protocol: "_tcp", port: 389, priority: 0, weight: 5 },
        ],
        ["FORWARD_DOMAIN", { ipAddress: "192.0.2.53" }],
      ])("should POST the %s-specific body", async (type, specific) => {
        mockFn(client, "post").mockResolvedValue({ id: "policy2", type });

        const result = await handlers.get("unifi_create_dns_policy")({
          siteId: "site123",
          type,
          enabled: true,
          domain: "example.com",
          ...specific,
        });

        expect(result.isError).toBeUndefined();
        expect(mockFn(client, "post")).toHaveBeenCalledWith("/sites/site123/dns/policies", {
          type,
          enabled: true,
          domain: "example.com",
          ...specific,
        });
      });

      it("should reject a record missing its type-specific fields", async () => {
        const result = await handlers.get("unifi_create_dns_policy")({
          siteId: "site123",
          type: "SRV_RECORD",
          enabled: true,
          domain: "example.com",
          serverDomain: "ldap.example.com",
        });

        expect(mockFn(client, "post")).not.toHaveBeenCalled();
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain(
          "Missing required fields for type SRV_RECORD: service, protocol, port, priority, weight"
        );
      });

      it("should reject fields that belong to another record type", async () => {
        const result = await handlers.get("unifi_create_dns_policy")({
          siteId: "site123",
          type: "MX_RECORD",
          enabled: true,
          domain: "example.com",
          mailServerDomain: "mail.example.com",
          priority: 10,
          ttlSeconds: 3600,
        });

        expect(mockFn(client, "post")).not.toHaveBeenCalled();
        expect(result.content[0].text).toContain("Fields not accepted for type MX_RECORD: ttlSeconds");
      });

      it("should cap A/AAAA TTLs at 86400 even though CNAME allows 604800", async () => {
        const result = await handlers.get("unifi_create_dns_policy")({
          siteId: "site123",
          type: "A_RECORD",
          enabled: true,
          domain: "example.com",
          ipv4Address: "192.0.2.1",
          ttlSeconds: 604800,
        });

        expect(mockFn(client, "post")).not.toHaveBeenCalled();
        expect(result.content[0].text).toContain("ttlSeconds for A_RECORD must be 0-86400");
      });
    });

    describe("unifi_update_dns_policy", () => {
      const currentPolicy = {
        type: "A_RECORD",
        id: "policy1",
        enabled: true,
        metadata: { origin: "USER_DEFINED" },
        domain: "nas.example.com",
        ipv4Address: "192.0.2.10",
        ttlSeconds: 3600,
      };
      const path = "/sites/site123/dns/policies/policy1";

      beforeEach(() => {
        mockFn(client, "get").mockResolvedValue(currentPolicy);
      });

      it("should register the tool", () => {
        expect(handlers.has("unifi_update_dns_policy")).toBe(true);
      });

      it("should have correct annotations", () => {
        const config = configs.get("unifi_update_dns_policy");
        expect(config?.annotations.readOnlyHint).toBe(false);
        expect(config?.annotations.destructiveHint).toBe(false);
        expect(config?.annotations.idempotentHint).toBe(true);
      });

      it("should read the current policy and PUT the merged full body", async () => {
        mockFn(client, "put").mockResolvedValue({ ...currentPolicy, ipv4Address: "192.0.2.20" });

        const result = await handlers.get("unifi_update_dns_policy")({
          siteId: "site123",
          dnsPolicyId: "policy1",
          ipv4Address: "192.0.2.20",
        });

        expect(mockFn(client, "get")).toHaveBeenCalledWith(path);
        expect(mockFn(client, "put")).toHaveBeenCalledWith(path, {
          type: "A_RECORD",
          enabled: true,
          domain: "nas.example.com",
          ipv4Address: "192.0.2.20",
          ttlSeconds: 3600,
        });
        expect(result.isError).toBeUndefined();
      });

      it("should drop the old type's fields when the type changes", async () => {
        mockFn(client, "put").mockResolvedValue({ id: "policy1" });

        await handlers.get("unifi_update_dns_policy")({
          siteId: "site123",
          dnsPolicyId: "policy1",
          type: "CNAME_RECORD",
          targetDomain: "storage.example.com",
        });

        expect(mockFn(client, "put")).toHaveBeenCalledWith(path, {
          type: "CNAME_RECORD",
          enabled: true,
          domain: "nas.example.com",
          targetDomain: "storage.example.com",
          ttlSeconds: 3600,
        });
      });

      it("should reject a type change missing the new type's fields", async () => {
        const result = await handlers.get("unifi_update_dns_policy")({
          siteId: "site123",
          dnsPolicyId: "policy1",
          type: "MX_RECORD",
        });

        expect(mockFn(client, "put")).not.toHaveBeenCalled();
        expect(result.content[0].text).toContain("Missing required fields for type MX_RECORD: mailServerDomain, priority");
      });

      it("should return error when client.put fails", async () => {
        mockFn(client, "put").mockRejectedValue(new Error("Policy not found"));

        const result = await handlers.get("unifi_update_dns_policy")({
          siteId: "site123",
          dnsPolicyId: "policy1",
          enabled: false,
        });

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain("Policy not found");
      });

      it("should return the merged body as a dry run preview without writing", async () => {
        const result = await handlers.get("unifi_update_dns_policy")({
          siteId: "site123",
          dnsPolicyId: "policy1",
          enabled: false,
          dryRun: true,
        });

        expect(mockFn(client, "put")).not.toHaveBeenCalled();
        const preview = JSON.parse(result.content[0].text);
        expect(preview.dryRun).toBe(true);
        expect(preview.wouldExecute).toEqual({
          method: "PUT",
          path,
          body: { type: "A_RECORD", enabled: false, domain: "nas.example.com", ipv4Address: "192.0.2.10", ttlSeconds: 3600 },
        });
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
          "/sites/site123/dns/policies/policy1"
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
        expect(text).toContain("/sites/site123/dns/policies/policy1");
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
