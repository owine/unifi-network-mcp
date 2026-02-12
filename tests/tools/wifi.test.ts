import { describe, it, expect, beforeEach } from "vitest";
import { createMockServer, createMockClient, mockFn } from "./_helpers.js";
import { registerWifiTools } from "../../src/tools/wifi.js";

describe("registerWifiTools", () => {
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
      registerWifiTools(server, client, true);
    });

    it("should register read tools when readOnly=true", () => {
      expect(handlers.has("unifi_list_wifi")).toBe(true);
      expect(handlers.has("unifi_get_wifi")).toBe(true);
    });

    it("should not register write tools when readOnly=true", () => {
      expect(handlers.has("unifi_create_wifi")).toBe(false);
      expect(handlers.has("unifi_update_wifi")).toBe(false);
      expect(handlers.has("unifi_delete_wifi")).toBe(false);
    });
  });

  describe("read-write mode", () => {
    beforeEach(() => {
      registerWifiTools(server, client, false);
    });

    it("should register all tools when readOnly=false", () => {
      expect(handlers.has("unifi_list_wifi")).toBe(true);
      expect(handlers.has("unifi_get_wifi")).toBe(true);
      expect(handlers.has("unifi_create_wifi")).toBe(true);
      expect(handlers.has("unifi_update_wifi")).toBe(true);
      expect(handlers.has("unifi_delete_wifi")).toBe(true);
    });
  });

  describe("unifi_list_wifi", () => {
    beforeEach(() => {
      registerWifiTools(server, client);
    });

    it("should register the tool", () => {
      expect(handlers.has("unifi_list_wifi")).toBe(true);
    });

    it("should have correct annotations", () => {
      const config = configs.get("unifi_list_wifi");
      expect(config?.annotations.readOnlyHint).toBe(true);
      expect(config?.annotations.destructiveHint).toBe(false);
    });

    it("should return success with default parameters", async () => {
      const mockData = [{ id: "wifi1", name: "Office" }];
      mockFn(client, "get").mockResolvedValue(mockData);

      const handler = handlers.get("unifi_list_wifi");
      const result = await handler({ siteId: "site1" });

      expect(mockFn(client, "get")).toHaveBeenCalledWith("/sites/site1/wifi");
      expect(result.content).toBeDefined();
      expect(result.content[0].text).toContain("wifi1");
      expect(result.isError).toBeUndefined();
    });

    it("should pass offset and limit to query", async () => {
      const mockData: unknown[] = [];
      mockFn(client, "get").mockResolvedValue(mockData);

      const handler = handlers.get("unifi_list_wifi");
      await handler({ siteId: "site1", offset: 5, limit: 25 });

      expect(mockFn(client, "get")).toHaveBeenCalledWith(
        "/sites/site1/wifi?offset=5&limit=25"
      );
    });

    it("should pass filter to query", async () => {
      const mockData: unknown[] = [];
      mockFn(client, "get").mockResolvedValue(mockData);

      const handler = handlers.get("unifi_list_wifi");
      await handler({ siteId: "site1", filter: "enabled.eq(true)" });

      expect(mockFn(client, "get")).toHaveBeenCalledWith(
        "/sites/site1/wifi?filter=enabled.eq%28true%29"
      );
    });

    it("should return error when client fails", async () => {
      const testError = new Error("API error");
      mockFn(client, "get").mockRejectedValue(testError);

      const handler = handlers.get("unifi_list_wifi");
      const result = await handler({ siteId: "site1" });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("API error");
    });
  });

  describe("unifi_get_wifi", () => {
    beforeEach(() => {
      registerWifiTools(server, client);
    });

    it("should register the tool", () => {
      expect(handlers.has("unifi_get_wifi")).toBe(true);
    });

    it("should have correct annotations", () => {
      const config = configs.get("unifi_get_wifi");
      expect(config?.annotations.readOnlyHint).toBe(true);
      expect(config?.annotations.destructiveHint).toBe(false);
    });

    it("should return success with site and wifi ids", async () => {
      const mockData = { id: "wifi1", name: "Office", enabled: true };
      mockFn(client, "get").mockResolvedValue(mockData);

      const handler = handlers.get("unifi_get_wifi");
      const result = await handler({
        siteId: "site1",
        wifiBroadcastId: "wifi1",
      });

      expect(mockFn(client, "get")).toHaveBeenCalledWith(
        "/sites/site1/wifi/wifi1"
      );
      expect(result.content[0].text).toContain("wifi1");
      expect(result.isError).toBeUndefined();
    });

    it("should return error when client fails", async () => {
      const testError = new Error("Not found");
      mockFn(client, "get").mockRejectedValue(testError);

      const handler = handlers.get("unifi_get_wifi");
      const result = await handler({
        siteId: "site1",
        wifiBroadcastId: "wifi1",
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Not found");
    });
  });

  describe("unifi_create_wifi", () => {
    beforeEach(() => {
      registerWifiTools(server, client);
    });

    it("should register the tool", () => {
      expect(handlers.has("unifi_create_wifi")).toBe(true);
    });

    it("should have correct annotations", () => {
      const config = configs.get("unifi_create_wifi");
      expect(config?.annotations.readOnlyHint).toBe(false);
      expect(config?.annotations.destructiveHint).toBe(false);
      expect(config?.annotations.idempotentHint).toBe(false);
    });

    it("should return success when client.post succeeds", async () => {
      const mockData = { id: "wifi-new", name: "Guest" };
      mockFn(client, "post").mockResolvedValue(mockData);

      const handler = handlers.get("unifi_create_wifi");
      const result = await handler({
        siteId: "site1",
        name: "Guest",
        enabled: true,
        type: "STANDARD",
        broadcastingFrequenciesGHz: ["2.4", "5"],
      });

      expect(mockFn(client, "post")).toHaveBeenCalledWith("/sites/site1/wifi", {
        name: "Guest",
        enabled: true,
        type: "STANDARD",
        broadcastingFrequenciesGHz: [2.4, 5],
      });
      expect(result.content[0].text).toContain("wifi-new");
      expect(result.isError).toBeUndefined();
    });

    it("should convert frequency strings to numbers", async () => {
      mockFn(client, "post").mockResolvedValue({ id: "wifi-new" });

      const handler = handlers.get("unifi_create_wifi");
      await handler({
        siteId: "site1",
        name: "Guest",
        enabled: true,
        type: "STANDARD",
        broadcastingFrequenciesGHz: ["2.4", "5", "6"],
      });

      expect(mockFn(client, "post")).toHaveBeenCalledWith(
        "/sites/site1/wifi",
        expect.objectContaining({
          broadcastingFrequenciesGHz: [2.4, 5, 6],
        })
      );
    });

    it("should return dryRun preview when dryRun=true", async () => {
      const handler = handlers.get("unifi_create_wifi");
      const result = await handler({
        siteId: "site1",
        name: "Guest",
        enabled: true,
        type: "STANDARD",
        broadcastingFrequenciesGHz: ["2.4", "5"],
        dryRun: true,
      });

      expect(mockFn(client, "post")).not.toHaveBeenCalled();
      expect(result.content[0].text).toContain("dryRun");
      expect(result.content[0].text).toContain("POST");
      expect(result.content[0].text).toContain("/sites/site1/wifi");
    });

    it("should return error when client fails", async () => {
      const testError = new Error("Create failed");
      mockFn(client, "post").mockRejectedValue(testError);

      const handler = handlers.get("unifi_create_wifi");
      const result = await handler({
        siteId: "site1",
        name: "Guest",
        enabled: true,
        type: "STANDARD",
        broadcastingFrequenciesGHz: ["2.4"],
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Create failed");
    });
  });

  describe("unifi_update_wifi", () => {
    beforeEach(() => {
      registerWifiTools(server, client);
    });

    it("should register the tool", () => {
      expect(handlers.has("unifi_update_wifi")).toBe(true);
    });

    it("should have correct annotations", () => {
      const config = configs.get("unifi_update_wifi");
      expect(config?.annotations.readOnlyHint).toBe(false);
      expect(config?.annotations.destructiveHint).toBe(false);
      expect(config?.annotations.idempotentHint).toBe(true);
    });

    it("should return success when client.put succeeds", async () => {
      const mockData = { id: "wifi1", name: "Updated" };
      mockFn(client, "put").mockResolvedValue(mockData);

      const handler = handlers.get("unifi_update_wifi");
      const result = await handler({
        siteId: "site1",
        wifiBroadcastId: "wifi1",
        name: "Updated",
      });

      expect(mockFn(client, "put")).toHaveBeenCalledWith(
        "/sites/site1/wifi/wifi1",
        { name: "Updated" }
      );
      expect(result.content[0].text).toContain("Updated");
      expect(result.isError).toBeUndefined();
    });

    it("should only include defined properties in body", async () => {
      mockFn(client, "put").mockResolvedValue({ id: "wifi1" });

      const handler = handlers.get("unifi_update_wifi");
      await handler({
        siteId: "site1",
        wifiBroadcastId: "wifi1",
        enabled: false,
      });

      expect(mockFn(client, "put")).toHaveBeenCalledWith(
        "/sites/site1/wifi/wifi1",
        { enabled: false }
      );
    });

    it("should include both name and enabled when both are provided", async () => {
      mockFn(client, "put").mockResolvedValue({ id: "wifi1" });

      const handler = handlers.get("unifi_update_wifi");
      await handler({
        siteId: "site1",
        wifiBroadcastId: "wifi1",
        name: "New Name",
        enabled: true,
      });

      expect(mockFn(client, "put")).toHaveBeenCalledWith(
        "/sites/site1/wifi/wifi1",
        { name: "New Name", enabled: true }
      );
    });

    it("should return dryRun preview when dryRun=true", async () => {
      const handler = handlers.get("unifi_update_wifi");
      const result = await handler({
        siteId: "site1",
        wifiBroadcastId: "wifi1",
        name: "Updated",
        dryRun: true,
      });

      expect(mockFn(client, "put")).not.toHaveBeenCalled();
      expect(result.content[0].text).toContain("dryRun");
      expect(result.content[0].text).toContain("PUT");
      expect(result.content[0].text).toContain("/sites/site1/wifi/wifi1");
    });

    it("should return error when client fails", async () => {
      const testError = new Error("Update failed");
      mockFn(client, "put").mockRejectedValue(testError);

      const handler = handlers.get("unifi_update_wifi");
      const result = await handler({
        siteId: "site1",
        wifiBroadcastId: "wifi1",
        name: "Updated",
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Update failed");
    });
  });

  describe("unifi_delete_wifi", () => {
    beforeEach(() => {
      registerWifiTools(server, client);
    });

    it("should register the tool", () => {
      expect(handlers.has("unifi_delete_wifi")).toBe(true);
    });

    it("should have correct annotations", () => {
      const config = configs.get("unifi_delete_wifi");
      expect(config?.annotations.readOnlyHint).toBe(false);
      expect(config?.annotations.destructiveHint).toBe(true);
    });

    it("should return success when client.delete succeeds", async () => {
      const mockData = { deleted: true };
      mockFn(client, "delete").mockResolvedValue(mockData);

      const handler = handlers.get("unifi_delete_wifi");
      const result = await handler({
        siteId: "site1",
        wifiBroadcastId: "wifi1",
        confirm: true,
      });

      expect(mockFn(client, "delete")).toHaveBeenCalledWith(
        "/sites/site1/wifi/wifi1"
      );
      expect(result.isError).toBeUndefined();
    });

    it("should add force parameter to path when force=true", async () => {
      mockFn(client, "delete").mockResolvedValue({ deleted: true });

      const handler = handlers.get("unifi_delete_wifi");
      await handler({
        siteId: "site1",
        wifiBroadcastId: "wifi1",
        force: true,
        confirm: true,
      });

      expect(mockFn(client, "delete")).toHaveBeenCalledWith(
        "/sites/site1/wifi/wifi1?force=true"
      );
    });

    it("should not add force parameter when force=false", async () => {
      mockFn(client, "delete").mockResolvedValue({ deleted: true });

      const handler = handlers.get("unifi_delete_wifi");
      await handler({
        siteId: "site1",
        wifiBroadcastId: "wifi1",
        force: false,
        confirm: true,
      });

      expect(mockFn(client, "delete")).toHaveBeenCalledWith(
        "/sites/site1/wifi/wifi1"
      );
    });

    it("should return dryRun preview when dryRun=true", async () => {
      const handler = handlers.get("unifi_delete_wifi");
      const result = await handler({
        siteId: "site1",
        wifiBroadcastId: "wifi1",
        dryRun: true,
        confirm: true,
      });

      expect(mockFn(client, "delete")).not.toHaveBeenCalled();
      expect(result.content[0].text).toContain("dryRun");
      expect(result.content[0].text).toContain("DELETE");
      expect(result.content[0].text).toContain("/sites/site1/wifi/wifi1");
    });

    it("should return dryRun with force in path when force=true and dryRun=true", async () => {
      const handler = handlers.get("unifi_delete_wifi");
      const result = await handler({
        siteId: "site1",
        wifiBroadcastId: "wifi1",
        force: true,
        dryRun: true,
        confirm: true,
      });

      expect(mockFn(client, "delete")).not.toHaveBeenCalled();
      expect(result.content[0].text).toContain("?force=true");
    });

    it("should return error when client fails", async () => {
      const testError = new Error("Delete failed");
      mockFn(client, "delete").mockRejectedValue(testError);

      const handler = handlers.get("unifi_delete_wifi");
      const result = await handler({
        siteId: "site1",
        wifiBroadcastId: "wifi1",
        confirm: true,
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Delete failed");
    });

    it("should return error when confirm is not provided", async () => {
      const handler = handlers.get("unifi_delete_wifi");
      const result = await handler({ siteId: "site1", wifiBroadcastId: "wifi1" });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("requires explicit confirmation");
    });

    it("should return error when confirm is false", async () => {
      const handler = handlers.get("unifi_delete_wifi");
      const result = await handler({
        siteId: "site1",
        wifiBroadcastId: "wifi1",
        confirm: false,
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("requires explicit confirmation");
    });
  });
});
