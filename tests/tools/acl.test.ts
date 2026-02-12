import { describe, it, expect, beforeEach } from "vitest";
import { createMockServer, createMockClient, mockFn } from "./_helpers.js";
import { registerAclTools } from "../../src/tools/acl.js";

describe("registerAclTools", () => {
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
      registerAclTools(server, client, false);
    });

    describe("unifi_list_acl_rules", () => {
      it("should register the tool", () => {
        expect(handlers.has("unifi_list_acl_rules")).toBe(true);
      });

      it("should have correct annotations", () => {
        const config = configs.get("unifi_list_acl_rules");
        expect(config?.annotations.readOnlyHint).toBe(true);
        expect(config?.annotations.destructiveHint).toBe(false);
      });

      it("should return success when client.get succeeds", async () => {
        const mockData = {
          data: [{ id: "rule1", name: "Allow SSH", enabled: true }],
        };
        mockFn(client, "get").mockResolvedValue(mockData);

        const handler = handlers.get("unifi_list_acl_rules");
        const result = await handler({
          siteId: "site123",
          offset: 0,
          limit: 25,
        });

        expect(mockFn(client, "get")).toHaveBeenCalledWith(
          "/sites/site123/acl-rules?offset=0&limit=25"
        );
        expect(result.content).toBeDefined();
        expect(result.content[0].text).toContain("Allow SSH");
        expect(result.isError).toBeUndefined();
      });

      it("should return error when client.get fails", async () => {
        const testError = new Error("API connection failed");
        mockFn(client, "get").mockRejectedValue(testError);

        const handler = handlers.get("unifi_list_acl_rules");
        const result = await handler({ siteId: "site123" });

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain("API connection failed");
      });
    });

    describe("unifi_get_acl_rule", () => {
      it("should register the tool", () => {
        expect(handlers.has("unifi_get_acl_rule")).toBe(true);
      });

      it("should have correct annotations", () => {
        const config = configs.get("unifi_get_acl_rule");
        expect(config?.annotations.readOnlyHint).toBe(true);
        expect(config?.annotations.destructiveHint).toBe(false);
      });

      it("should return success when client.get succeeds", async () => {
        const mockData = { id: "rule1", name: "Allow SSH", enabled: true };
        mockFn(client, "get").mockResolvedValue(mockData);

        const handler = handlers.get("unifi_get_acl_rule");
        const result = await handler({
          siteId: "site123",
          aclRuleId: "rule1",
        });

        expect(mockFn(client, "get")).toHaveBeenCalledWith(
          "/sites/site123/acl-rules/rule1"
        );
        expect(result.content).toBeDefined();
        expect(result.content[0].text).toContain("Allow SSH");
        expect(result.isError).toBeUndefined();
      });

      it("should return error when client.get fails", async () => {
        const testError = new Error("Rule not found");
        mockFn(client, "get").mockRejectedValue(testError);

        const handler = handlers.get("unifi_get_acl_rule");
        const result = await handler({
          siteId: "site123",
          aclRuleId: "rule1",
        });

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain("Rule not found");
      });
    });

    describe("unifi_get_acl_rule_ordering", () => {
      it("should register the tool", () => {
        expect(handlers.has("unifi_get_acl_rule_ordering")).toBe(true);
      });

      it("should have correct annotations", () => {
        const config = configs.get("unifi_get_acl_rule_ordering");
        expect(config?.annotations.readOnlyHint).toBe(true);
        expect(config?.annotations.destructiveHint).toBe(false);
      });

      it("should return success when client.get succeeds", async () => {
        const mockData = {
          beforeSystemDefined: ["rule1"],
          afterSystemDefined: ["rule2"],
        };
        mockFn(client, "get").mockResolvedValue(mockData);

        const handler = handlers.get("unifi_get_acl_rule_ordering");
        const result = await handler({ siteId: "site123" });

        expect(mockFn(client, "get")).toHaveBeenCalledWith(
          "/sites/site123/acl-rules/ordering"
        );
        expect(result.content).toBeDefined();
        expect(result.isError).toBeUndefined();
      });

      it("should return error when client.get fails", async () => {
        const testError = new Error("Failed to fetch ordering");
        mockFn(client, "get").mockRejectedValue(testError);

        const handler = handlers.get("unifi_get_acl_rule_ordering");
        const result = await handler({ siteId: "site123" });

        expect(result.isError).toBe(true);
      });
    });
  });

  describe("write tools", () => {
    beforeEach(() => {
      registerAclTools(server, client, false);
    });

    describe("unifi_create_acl_rule", () => {
      it("should register the tool", () => {
        expect(handlers.has("unifi_create_acl_rule")).toBe(true);
      });

      it("should have correct annotations", () => {
        const config = configs.get("unifi_create_acl_rule");
        expect(config?.annotations.readOnlyHint).toBe(false);
        expect(config?.annotations.destructiveHint).toBe(false);
        expect(config?.annotations.idempotentHint).toBe(false);
      });

      it("should return success when client.post succeeds", async () => {
        const mockData = { id: "rule2", name: "Allow HTTP", enabled: true };
        mockFn(client, "post").mockResolvedValue(mockData);

        const handler = handlers.get("unifi_create_acl_rule");
        const result = await handler({
          siteId: "site123",
          type: "IPV4",
          name: "Allow HTTP",
          enabled: true,
          action: "ALLOW",
          description: "Allow HTTP traffic",
          protocolFilter: ["TCP"],
        });

        expect(mockFn(client, "post")).toHaveBeenCalledWith(
          "/sites/site123/acl-rules",
          {
            type: "IPV4",
            name: "Allow HTTP",
            enabled: true,
            action: "ALLOW",
            description: "Allow HTTP traffic",
            protocolFilter: ["TCP"],
          }
        );
        expect(result.content).toBeDefined();
        expect(result.isError).toBeUndefined();
      });

      it("should handle optional fields correctly", async () => {
        const mockData = { id: "rule2", name: "Allow HTTP", enabled: true };
        mockFn(client, "post").mockResolvedValue(mockData);

        const handler = handlers.get("unifi_create_acl_rule");
        await handler({
          siteId: "site123",
          type: "IPV4",
          name: "Allow HTTP",
          enabled: true,
          action: "ALLOW",
        });

        const callArgs = mockFn(client, "post").mock.calls[0];
        expect(callArgs[1]).not.toHaveProperty("description");
        expect(callArgs[1]).not.toHaveProperty("protocolFilter");
      });

      it("should return error when client.post fails", async () => {
        const testError = new Error("Failed to create rule");
        mockFn(client, "post").mockRejectedValue(testError);

        const handler = handlers.get("unifi_create_acl_rule");
        const result = await handler({
          siteId: "site123",
          type: "IPV4",
          name: "Allow HTTP",
          enabled: true,
          action: "ALLOW",
        });

        expect(result.isError).toBe(true);
      });

      it("should return dry run preview when dryRun=true", async () => {
        const handler = handlers.get("unifi_create_acl_rule");
        const result = await handler({
          siteId: "site123",
          type: "IPV4",
          name: "Allow HTTP",
          enabled: true,
          action: "ALLOW",
          dryRun: true,
        });

        expect(mockFn(client, "post")).not.toHaveBeenCalled();
        expect(result.content).toBeDefined();
        const text = result.content[0].text;
        expect(text).toContain('"dryRun": true');
        expect(text).toContain("POST");
        expect(text).toContain("/sites/site123/acl-rules");
      });
    });

    describe("unifi_update_acl_rule", () => {
      it("should register the tool", () => {
        expect(handlers.has("unifi_update_acl_rule")).toBe(true);
      });

      it("should have correct annotations", () => {
        const config = configs.get("unifi_update_acl_rule");
        expect(config?.annotations.readOnlyHint).toBe(false);
        expect(config?.annotations.destructiveHint).toBe(false);
        expect(config?.annotations.idempotentHint).toBe(true);
      });

      it("should return success when client.put succeeds", async () => {
        const mockData = { id: "rule1", name: "Allow SSH Updated" };
        mockFn(client, "put").mockResolvedValue(mockData);

        const handler = handlers.get("unifi_update_acl_rule");
        const ruleConfig = { name: "Allow SSH Updated", enabled: true };
        const result = await handler({
          siteId: "site123",
          aclRuleId: "rule1",
          rule: ruleConfig,
        });

        expect(mockFn(client, "put")).toHaveBeenCalledWith(
          "/sites/site123/acl-rules/rule1",
          ruleConfig
        );
        expect(result.content).toBeDefined();
        expect(result.isError).toBeUndefined();
      });

      it("should return error when client.put fails", async () => {
        const testError = new Error("Rule not found");
        mockFn(client, "put").mockRejectedValue(testError);

        const handler = handlers.get("unifi_update_acl_rule");
        const result = await handler({
          siteId: "site123",
          aclRuleId: "rule1",
          rule: { name: "Updated" },
        });

        expect(result.isError).toBe(true);
      });

      it("should return dry run preview when dryRun=true", async () => {
        const handler = handlers.get("unifi_update_acl_rule");
        const ruleConfig = { name: "Allow SSH Updated", enabled: true };
        const result = await handler({
          siteId: "site123",
          aclRuleId: "rule1",
          rule: ruleConfig,
          dryRun: true,
        });

        expect(mockFn(client, "put")).not.toHaveBeenCalled();
        expect(result.content).toBeDefined();
        const text = result.content[0].text;
        expect(text).toContain('"dryRun": true');
        expect(text).toContain("PUT");
      });
    });

    describe("unifi_delete_acl_rule", () => {
      it("should register the tool", () => {
        expect(handlers.has("unifi_delete_acl_rule")).toBe(true);
      });

      it("should have correct annotations", () => {
        const config = configs.get("unifi_delete_acl_rule");
        expect(config?.annotations.readOnlyHint).toBe(false);
        expect(config?.annotations.destructiveHint).toBe(true);
        expect(config?.description).toContain("DESTRUCTIVE:");
      });

      it("should return success when client.delete succeeds", async () => {
        const mockData = { success: true };
        mockFn(client, "delete").mockResolvedValue(mockData);

        const handler = handlers.get("unifi_delete_acl_rule");
        const result = await handler({
          siteId: "site123",
          aclRuleId: "rule1",
          confirm: true,
        });

        expect(mockFn(client, "delete")).toHaveBeenCalledWith(
          "/sites/site123/acl-rules/rule1"
        );
        expect(result.content).toBeDefined();
        expect(result.isError).toBeUndefined();
      });

      it("should return error when client.delete fails", async () => {
        const testError = new Error("Rule not found");
        mockFn(client, "delete").mockRejectedValue(testError);

        const handler = handlers.get("unifi_delete_acl_rule");
        const result = await handler({
          siteId: "site123",
          aclRuleId: "rule1",
          confirm: true,
        });

        expect(result.isError).toBe(true);
      });

      it("should return dry run preview when dryRun=true", async () => {
        const handler = handlers.get("unifi_delete_acl_rule");
        const result = await handler({
          siteId: "site123",
          aclRuleId: "rule1",
          confirm: true,
          dryRun: true,
        });

        expect(mockFn(client, "delete")).not.toHaveBeenCalled();
        expect(result.content).toBeDefined();
        const text = result.content[0].text;
        expect(text).toContain('"dryRun": true');
        expect(text).toContain("DELETE");
      });

      it("should return error when confirm is not provided", async () => {
        const handler = handlers.get("unifi_delete_acl_rule");
        const result = await handler({
          siteId: "site123",
          aclRuleId: "rule1",
        });

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain("requires explicit confirmation");
      });

      it("should return error when confirm is false", async () => {
        const handler = handlers.get("unifi_delete_acl_rule");
        const result = await handler({
          siteId: "site123",
          aclRuleId: "rule1",
          confirm: false,
        });

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain("requires explicit confirmation");
      });
    });

    describe("unifi_reorder_acl_rules", () => {
      it("should register the tool", () => {
        expect(handlers.has("unifi_reorder_acl_rules")).toBe(true);
      });

      it("should have correct annotations", () => {
        const config = configs.get("unifi_reorder_acl_rules");
        expect(config?.annotations.readOnlyHint).toBe(false);
        expect(config?.annotations.destructiveHint).toBe(false);
        expect(config?.annotations.idempotentHint).toBe(true);
      });

      it("should return success when client.put succeeds", async () => {
        const mockData = { success: true };
        mockFn(client, "put").mockResolvedValue(mockData);

        const handler = handlers.get("unifi_reorder_acl_rules");
        const orderedIds = ["rule1", "rule2", "rule3"];
        const result = await handler({
          siteId: "site123",
          orderedAclRuleIds: orderedIds,
        });

        expect(mockFn(client, "put")).toHaveBeenCalledWith(
          "/sites/site123/acl-rules/ordering",
          { orderedAclRuleIds: orderedIds }
        );
        expect(result.content).toBeDefined();
        expect(result.isError).toBeUndefined();
      });

      it("should return error when client.put fails", async () => {
        const testError = new Error("Invalid rule IDs");
        mockFn(client, "put").mockRejectedValue(testError);

        const handler = handlers.get("unifi_reorder_acl_rules");
        const result = await handler({
          siteId: "site123",
          orderedAclRuleIds: ["rule1"],
        });

        expect(result.isError).toBe(true);
      });

      it("should return dry run preview when dryRun=true", async () => {
        const handler = handlers.get("unifi_reorder_acl_rules");
        const orderedIds = ["rule1", "rule2", "rule3"];
        const result = await handler({
          siteId: "site123",
          orderedAclRuleIds: orderedIds,
          dryRun: true,
        });

        expect(mockFn(client, "put")).not.toHaveBeenCalled();
        expect(result.content).toBeDefined();
        const text = result.content[0].text;
        expect(text).toContain('"dryRun": true');
        expect(text).toContain("PUT");
        expect(text).toContain("/sites/site123/acl-rules/ordering");
      });
    });
  });

  describe("readOnly mode", () => {
    beforeEach(() => {
      registerAclTools(server, client, true);
    });

    it("should register read tools when readOnly=true", () => {
      expect(handlers.has("unifi_list_acl_rules")).toBe(true);
      expect(handlers.has("unifi_get_acl_rule")).toBe(true);
      expect(handlers.has("unifi_get_acl_rule_ordering")).toBe(true);
    });

    it("should not register write tools when readOnly=true", () => {
      expect(handlers.has("unifi_create_acl_rule")).toBe(false);
      expect(handlers.has("unifi_update_acl_rule")).toBe(false);
      expect(handlers.has("unifi_delete_acl_rule")).toBe(false);
      expect(handlers.has("unifi_reorder_acl_rules")).toBe(false);
    });
  });
});
