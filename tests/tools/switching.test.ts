import { describe, it, expect, beforeEach } from "vitest";
import { createMockServer, createMockClient, mockFn } from "./_helpers.js";
import { registerSwitchingTools } from "../../src/tools/switching.js";

describe("registerSwitchingTools", () => {
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
    registerSwitchingTools(server, client);
  });

  describe("unifi_list_switch_stacks", () => {
    it("should register the tool", () => {
      expect(handlers.has("unifi_list_switch_stacks")).toBe(true);
    });

    it("should have correct annotations", () => {
      const config = configs.get("unifi_list_switch_stacks");
      expect(config?.annotations.readOnlyHint).toBe(true);
      expect(config?.annotations.destructiveHint).toBe(false);
    });

    it("should return success with required siteId", async () => {
      const mockData = [{ id: "stack-1", name: "Core Stack" }];
      mockFn(client, "get").mockResolvedValue(mockData);

      const handler = handlers.get("unifi_list_switch_stacks");
      const result = await handler({ siteId: "site-123" });

      expect(mockFn(client, "get")).toHaveBeenCalledWith(
        "/sites/site-123/switching/switch-stacks"
      );
      expect(result.content[0].text).toContain("stack-1");
      expect(result.isError).toBeUndefined();
    });

    it("should pass pagination and filter parameters", async () => {
      mockFn(client, "get").mockResolvedValue([]);

      const handler = handlers.get("unifi_list_switch_stacks");
      await handler({
        siteId: "site-123",
        offset: 10,
        limit: 50,
        filter: "name.like(Core*)",
      });

      expect(mockFn(client, "get")).toHaveBeenCalledWith(
        "/sites/site-123/switching/switch-stacks?offset=10&limit=50&filter=name.like%28Core*%29"
      );
    });

    it("should return error on client failure", async () => {
      mockFn(client, "get").mockRejectedValue(new Error("API error"));

      const handler = handlers.get("unifi_list_switch_stacks");
      const result = await handler({ siteId: "site-123" });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("API error");
    });
  });

  describe("unifi_get_switch_stack", () => {
    it("should register the tool", () => {
      expect(handlers.has("unifi_get_switch_stack")).toBe(true);
    });

    it("should have correct annotations", () => {
      const config = configs.get("unifi_get_switch_stack");
      expect(config?.annotations.readOnlyHint).toBe(true);
      expect(config?.annotations.destructiveHint).toBe(false);
    });

    it("should return success with siteId and switchStackId", async () => {
      const mockData = {
        id: "stack-1",
        name: "Core Stack",
        members: [{ deviceId: "dev-1" }],
        lags: [{ id: "lag-1" }],
      };
      mockFn(client, "get").mockResolvedValue(mockData);

      const handler = handlers.get("unifi_get_switch_stack");
      const result = await handler({
        siteId: "site-123",
        switchStackId: "stack-1",
      });

      expect(mockFn(client, "get")).toHaveBeenCalledWith(
        "/sites/site-123/switching/switch-stacks/stack-1"
      );
      expect(result.content[0].text).toContain("Core Stack");
      expect(result.isError).toBeUndefined();
    });

    it("should return error on client failure", async () => {
      mockFn(client, "get").mockRejectedValue(new Error("Not found"));

      const handler = handlers.get("unifi_get_switch_stack");
      const result = await handler({
        siteId: "site-123",
        switchStackId: "stack-1",
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Not found");
    });
  });

  describe("unifi_list_mc_lag_domains", () => {
    it("should register the tool", () => {
      expect(handlers.has("unifi_list_mc_lag_domains")).toBe(true);
    });

    it("should have correct annotations", () => {
      const config = configs.get("unifi_list_mc_lag_domains");
      expect(config?.annotations.readOnlyHint).toBe(true);
      expect(config?.annotations.destructiveHint).toBe(false);
    });

    it("should return success with required siteId", async () => {
      const mockData = [{ id: "mclag-1", name: "MC-LAG Domain 1" }];
      mockFn(client, "get").mockResolvedValue(mockData);

      const handler = handlers.get("unifi_list_mc_lag_domains");
      const result = await handler({ siteId: "site-123" });

      expect(mockFn(client, "get")).toHaveBeenCalledWith(
        "/sites/site-123/switching/mc-lag-domains"
      );
      expect(result.content[0].text).toContain("mclag-1");
      expect(result.isError).toBeUndefined();
    });

    it("should pass pagination and filter parameters", async () => {
      mockFn(client, "get").mockResolvedValue([]);

      const handler = handlers.get("unifi_list_mc_lag_domains");
      await handler({ siteId: "site-123", offset: 0, limit: 25 });

      expect(mockFn(client, "get")).toHaveBeenCalledWith(
        "/sites/site-123/switching/mc-lag-domains?offset=0&limit=25"
      );
    });

    it("should return error on client failure", async () => {
      mockFn(client, "get").mockRejectedValue(new Error("Connection refused"));

      const handler = handlers.get("unifi_list_mc_lag_domains");
      const result = await handler({ siteId: "site-123" });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Connection refused");
    });
  });

  describe("unifi_get_mc_lag_domain", () => {
    it("should register the tool", () => {
      expect(handlers.has("unifi_get_mc_lag_domain")).toBe(true);
    });

    it("should have correct annotations", () => {
      const config = configs.get("unifi_get_mc_lag_domain");
      expect(config?.annotations.readOnlyHint).toBe(true);
      expect(config?.annotations.destructiveHint).toBe(false);
    });

    it("should return success with siteId and mcLagDomainId", async () => {
      const mockData = {
        id: "mclag-1",
        name: "MC-LAG Domain 1",
        peers: [{ deviceId: "dev-1" }],
        lags: [{ id: "lag-1" }],
      };
      mockFn(client, "get").mockResolvedValue(mockData);

      const handler = handlers.get("unifi_get_mc_lag_domain");
      const result = await handler({
        siteId: "site-123",
        mcLagDomainId: "mclag-1",
      });

      expect(mockFn(client, "get")).toHaveBeenCalledWith(
        "/sites/site-123/switching/mc-lag-domains/mclag-1"
      );
      expect(result.content[0].text).toContain("MC-LAG Domain 1");
      expect(result.isError).toBeUndefined();
    });

    it("should return error on client failure", async () => {
      mockFn(client, "get").mockRejectedValue(new Error("Not found"));

      const handler = handlers.get("unifi_get_mc_lag_domain");
      const result = await handler({
        siteId: "site-123",
        mcLagDomainId: "mclag-1",
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Not found");
    });
  });

  describe("unifi_list_lags", () => {
    it("should register the tool", () => {
      expect(handlers.has("unifi_list_lags")).toBe(true);
    });

    it("should have correct annotations", () => {
      const config = configs.get("unifi_list_lags");
      expect(config?.annotations.readOnlyHint).toBe(true);
      expect(config?.annotations.destructiveHint).toBe(false);
    });

    it("should return success with required siteId", async () => {
      const mockData = [{ id: "lag-1", type: "SWITCH_STACK" }];
      mockFn(client, "get").mockResolvedValue(mockData);

      const handler = handlers.get("unifi_list_lags");
      const result = await handler({ siteId: "site-123" });

      expect(mockFn(client, "get")).toHaveBeenCalledWith(
        "/sites/site-123/switching/lags"
      );
      expect(result.content[0].text).toContain("lag-1");
      expect(result.isError).toBeUndefined();
    });

    it("should pass pagination and filter parameters", async () => {
      mockFn(client, "get").mockResolvedValue([]);

      const handler = handlers.get("unifi_list_lags");
      await handler({
        siteId: "site-123",
        offset: 5,
        limit: 100,
        filter: "type.eq(SWITCH_STACK)",
      });

      expect(mockFn(client, "get")).toHaveBeenCalledWith(
        "/sites/site-123/switching/lags?offset=5&limit=100&filter=type.eq%28SWITCH_STACK%29"
      );
    });

    it("should return error on client failure", async () => {
      mockFn(client, "get").mockRejectedValue(new Error("Timeout"));

      const handler = handlers.get("unifi_list_lags");
      const result = await handler({ siteId: "site-123" });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Timeout");
    });
  });

  describe("unifi_get_lag", () => {
    it("should register the tool", () => {
      expect(handlers.has("unifi_get_lag")).toBe(true);
    });

    it("should have correct annotations", () => {
      const config = configs.get("unifi_get_lag");
      expect(config?.annotations.readOnlyHint).toBe(true);
      expect(config?.annotations.destructiveHint).toBe(false);
    });

    it("should return success with siteId and lagId", async () => {
      const mockData = {
        type: "SWITCH_STACK",
        id: "lag-1",
        members: [{ portIdx: 1 }],
        switchStackId: "stack-1",
      };
      mockFn(client, "get").mockResolvedValue(mockData);

      const handler = handlers.get("unifi_get_lag");
      const result = await handler({
        siteId: "site-123",
        lagId: "lag-1",
      });

      expect(mockFn(client, "get")).toHaveBeenCalledWith(
        "/sites/site-123/switching/lags/lag-1"
      );
      expect(result.content[0].text).toContain("SWITCH_STACK");
      expect(result.isError).toBeUndefined();
    });

    it("should return error on client failure", async () => {
      mockFn(client, "get").mockRejectedValue(new Error("Not found"));

      const handler = handlers.get("unifi_get_lag");
      const result = await handler({
        siteId: "site-123",
        lagId: "lag-1",
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Not found");
    });
  });
});
