import { describe, it, expect, beforeEach } from "vitest";
import { createMockServer, createMockClient, mockFn } from "./_helpers.js";
import { registerNetworkTools } from "../../src/tools/networks.js";

describe("registerNetworkTools", () => {
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
      registerNetworkTools(server, client, true);
    });

    it("should register read tools when readOnly=true", () => {
      expect(handlers.has("unifi_list_networks")).toBe(true);
      expect(handlers.has("unifi_get_network")).toBe(true);
      expect(handlers.has("unifi_get_network_references")).toBe(true);
    });

    it("should not register write tools when readOnly=true", () => {
      expect(handlers.has("unifi_create_network")).toBe(false);
      expect(handlers.has("unifi_update_network")).toBe(false);
      expect(handlers.has("unifi_delete_network")).toBe(false);
    });
  });

  describe("read-write mode", () => {
    beforeEach(() => {
      registerNetworkTools(server, client, false);
    });

    it("should register all tools when readOnly=false", () => {
      expect(handlers.has("unifi_list_networks")).toBe(true);
      expect(handlers.has("unifi_get_network")).toBe(true);
      expect(handlers.has("unifi_get_network_references")).toBe(true);
      expect(handlers.has("unifi_create_network")).toBe(true);
      expect(handlers.has("unifi_update_network")).toBe(true);
      expect(handlers.has("unifi_delete_network")).toBe(true);
    });
  });

  describe("unifi_list_networks", () => {
    beforeEach(() => {
      registerNetworkTools(server, client);
    });

    it("should register the tool", () => {
      expect(handlers.has("unifi_list_networks")).toBe(true);
    });

    it("should have correct annotations", () => {
      const config = configs.get("unifi_list_networks");
      expect(config?.annotations.readOnlyHint).toBe(true);
      expect(config?.annotations.destructiveHint).toBe(false);
    });

    it("should return success with default parameters", async () => {
      const mockData = [{ id: "net1", name: "LAN" }];
      mockFn(client, "get").mockResolvedValue(mockData);

      const handler = handlers.get("unifi_list_networks");
      const result = await handler({ siteId: "site1" });

      expect(mockFn(client, "get")).toHaveBeenCalledWith("/sites/site1/networks");
      expect(result.content).toBeDefined();
      expect(result.content[0].text).toContain("net1");
      expect(result.isError).toBeUndefined();
    });

    it("should pass offset and limit to query", async () => {
      const mockData: unknown[] = [];
      mockFn(client, "get").mockResolvedValue(mockData);

      const handler = handlers.get("unifi_list_networks");
      await handler({ siteId: "site1", offset: 10, limit: 50 });

      expect(mockFn(client, "get")).toHaveBeenCalledWith(
        "/sites/site1/networks?offset=10&limit=50"
      );
    });

    it("should pass filter to query", async () => {
      const mockData: unknown[] = [];
      mockFn(client, "get").mockResolvedValue(mockData);

      const handler = handlers.get("unifi_list_networks");
      await handler({ siteId: "site1", filter: "name.like(guest*)" });

      expect(mockFn(client, "get")).toHaveBeenCalledWith(
        "/sites/site1/networks?filter=name.like%28guest*%29"
      );
    });

    it("should return error when client fails", async () => {
      const testError = new Error("API error");
      mockFn(client, "get").mockRejectedValue(testError);

      const handler = handlers.get("unifi_list_networks");
      const result = await handler({ siteId: "site1" });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("API error");
    });
  });

  describe("unifi_get_network", () => {
    beforeEach(() => {
      registerNetworkTools(server, client);
    });

    it("should register the tool", () => {
      expect(handlers.has("unifi_get_network")).toBe(true);
    });

    it("should have correct annotations", () => {
      const config = configs.get("unifi_get_network");
      expect(config?.annotations.readOnlyHint).toBe(true);
      expect(config?.annotations.destructiveHint).toBe(false);
    });

    it("should return success with site and network ids", async () => {
      const mockData = { id: "net1", name: "LAN", vlanId: 1 };
      mockFn(client, "get").mockResolvedValue(mockData);

      const handler = handlers.get("unifi_get_network");
      const result = await handler({ siteId: "site1", networkId: "net1" });

      expect(mockFn(client, "get")).toHaveBeenCalledWith(
        "/sites/site1/networks/net1"
      );
      expect(result.content[0].text).toContain("net1");
      expect(result.isError).toBeUndefined();
    });

    it("should return error when client fails", async () => {
      const testError = new Error("Not found");
      mockFn(client, "get").mockRejectedValue(testError);

      const handler = handlers.get("unifi_get_network");
      const result = await handler({ siteId: "site1", networkId: "net1" });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Not found");
    });
  });

  describe("unifi_get_network_references", () => {
    beforeEach(() => {
      registerNetworkTools(server, client);
    });

    it("should register the tool", () => {
      expect(handlers.has("unifi_get_network_references")).toBe(true);
    });

    it("should have correct annotations", () => {
      const config = configs.get("unifi_get_network_references");
      expect(config?.annotations.readOnlyHint).toBe(true);
      expect(config?.annotations.destructiveHint).toBe(false);
    });

    it("should return success with network references", async () => {
      const mockData = { wifiBroadcasts: ["wifi1"], firewallZones: ["zone1"] };
      mockFn(client, "get").mockResolvedValue(mockData);

      const handler = handlers.get("unifi_get_network_references");
      const result = await handler({ siteId: "site1", networkId: "net1" });

      expect(mockFn(client, "get")).toHaveBeenCalledWith(
        "/sites/site1/networks/net1/references"
      );
      expect(result.content[0].text).toContain("wifi1");
      expect(result.isError).toBeUndefined();
    });

    it("should return error when client fails", async () => {
      const testError = new Error("Not found");
      mockFn(client, "get").mockRejectedValue(testError);

      const handler = handlers.get("unifi_get_network_references");
      const result = await handler({ siteId: "site1", networkId: "net1" });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Not found");
    });
  });

  describe("unifi_create_network", () => {
    beforeEach(() => {
      registerNetworkTools(server, client);
    });

    it("should register the tool", () => {
      expect(handlers.has("unifi_create_network")).toBe(true);
    });

    it("should have correct annotations", () => {
      const config = configs.get("unifi_create_network");
      expect(config?.annotations.readOnlyHint).toBe(false);
      expect(config?.annotations.destructiveHint).toBe(false);
      expect(config?.annotations.idempotentHint).toBe(false);
    });

    it("should return success when client.post succeeds", async () => {
      const mockData = { id: "net-new", name: "Guest", vlanId: 10 };
      mockFn(client, "post").mockResolvedValue(mockData);

      const handler = handlers.get("unifi_create_network");
      const result = await handler({
        siteId: "site1",
        name: "Guest",
        management: "GATEWAY",
        enabled: true,
        vlanId: 10,
      });

      expect(mockFn(client, "post")).toHaveBeenCalledWith(
        "/sites/site1/networks",
        { name: "Guest", management: "GATEWAY", enabled: true, vlanId: 10 }
      );
      expect(result.content[0].text).toContain("net-new");
      expect(result.isError).toBeUndefined();
    });

    it("should return dryRun preview when dryRun=true", async () => {
      const handler = handlers.get("unifi_create_network");
      const result = await handler({
        siteId: "site1",
        name: "Guest",
        management: "GATEWAY",
        enabled: true,
        vlanId: 10,
        dryRun: true,
      });

      expect(mockFn(client, "post")).not.toHaveBeenCalled();
      expect(result.content[0].text).toContain("dryRun");
      expect(result.content[0].text).toContain("POST");
      expect(result.content[0].text).toContain("/sites/site1/networks");
    });

    it("should return error when client fails", async () => {
      const testError = new Error("Create failed");
      mockFn(client, "post").mockRejectedValue(testError);

      const handler = handlers.get("unifi_create_network");
      const result = await handler({
        siteId: "site1",
        name: "Guest",
        management: "GATEWAY",
        enabled: true,
        vlanId: 10,
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Create failed");
    });
  });

  describe("unifi_update_network", () => {
    beforeEach(() => {
      registerNetworkTools(server, client);
    });

    it("should register the tool", () => {
      expect(handlers.has("unifi_update_network")).toBe(true);
    });

    it("should have correct annotations", () => {
      const config = configs.get("unifi_update_network");
      expect(config?.annotations.readOnlyHint).toBe(false);
      expect(config?.annotations.destructiveHint).toBe(false);
      expect(config?.annotations.idempotentHint).toBe(true);
    });

    it("should return success when client.put succeeds", async () => {
      const mockData = { id: "net1", name: "LAN Updated" };
      mockFn(client, "put").mockResolvedValue(mockData);

      const handler = handlers.get("unifi_update_network");
      const result = await handler({
        siteId: "site1",
        networkId: "net1",
        name: "LAN Updated",
        management: "GATEWAY",
        enabled: true,
        vlanId: 1,
      });

      expect(mockFn(client, "put")).toHaveBeenCalledWith(
        "/sites/site1/networks/net1",
        { name: "LAN Updated", management: "GATEWAY", enabled: true, vlanId: 1 }
      );
      expect(result.content[0].text).toContain("LAN Updated");
      expect(result.isError).toBeUndefined();
    });

    it("should return dryRun preview when dryRun=true", async () => {
      const handler = handlers.get("unifi_update_network");
      const result = await handler({
        siteId: "site1",
        networkId: "net1",
        name: "LAN Updated",
        management: "GATEWAY",
        enabled: true,
        vlanId: 1,
        dryRun: true,
      });

      expect(mockFn(client, "put")).not.toHaveBeenCalled();
      expect(result.content[0].text).toContain("dryRun");
      expect(result.content[0].text).toContain("PUT");
      expect(result.content[0].text).toContain("/sites/site1/networks/net1");
    });

    it("should return error when client fails", async () => {
      const testError = new Error("Update failed");
      mockFn(client, "put").mockRejectedValue(testError);

      const handler = handlers.get("unifi_update_network");
      const result = await handler({
        siteId: "site1",
        networkId: "net1",
        name: "LAN",
        management: "GATEWAY",
        enabled: true,
        vlanId: 1,
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Update failed");
    });
  });

  describe("unifi_delete_network", () => {
    beforeEach(() => {
      registerNetworkTools(server, client);
    });

    it("should register the tool", () => {
      expect(handlers.has("unifi_delete_network")).toBe(true);
    });

    it("should have correct annotations", () => {
      const config = configs.get("unifi_delete_network");
      expect(config?.annotations.readOnlyHint).toBe(false);
      expect(config?.annotations.destructiveHint).toBe(true);
    });

    it("should return success when client.delete succeeds", async () => {
      const mockData = { deleted: true };
      mockFn(client, "delete").mockResolvedValue(mockData);

      const handler = handlers.get("unifi_delete_network");
      const result = await handler({
        siteId: "site1",
        networkId: "net1",
        confirm: true,
      });

      expect(mockFn(client, "delete")).toHaveBeenCalledWith(
        "/sites/site1/networks/net1"
      );
      expect(result.isError).toBeUndefined();
    });

    it("should add force parameter to path when force=true", async () => {
      mockFn(client, "delete").mockResolvedValue({ deleted: true });

      const handler = handlers.get("unifi_delete_network");
      await handler({
        siteId: "site1",
        networkId: "net1",
        force: true,
        confirm: true,
      });

      expect(mockFn(client, "delete")).toHaveBeenCalledWith(
        "/sites/site1/networks/net1?force=true"
      );
    });

    it("should not add force parameter when force=false", async () => {
      mockFn(client, "delete").mockResolvedValue({ deleted: true });

      const handler = handlers.get("unifi_delete_network");
      await handler({
        siteId: "site1",
        networkId: "net1",
        force: false,
        confirm: true,
      });

      expect(mockFn(client, "delete")).toHaveBeenCalledWith(
        "/sites/site1/networks/net1"
      );
    });

    it("should return dryRun preview when dryRun=true", async () => {
      const handler = handlers.get("unifi_delete_network");
      const result = await handler({
        siteId: "site1",
        networkId: "net1",
        dryRun: true,
        confirm: true,
      });

      expect(mockFn(client, "delete")).not.toHaveBeenCalled();
      expect(result.content[0].text).toContain("dryRun");
      expect(result.content[0].text).toContain("DELETE");
      expect(result.content[0].text).toContain("/sites/site1/networks/net1");
    });

    it("should return dryRun with force in path when force=true and dryRun=true", async () => {
      const handler = handlers.get("unifi_delete_network");
      const result = await handler({
        siteId: "site1",
        networkId: "net1",
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

      const handler = handlers.get("unifi_delete_network");
      const result = await handler({
        siteId: "site1",
        networkId: "net1",
        confirm: true,
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Delete failed");
    });

    it("should return error when confirm is not provided", async () => {
      const handler = handlers.get("unifi_delete_network");
      const result = await handler({ siteId: "site1", networkId: "net1" });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("requires explicit confirmation");
    });

    it("should return error when confirm is false", async () => {
      const handler = handlers.get("unifi_delete_network");
      const result = await handler({
        siteId: "site1",
        networkId: "net1",
        confirm: false,
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("requires explicit confirmation");
    });
  });
});
