import { describe, it, expect, beforeEach } from "vitest";
import { createMockServer, createMockClient, mockFn } from "./_helpers.js";
import { registerHotspotTools } from "../../src/tools/hotspot.js";

describe("registerHotspotTools", () => {
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

  describe("read-only mode", () => {
    beforeEach(() => {
      registerHotspotTools(server, client, true);
    });

    it("should register read tools when readOnly=true", () => {
      expect(handlers.has("unifi_list_vouchers")).toBe(true);
      expect(handlers.has("unifi_get_voucher")).toBe(true);
    });

    it("should not register write tools when readOnly=true", () => {
      expect(handlers.has("unifi_create_voucher")).toBe(false);
      expect(handlers.has("unifi_delete_voucher")).toBe(false);
      expect(handlers.has("unifi_bulk_delete_vouchers")).toBe(false);
    });
  });

  describe("read-write mode", () => {
    beforeEach(() => {
      registerHotspotTools(server, client, false);
    });

    it("should register all tools when readOnly=false", () => {
      expect(handlers.has("unifi_list_vouchers")).toBe(true);
      expect(handlers.has("unifi_get_voucher")).toBe(true);
      expect(handlers.has("unifi_create_voucher")).toBe(true);
      expect(handlers.has("unifi_delete_voucher")).toBe(true);
      expect(handlers.has("unifi_bulk_delete_vouchers")).toBe(true);
    });
  });

  describe("unifi_list_vouchers", () => {
    beforeEach(() => {
      registerHotspotTools(server, client);
    });

    it("should register the tool", () => {
      expect(handlers.has("unifi_list_vouchers")).toBe(true);
    });

    it("should have correct annotations", () => {
      const config = configs.get("unifi_list_vouchers");
      expect(config?.annotations.readOnlyHint).toBe(true);
      expect(config?.annotations.destructiveHint).toBe(false);
    });

    it("should return success with default parameters", async () => {
      const mockData = [{ id: "v1", code: "ABC123" }];
      mockFn(client, "get").mockResolvedValue(mockData);

      const handler = handlers.get("unifi_list_vouchers");
      const result = await handler({ siteId: "site1" });

      expect(mockFn(client, "get")).toHaveBeenCalledWith(
        "/sites/site1/hotspot/vouchers"
      );
      expect(result.content).toBeDefined();
      expect(result.content[0].text).toContain("v1");
      expect(result.isError).toBeUndefined();
    });

    it("should use default offset and limit in query", async () => {
      const mockData: unknown[] = [];
      mockFn(client, "get").mockResolvedValue(mockData);

      const handler = handlers.get("unifi_list_vouchers");
      // Zod defaults (offset=0, limit=100) are applied by MCP SDK before handler;
      // in tests we call the handler directly so we pass them explicitly.
      await handler({ siteId: "site1", offset: 0, limit: 100 });

      expect(mockFn(client, "get")).toHaveBeenCalledWith(
        "/sites/site1/hotspot/vouchers?offset=0&limit=100"
      );
    });

    it("should pass custom offset and limit to query", async () => {
      const mockData: unknown[] = [];
      mockFn(client, "get").mockResolvedValue(mockData);

      const handler = handlers.get("unifi_list_vouchers");
      await handler({ siteId: "site1", offset: 20, limit: 50 });

      expect(mockFn(client, "get")).toHaveBeenCalledWith(
        "/sites/site1/hotspot/vouchers?offset=20&limit=50"
      );
    });

    it("should pass filter to query", async () => {
      const mockData: unknown[] = [];
      mockFn(client, "get").mockResolvedValue(mockData);

      const handler = handlers.get("unifi_list_vouchers");
      await handler({ siteId: "site1", filter: "expired.eq(true)" });

      expect(mockFn(client, "get")).toHaveBeenCalledWith(
        "/sites/site1/hotspot/vouchers?filter=expired.eq%28true%29"
      );
    });

    it("should return error when client fails", async () => {
      const testError = new Error("API error");
      mockFn(client, "get").mockRejectedValue(testError);

      const handler = handlers.get("unifi_list_vouchers");
      const result = await handler({ siteId: "site1" });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("API error");
    });
  });

  describe("unifi_get_voucher", () => {
    beforeEach(() => {
      registerHotspotTools(server, client);
    });

    it("should register the tool", () => {
      expect(handlers.has("unifi_get_voucher")).toBe(true);
    });

    it("should have correct annotations", () => {
      const config = configs.get("unifi_get_voucher");
      expect(config?.annotations.readOnlyHint).toBe(true);
      expect(config?.annotations.destructiveHint).toBe(false);
    });

    it("should return success with site and voucher ids", async () => {
      const mockData = { id: "v1", code: "ABC123", expired: false };
      mockFn(client, "get").mockResolvedValue(mockData);

      const handler = handlers.get("unifi_get_voucher");
      const result = await handler({ siteId: "site1", voucherId: "v1" });

      expect(mockFn(client, "get")).toHaveBeenCalledWith(
        "/sites/site1/hotspot/vouchers/v1"
      );
      expect(result.content[0].text).toContain("ABC123");
      expect(result.isError).toBeUndefined();
    });

    it("should return error when client fails", async () => {
      const testError = new Error("Not found");
      mockFn(client, "get").mockRejectedValue(testError);

      const handler = handlers.get("unifi_get_voucher");
      const result = await handler({ siteId: "site1", voucherId: "v1" });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Not found");
    });
  });

  describe("unifi_create_voucher", () => {
    beforeEach(() => {
      registerHotspotTools(server, client);
    });

    it("should register the tool", () => {
      expect(handlers.has("unifi_create_voucher")).toBe(true);
    });

    it("should have correct annotations", () => {
      const config = configs.get("unifi_create_voucher");
      expect(config?.annotations.readOnlyHint).toBe(false);
      expect(config?.annotations.destructiveHint).toBe(false);
      expect(config?.annotations.idempotentHint).toBe(false);
    });

    it("should return success with minimal parameters", async () => {
      const mockData = { id: "v-new", code: "XYZ789" };
      mockFn(client, "post").mockResolvedValue(mockData);

      const handler = handlers.get("unifi_create_voucher");
      const result = await handler({
        siteId: "site1",
        name: "Guest vouchers",
        timeLimitMinutes: 60,
      });

      expect(mockFn(client, "post")).toHaveBeenCalledWith(
        "/sites/site1/hotspot/vouchers",
        { name: "Guest vouchers", timeLimitMinutes: 60 }
      );
      expect(result.content[0].text).toContain("v-new");
      expect(result.isError).toBeUndefined();
    });

    it("should include count when provided", async () => {
      mockFn(client, "post").mockResolvedValue({ id: "v-new" });

      const handler = handlers.get("unifi_create_voucher");
      await handler({
        siteId: "site1",
        name: "Guest vouchers",
        timeLimitMinutes: 60,
        count: 10,
      });

      expect(mockFn(client, "post")).toHaveBeenCalledWith(
        "/sites/site1/hotspot/vouchers",
        expect.objectContaining({ count: 10 })
      );
    });

    it("should include all optional parameters when provided", async () => {
      mockFn(client, "post").mockResolvedValue({ id: "v-new" });

      const handler = handlers.get("unifi_create_voucher");
      await handler({
        siteId: "site1",
        name: "Premium vouchers",
        timeLimitMinutes: 1440,
        count: 5,
        authorizedGuestLimit: 3,
        dataUsageLimitMBytes: 1024,
        rxRateLimitKbps: 10000,
        txRateLimitKbps: 5000,
      });

      expect(mockFn(client, "post")).toHaveBeenCalledWith(
        "/sites/site1/hotspot/vouchers",
        {
          name: "Premium vouchers",
          timeLimitMinutes: 1440,
          count: 5,
          authorizedGuestLimit: 3,
          dataUsageLimitMBytes: 1024,
          rxRateLimitKbps: 10000,
          txRateLimitKbps: 5000,
        }
      );
    });

    it("should return dryRun preview when dryRun=true", async () => {
      const handler = handlers.get("unifi_create_voucher");
      const result = await handler({
        siteId: "site1",
        name: "Guest vouchers",
        timeLimitMinutes: 60,
        dryRun: true,
      });

      expect(mockFn(client, "post")).not.toHaveBeenCalled();
      expect(result.content[0].text).toContain("dryRun");
      expect(result.content[0].text).toContain("POST");
      expect(result.content[0].text).toContain("/sites/site1/hotspot/vouchers");
    });

    it("should return error when client fails", async () => {
      const testError = new Error("Create failed");
      mockFn(client, "post").mockRejectedValue(testError);

      const handler = handlers.get("unifi_create_voucher");
      const result = await handler({
        siteId: "site1",
        name: "Guest vouchers",
        timeLimitMinutes: 60,
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Create failed");
    });
  });

  describe("unifi_delete_voucher", () => {
    beforeEach(() => {
      registerHotspotTools(server, client);
    });

    it("should register the tool", () => {
      expect(handlers.has("unifi_delete_voucher")).toBe(true);
    });

    it("should have correct annotations", () => {
      const config = configs.get("unifi_delete_voucher");
      expect(config?.annotations.readOnlyHint).toBe(false);
      expect(config?.annotations.destructiveHint).toBe(true);
    });

    it("should return success when client.delete succeeds", async () => {
      const mockData = { deleted: true };
      mockFn(client, "delete").mockResolvedValue(mockData);

      const handler = handlers.get("unifi_delete_voucher");
      const result = await handler({
        siteId: "site1",
        voucherId: "v1",
        confirm: true,
      });

      expect(mockFn(client, "delete")).toHaveBeenCalledWith(
        "/sites/site1/hotspot/vouchers/v1"
      );
      expect(result.isError).toBeUndefined();
    });

    it("should return dryRun preview when dryRun=true", async () => {
      const handler = handlers.get("unifi_delete_voucher");
      const result = await handler({
        siteId: "site1",
        voucherId: "v1",
        dryRun: true,
        confirm: true,
      });

      expect(mockFn(client, "delete")).not.toHaveBeenCalled();
      expect(result.content[0].text).toContain("dryRun");
      expect(result.content[0].text).toContain("DELETE");
      expect(result.content[0].text).toContain(
        "/sites/site1/hotspot/vouchers/v1"
      );
    });

    it("should return error when client fails", async () => {
      const testError = new Error("Delete failed");
      mockFn(client, "delete").mockRejectedValue(testError);

      const handler = handlers.get("unifi_delete_voucher");
      const result = await handler({
        siteId: "site1",
        voucherId: "v1",
        confirm: true,
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Delete failed");
    });

    it("should return error when confirm is not provided", async () => {
      const handler = handlers.get("unifi_delete_voucher");
      const result = await handler({
        siteId: "site1",
        voucherId: "v1",
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("requires explicit confirmation");
    });

    it("should return error when confirm is false", async () => {
      const handler = handlers.get("unifi_delete_voucher");
      const result = await handler({
        siteId: "site1",
        voucherId: "v1",
        confirm: false,
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("requires explicit confirmation");
    });
  });

  describe("unifi_bulk_delete_vouchers", () => {
    beforeEach(() => {
      registerHotspotTools(server, client);
    });

    it("should register the tool", () => {
      expect(handlers.has("unifi_bulk_delete_vouchers")).toBe(true);
    });

    it("should have correct annotations", () => {
      const config = configs.get("unifi_bulk_delete_vouchers");
      expect(config?.annotations.readOnlyHint).toBe(false);
      expect(config?.annotations.destructiveHint).toBe(true);
    });

    it("should return error when confirm is not true", async () => {
      const handler = handlers.get("unifi_bulk_delete_vouchers");
      const result = await handler({
        siteId: "site1",
        filter: "expired.eq(true)",
      });

      expect(mockFn(client, "delete")).not.toHaveBeenCalled();
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("confirmation");
      expect(result.content[0].text).toContain("confirm: true");
    });

    it("should return error when confirm is false", async () => {
      const handler = handlers.get("unifi_bulk_delete_vouchers");
      const result = await handler({
        siteId: "site1",
        filter: "expired.eq(true)",
        confirm: false,
      });

      expect(mockFn(client, "delete")).not.toHaveBeenCalled();
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("confirmation");
    });

    it("should succeed when confirm=true and delete client succeeds", async () => {
      const mockData = { deleted: 5 };
      mockFn(client, "delete").mockResolvedValue(mockData);

      const handler = handlers.get("unifi_bulk_delete_vouchers");
      const result = await handler({
        siteId: "site1",
        filter: "expired.eq(true)",
        confirm: true,
      });

      expect(mockFn(client, "delete")).toHaveBeenCalledWith(
        "/sites/site1/hotspot/vouchers?filter=expired.eq%28true%29"
      );
      expect(result.content[0].text).toContain("5");
      expect(result.isError).toBeUndefined();
    });

    it("should return dryRun preview when dryRun=true and confirm=true", async () => {
      const handler = handlers.get("unifi_bulk_delete_vouchers");
      const result = await handler({
        siteId: "site1",
        filter: "expired.eq(true)",
        confirm: true,
        dryRun: true,
      });

      expect(mockFn(client, "delete")).not.toHaveBeenCalled();
      expect(result.content[0].text).toContain("dryRun");
      expect(result.content[0].text).toContain("DELETE");
      expect(result.content[0].text).toContain(
        "/sites/site1/hotspot/vouchers?filter=expired.eq%28true%29"
      );
    });

    it("should return confirmation error even with dryRun if confirm is missing", async () => {
      const handler = handlers.get("unifi_bulk_delete_vouchers");
      const result = await handler({
        siteId: "site1",
        filter: "expired.eq(true)",
        dryRun: true,
      });

      expect(mockFn(client, "delete")).not.toHaveBeenCalled();
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("confirmation");
    });

    it("should pass filter with correct query format", async () => {
      mockFn(client, "delete").mockResolvedValue({ deleted: 3 });

      const handler = handlers.get("unifi_bulk_delete_vouchers");
      await handler({
        siteId: "site1",
        filter: "name.like(guest*)",
        confirm: true,
      });

      expect(mockFn(client, "delete")).toHaveBeenCalledWith(
        "/sites/site1/hotspot/vouchers?filter=name.like%28guest*%29"
      );
    });

    it("should return error when client fails", async () => {
      const testError = new Error("Delete failed");
      mockFn(client, "delete").mockRejectedValue(testError);

      const handler = handlers.get("unifi_bulk_delete_vouchers");
      const result = await handler({
        siteId: "site1",
        filter: "expired.eq(true)",
        confirm: true,
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Delete failed");
    });
  });
});
