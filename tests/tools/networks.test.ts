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

    const gatewayFields = {
      isolationEnabled: false,
      cellularBackupEnabled: true,
      internetAccessEnabled: true,
      ipv4Configuration: { hostIpAddress: "192.0.2.1", prefixLength: 24 },
    };

    it("should register the tool", () => {
      expect(handlers.has("unifi_create_network")).toBe(true);
    });

    it("should have correct annotations", () => {
      const config = configs.get("unifi_create_network");
      expect(config?.annotations.readOnlyHint).toBe(false);
      expect(config?.annotations.destructiveHint).toBe(false);
      expect(config?.annotations.idempotentHint).toBe(false);
    });

    it("should POST an UNMANAGED network with only the common fields", async () => {
      const mockData = { id: "net-new", name: "External", vlanId: 30 };
      mockFn(client, "post").mockResolvedValue(mockData);

      const handler = handlers.get("unifi_create_network");
      const result = await handler({
        siteId: "site1",
        name: "External",
        management: "UNMANAGED",
        enabled: true,
        vlanId: 30,
      });

      expect(mockFn(client, "post")).toHaveBeenCalledWith(
        "/sites/site1/networks",
        { name: "External", management: "UNMANAGED", enabled: true, vlanId: 30 }
      );
      expect(result.content[0].text).toContain("net-new");
      expect(result.isError).toBeUndefined();
    });

    it("should POST a GATEWAY network with its variant fields", async () => {
      mockFn(client, "post").mockResolvedValue({ id: "net-new" });

      const handler = handlers.get("unifi_create_network");
      const result = await handler({
        siteId: "site1",
        name: "Guest",
        management: "GATEWAY",
        enabled: true,
        vlanId: 10,
        ...gatewayFields,
        zoneId: "zone-1",
      });

      expect(mockFn(client, "post")).toHaveBeenCalledWith("/sites/site1/networks", {
        name: "Guest",
        management: "GATEWAY",
        enabled: true,
        vlanId: 10,
        ...gatewayFields,
        zoneId: "zone-1",
      });
      expect(result.isError).toBeUndefined();
    });

    it("should reject a GATEWAY network missing its required variant fields", async () => {
      const handler = handlers.get("unifi_create_network");
      const result = await handler({
        siteId: "site1",
        name: "Guest",
        management: "GATEWAY",
        enabled: true,
        vlanId: 10,
      });

      expect(mockFn(client, "post")).not.toHaveBeenCalled();
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain(
        "Missing required fields for management GATEWAY: isolationEnabled, cellularBackupEnabled, internetAccessEnabled, ipv4Configuration"
      );
    });

    it("should require deviceId for a SWITCH network", async () => {
      const handler = handlers.get("unifi_create_network");
      const result = await handler({
        siteId: "site1",
        name: "Core",
        management: "SWITCH",
        enabled: true,
        vlanId: 40,
        isolationEnabled: false,
        cellularBackupEnabled: false,
        ipv4Configuration: { hostIpAddress: "198.51.100.1", prefixLength: 24 },
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("deviceId");
    });

    it("should reject fields that belong to another management type", async () => {
      const handler = handlers.get("unifi_create_network");
      const result = await handler({
        siteId: "site1",
        name: "External",
        management: "UNMANAGED",
        enabled: true,
        vlanId: 30,
        internetAccessEnabled: true,
      });

      expect(mockFn(client, "post")).not.toHaveBeenCalled();
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Fields not accepted for management UNMANAGED: internetAccessEnabled");
    });

    it("should return dryRun preview when dryRun=true", async () => {
      const handler = handlers.get("unifi_create_network");
      const result = await handler({
        siteId: "site1",
        name: "Guest",
        management: "GATEWAY",
        enabled: true,
        vlanId: 10,
        ...gatewayFields,
        dryRun: true,
      });

      expect(mockFn(client, "post")).not.toHaveBeenCalled();
      expect(result.content[0].text).toContain("dryRun");
      expect(result.content[0].text).toContain("POST");
      expect(result.content[0].text).toContain("/sites/site1/networks");
    });

    it("should return error when client fails", async () => {
      mockFn(client, "post").mockRejectedValue(new Error("Create failed"));

      const handler = handlers.get("unifi_create_network");
      const result = await handler({
        siteId: "site1",
        name: "Guest",
        management: "GATEWAY",
        enabled: true,
        vlanId: 10,
        ...gatewayFields,
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Create failed");
    });

    it("should pass dhcpGuarding when provided", async () => {
      mockFn(client, "post").mockResolvedValue({ id: "net-new" });

      const dhcpSettings = { trustedDhcpServerIpAddresses: ["192.168.1.1"] };
      const handler = handlers.get("unifi_create_network");
      const result = await handler({
        siteId: "site1",
        name: "External",
        management: "UNMANAGED",
        enabled: true,
        vlanId: 10,
        dhcpGuarding: dhcpSettings,
      });

      expect(mockFn(client, "post")).toHaveBeenCalledWith(
        "/sites/site1/networks",
        { name: "External", management: "UNMANAGED", enabled: true, vlanId: 10, dhcpGuarding: dhcpSettings }
      );
      expect(result.isError).toBeUndefined();
    });
  });

  describe("unifi_update_network", () => {
    // Shape captured live from an 11.0.83 GATEWAY network (values redacted).
    const currentNetwork = {
      management: "GATEWAY",
      id: "net1",
      name: "IoT",
      enabled: true,
      vlanId: 20,
      metadata: { origin: "USER_DEFINED" },
      isolationEnabled: false,
      cellularBackupEnabled: true,
      zoneId: "zone-1",
      internetAccessEnabled: true,
      mdnsForwardingEnabled: true,
      dhcpGuarding: { trustedDhcpServerIpAddresses: ["192.0.2.1"] },
      ipv4Configuration: {
        autoScaleEnabled: false,
        hostIpAddress: "192.0.2.1",
        prefixLength: 24,
        dhcpConfiguration: { mode: "SERVER", ntpServerIpAddresses: ["192.0.2.1", ""] },
      },
      ipv6Configuration: { interfaceType: "STATIC", prefixLength: 64 },
      default: false,
    };

    // The documented PUT body: the GET response minus its read-only fields.
    const currentBody = Object.fromEntries(
      Object.entries(currentNetwork).filter(([field]) => !["id", "metadata", "default"].includes(field))
    );

    beforeEach(() => {
      registerNetworkTools(server, client);
      mockFn(client, "get").mockResolvedValue(currentNetwork);
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

    it("should read the current network and PUT the merged full body", async () => {
      mockFn(client, "put").mockResolvedValue({ ...currentNetwork, name: "IoT Updated" });

      const handler = handlers.get("unifi_update_network");
      const result = await handler({ siteId: "site1", networkId: "net1", name: "IoT Updated" });

      expect(mockFn(client, "get")).toHaveBeenCalledWith("/sites/site1/networks/net1");
      expect(mockFn(client, "put")).toHaveBeenCalledWith("/sites/site1/networks/net1", {
        ...currentBody,
        name: "IoT Updated",
      });
      expect(result.content[0].text).toContain("IoT Updated");
      expect(result.isError).toBeUndefined();
    });

    it("should keep dhcpGuarding and ipv4Configuration when they are not passed", async () => {
      mockFn(client, "put").mockResolvedValue(currentNetwork);

      const handler = handlers.get("unifi_update_network");
      await handler({ siteId: "site1", networkId: "net1", enabled: false });

      const body = mockFn(client, "put").mock.calls[0][1];
      expect(body.dhcpGuarding).toEqual(currentNetwork.dhcpGuarding);
      expect(body.ipv4Configuration).toEqual(currentNetwork.ipv4Configuration);
      expect(body.enabled).toBe(false);
    });

    it("should not send read-only response fields", async () => {
      mockFn(client, "put").mockResolvedValue(currentNetwork);

      const handler = handlers.get("unifi_update_network");
      await handler({ siteId: "site1", networkId: "net1", vlanId: 21 });

      const body = mockFn(client, "put").mock.calls[0][1];
      expect(body).not.toHaveProperty("id");
      expect(body).not.toHaveProperty("metadata");
      expect(body).not.toHaveProperty("default");
    });

    it("should send an explicit null to clear an optional field", async () => {
      mockFn(client, "put").mockResolvedValue(currentNetwork);

      const handler = handlers.get("unifi_update_network");
      await handler({ siteId: "site1", networkId: "net1", ipv6Configuration: null, dhcpGuarding: null });

      const body = mockFn(client, "put").mock.calls[0][1];
      expect(body.ipv6Configuration).toBeNull();
      expect(body.dhcpGuarding).toBeNull();
    });

    it("should drop GATEWAY-only fields when switching to UNMANAGED", async () => {
      mockFn(client, "put").mockResolvedValue(currentNetwork);

      const handler = handlers.get("unifi_update_network");
      await handler({ siteId: "site1", networkId: "net1", management: "UNMANAGED" });

      expect(mockFn(client, "put")).toHaveBeenCalledWith("/sites/site1/networks/net1", {
        management: "UNMANAGED",
        name: "IoT",
        enabled: true,
        vlanId: 20,
        dhcpGuarding: currentNetwork.dhcpGuarding,
      });
    });

    it("should reject a switch to SWITCH without deviceId", async () => {
      const handler = handlers.get("unifi_update_network");
      const result = await handler({ siteId: "site1", networkId: "net1", management: "SWITCH" });

      expect(mockFn(client, "put")).not.toHaveBeenCalled();
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Missing required fields for management SWITCH: deviceId");
    });

    it("should return the merged body as a dryRun preview without writing", async () => {
      const handler = handlers.get("unifi_update_network");
      const result = await handler({ siteId: "site1", networkId: "net1", name: "IoT Updated", dryRun: true });

      expect(mockFn(client, "put")).not.toHaveBeenCalled();
      const preview = JSON.parse(result.content[0].text);
      expect(preview.dryRun).toBe(true);
      expect(preview.wouldExecute.method).toBe("PUT");
      expect(preview.wouldExecute.path).toBe("/sites/site1/networks/net1");
      expect(preview.wouldExecute.body).toEqual({ ...currentBody, name: "IoT Updated" });
    });

    it("should return error when the current network cannot be read", async () => {
      mockFn(client, "get").mockRejectedValue(new Error("HTTP 404: not found"));

      const handler = handlers.get("unifi_update_network");
      const result = await handler({ siteId: "site1", networkId: "missing", name: "x" });

      expect(mockFn(client, "put")).not.toHaveBeenCalled();
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("HTTP 404");
    });

    it("should return error when client.put fails", async () => {
      mockFn(client, "put").mockRejectedValue(new Error("Update failed"));

      const handler = handlers.get("unifi_update_network");
      const result = await handler({ siteId: "site1", networkId: "net1", name: "LAN" });

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
