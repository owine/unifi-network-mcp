import { describe, it, expect, beforeEach } from "vitest";
import { createMockServer, createMockClient, mockFn } from "./_helpers.js";
import { registerSupportingTools } from "../../src/tools/supporting.js";

describe("registerSupportingTools", () => {
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
    registerSupportingTools(server, client);
  });

  describe("unifi_list_wans", () => {
    it("should register the tool", () => {
      expect(handlers.has("unifi_list_wans")).toBe(true);
    });

    it("should have correct annotations", () => {
      const config = configs.get("unifi_list_wans");
      expect(config?.annotations.readOnlyHint).toBe(true);
      expect(config?.annotations.destructiveHint).toBe(false);
    });

    it("should return success with required siteId", async () => {
      const mockData = [{ id: "wan1", name: "Primary WAN" }];
      mockFn(client, "get").mockResolvedValue(mockData);

      const handler = handlers.get("unifi_list_wans");
      const result = await handler({ siteId: "site-123" });

      expect(mockFn(client, "get")).toHaveBeenCalledWith(
        "/sites/site-123/wans"
      );
      expect(result.content[0].text).toContain("wan1");
      expect(result.isError).toBeUndefined();
    });

    it("should pass offset and limit to query", async () => {
      mockFn(client, "get").mockResolvedValue([]);

      const handler = handlers.get("unifi_list_wans");
      await handler({ siteId: "site-123", offset: 10, limit: 50 });

      expect(mockFn(client, "get")).toHaveBeenCalledWith(
        "/sites/site-123/wans?offset=10&limit=50"
      );
    });

    it("should return error on client failure", async () => {
      mockFn(client, "get").mockRejectedValue(new Error("API error"));

      const handler = handlers.get("unifi_list_wans");
      const result = await handler({ siteId: "site-123" });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("API error");
    });
  });

  describe("unifi_list_vpn_tunnels", () => {
    it("should register the tool", () => {
      expect(handlers.has("unifi_list_vpn_tunnels")).toBe(true);
    });

    it("should have correct annotations", () => {
      const config = configs.get("unifi_list_vpn_tunnels");
      expect(config?.annotations.readOnlyHint).toBe(true);
      expect(config?.annotations.destructiveHint).toBe(false);
    });

    it("should return success with required siteId", async () => {
      const mockData = [{ id: "vpn1", name: "Site-to-Site Tunnel" }];
      mockFn(client, "get").mockResolvedValue(mockData);

      const handler = handlers.get("unifi_list_vpn_tunnels");
      const result = await handler({ siteId: "site-123" });

      expect(mockFn(client, "get")).toHaveBeenCalledWith(
        "/sites/site-123/vpn/site-to-site-tunnels"
      );
      expect(result.content[0].text).toContain("vpn1");
      expect(result.isError).toBeUndefined();
    });

    it("should pass filter to query", async () => {
      mockFn(client, "get").mockResolvedValue([]);

      const handler = handlers.get("unifi_list_vpn_tunnels");
      await handler({ siteId: "site-123", filter: "status.eq(active)" });

      expect(mockFn(client, "get")).toHaveBeenCalledWith(
        "/sites/site-123/vpn/site-to-site-tunnels?filter=status.eq%28active%29"
      );
    });

    it("should return error on client failure", async () => {
      mockFn(client, "get").mockRejectedValue(new Error("Connection timeout"));

      const handler = handlers.get("unifi_list_vpn_tunnels");
      const result = await handler({ siteId: "site-123" });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Connection timeout");
    });
  });

  describe("unifi_list_vpn_servers", () => {
    it("should register the tool", () => {
      expect(handlers.has("unifi_list_vpn_servers")).toBe(true);
    });

    it("should have correct annotations", () => {
      const config = configs.get("unifi_list_vpn_servers");
      expect(config?.annotations.readOnlyHint).toBe(true);
      expect(config?.annotations.destructiveHint).toBe(false);
    });

    it("should return success with required siteId", async () => {
      const mockData = [{ id: "vpn-server-1", name: "VPN Server" }];
      mockFn(client, "get").mockResolvedValue(mockData);

      const handler = handlers.get("unifi_list_vpn_servers");
      const result = await handler({ siteId: "site-123" });

      expect(mockFn(client, "get")).toHaveBeenCalledWith(
        "/sites/site-123/vpn/servers"
      );
      expect(result.content[0].text).toContain("vpn-server-1");
      expect(result.isError).toBeUndefined();
    });

    it("should combine offset, limit, and filter", async () => {
      mockFn(client, "get").mockResolvedValue([]);

      const handler = handlers.get("unifi_list_vpn_servers");
      await handler({
        siteId: "site-123",
        offset: 0,
        limit: 100,
        filter: "enabled.eq(true)",
      });

      expect(mockFn(client, "get")).toHaveBeenCalledWith(
        "/sites/site-123/vpn/servers?offset=0&limit=100&filter=enabled.eq%28true%29"
      );
    });

    it("should return error on client failure", async () => {
      mockFn(client, "get").mockRejectedValue(new Error("Unauthorized"));

      const handler = handlers.get("unifi_list_vpn_servers");
      const result = await handler({ siteId: "site-123" });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Unauthorized");
    });
  });

  describe("unifi_list_radius_profiles", () => {
    it("should register the tool", () => {
      expect(handlers.has("unifi_list_radius_profiles")).toBe(true);
    });

    it("should have correct annotations", () => {
      const config = configs.get("unifi_list_radius_profiles");
      expect(config?.annotations.readOnlyHint).toBe(true);
      expect(config?.annotations.destructiveHint).toBe(false);
    });

    it("should return success with required siteId", async () => {
      const mockData = [{ id: "radius-1", name: "RADIUS Server 1" }];
      mockFn(client, "get").mockResolvedValue(mockData);

      const handler = handlers.get("unifi_list_radius_profiles");
      const result = await handler({ siteId: "site-123" });

      expect(mockFn(client, "get")).toHaveBeenCalledWith(
        "/sites/site-123/radius/profiles"
      );
      expect(result.content[0].text).toContain("radius-1");
      expect(result.isError).toBeUndefined();
    });

    it("should handle pagination parameters", async () => {
      mockFn(client, "get").mockResolvedValue([]);

      const handler = handlers.get("unifi_list_radius_profiles");
      await handler({ siteId: "site-123", offset: 5, limit: 25 });

      expect(mockFn(client, "get")).toHaveBeenCalledWith(
        "/sites/site-123/radius/profiles?offset=5&limit=25"
      );
    });

    it("should return error on client failure", async () => {
      mockFn(client, "get").mockRejectedValue(new Error("Server error"));

      const handler = handlers.get("unifi_list_radius_profiles");
      const result = await handler({ siteId: "site-123" });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Server error");
    });
  });

  describe("unifi_list_device_tags", () => {
    it("should register the tool", () => {
      expect(handlers.has("unifi_list_device_tags")).toBe(true);
    });

    it("should have correct annotations", () => {
      const config = configs.get("unifi_list_device_tags");
      expect(config?.annotations.readOnlyHint).toBe(true);
      expect(config?.annotations.destructiveHint).toBe(false);
    });

    it("should return success with required siteId", async () => {
      const mockData = [{ id: "tag-1", name: "Building A" }];
      mockFn(client, "get").mockResolvedValue(mockData);

      const handler = handlers.get("unifi_list_device_tags");
      const result = await handler({ siteId: "site-123" });

      expect(mockFn(client, "get")).toHaveBeenCalledWith(
        "/sites/site-123/device-tags"
      );
      expect(result.content[0].text).toContain("tag-1");
      expect(result.isError).toBeUndefined();
    });

    it("should pass filter parameter", async () => {
      mockFn(client, "get").mockResolvedValue([]);

      const handler = handlers.get("unifi_list_device_tags");
      await handler({ siteId: "site-123", filter: "name.like(Building*)" });

      expect(mockFn(client, "get")).toHaveBeenCalledWith(
        "/sites/site-123/device-tags?filter=name.like%28Building*%29"
      );
    });

    it("should return error on client failure", async () => {
      mockFn(client, "get").mockRejectedValue(new Error("Not found"));

      const handler = handlers.get("unifi_list_device_tags");
      const result = await handler({ siteId: "site-123" });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Not found");
    });
  });

  describe("unifi_list_dpi_categories", () => {
    it("should register the tool", () => {
      expect(handlers.has("unifi_list_dpi_categories")).toBe(true);
    });

    it("should have correct annotations", () => {
      const config = configs.get("unifi_list_dpi_categories");
      expect(config?.annotations.readOnlyHint).toBe(true);
      expect(config?.annotations.destructiveHint).toBe(false);
    });

    it("should return success without siteId parameter", async () => {
      const mockData = [{ id: "cat-1", name: "Social Media" }];
      mockFn(client, "get").mockResolvedValue(mockData);

      const handler = handlers.get("unifi_list_dpi_categories");
      const result = await handler({});

      expect(mockFn(client, "get")).toHaveBeenCalledWith("/dpi/categories");
      expect(result.content[0].text).toContain("cat-1");
      expect(result.isError).toBeUndefined();
    });

    it("should pass offset and limit", async () => {
      mockFn(client, "get").mockResolvedValue([]);

      const handler = handlers.get("unifi_list_dpi_categories");
      await handler({ offset: 0, limit: 50 });

      expect(mockFn(client, "get")).toHaveBeenCalledWith(
        "/dpi/categories?offset=0&limit=50"
      );
    });

    it("should pass filter parameter", async () => {
      mockFn(client, "get").mockResolvedValue([]);

      const handler = handlers.get("unifi_list_dpi_categories");
      await handler({ filter: "name.like(media*)" });

      expect(mockFn(client, "get")).toHaveBeenCalledWith(
        "/dpi/categories?filter=name.like%28media*%29"
      );
    });

    it("should return error on client failure", async () => {
      mockFn(client, "get").mockRejectedValue(new Error("DPI service unavailable"));

      const handler = handlers.get("unifi_list_dpi_categories");
      const result = await handler({});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("DPI service unavailable");
    });
  });

  describe("unifi_list_dpi_applications", () => {
    it("should register the tool", () => {
      expect(handlers.has("unifi_list_dpi_applications")).toBe(true);
    });

    it("should have correct annotations", () => {
      const config = configs.get("unifi_list_dpi_applications");
      expect(config?.annotations.readOnlyHint).toBe(true);
      expect(config?.annotations.destructiveHint).toBe(false);
    });

    it("should return success without siteId parameter", async () => {
      const mockData = [{ id: "app-1", name: "Facebook" }];
      mockFn(client, "get").mockResolvedValue(mockData);

      const handler = handlers.get("unifi_list_dpi_applications");
      const result = await handler({});

      expect(mockFn(client, "get")).toHaveBeenCalledWith("/dpi/applications");
      expect(result.content[0].text).toContain("app-1");
      expect(result.isError).toBeUndefined();
    });

    it("should handle all query parameters", async () => {
      mockFn(client, "get").mockResolvedValue([]);

      const handler = handlers.get("unifi_list_dpi_applications");
      await handler({
        offset: 10,
        limit: 100,
        filter: "name.like(google*)",
      });

      expect(mockFn(client, "get")).toHaveBeenCalledWith(
        "/dpi/applications?offset=10&limit=100&filter=name.like%28google*%29"
      );
    });

    it("should return error on client failure", async () => {
      mockFn(client, "get").mockRejectedValue(new Error("DPI database error"));

      const handler = handlers.get("unifi_list_dpi_applications");
      const result = await handler({});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("DPI database error");
    });
  });

  describe("unifi_list_countries", () => {
    it("should register the tool", () => {
      expect(handlers.has("unifi_list_countries")).toBe(true);
    });

    it("should have correct annotations", () => {
      const config = configs.get("unifi_list_countries");
      expect(config?.annotations.readOnlyHint).toBe(true);
      expect(config?.annotations.destructiveHint).toBe(false);
    });

    it("should return success without siteId parameter", async () => {
      const mockData = [
        { code: "US", name: "United States" },
        { code: "CA", name: "Canada" },
      ];
      mockFn(client, "get").mockResolvedValue(mockData);

      const handler = handlers.get("unifi_list_countries");
      const result = await handler({});

      expect(mockFn(client, "get")).toHaveBeenCalledWith("/countries");
      expect(result.content[0].text).toContain("US");
      expect(result.isError).toBeUndefined();
    });

    it("should pass filter parameter for country search", async () => {
      mockFn(client, "get").mockResolvedValue([]);

      const handler = handlers.get("unifi_list_countries");
      await handler({ filter: "name.like(United*)" });

      expect(mockFn(client, "get")).toHaveBeenCalledWith(
        "/countries?filter=name.like%28United*%29"
      );
    });

    it("should handle pagination parameters", async () => {
      mockFn(client, "get").mockResolvedValue([]);

      const handler = handlers.get("unifi_list_countries");
      await handler({ offset: 0, limit: 50 });

      expect(mockFn(client, "get")).toHaveBeenCalledWith(
        "/countries?offset=0&limit=50"
      );
    });

    it("should combine all parameters", async () => {
      mockFn(client, "get").mockResolvedValue([]);

      const handler = handlers.get("unifi_list_countries");
      await handler({
        offset: 5,
        limit: 25,
        filter: "code.eq(US)",
      });

      expect(mockFn(client, "get")).toHaveBeenCalledWith(
        "/countries?offset=5&limit=25&filter=code.eq%28US%29"
      );
    });

    it("should return error on client failure", async () => {
      mockFn(client, "get").mockRejectedValue(new Error("Geo database offline"));

      const handler = handlers.get("unifi_list_countries");
      const result = await handler({});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Geo database offline");
    });
  });
});
