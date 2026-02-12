import { describe, it, expect, beforeEach } from "vitest";
import { createMockServer, createMockClient, mockFn } from "./_helpers.js";
import { registerTrafficMatchingTools } from "../../src/tools/traffic-matching.js";

describe("registerTrafficMatchingTools", () => {
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
      registerTrafficMatchingTools(server, client, false);
    });

    describe("unifi_list_traffic_matching_lists", () => {
      it("should register the tool", () => {
        expect(handlers.has("unifi_list_traffic_matching_lists")).toBe(true);
      });

      it("should have correct annotations", () => {
        const config = configs.get("unifi_list_traffic_matching_lists");
        expect(config?.annotations.readOnlyHint).toBe(true);
        expect(config?.annotations.destructiveHint).toBe(false);
      });

      it("should return success when client.get succeeds", async () => {
        const mockData = {
          data: [
            { id: "list1", name: "Web Ports", type: "PORTS" },
            { id: "list2", name: "Office IPs", type: "IPV4_ADDRESSES" },
          ],
        };
        mockFn(client, "get").mockResolvedValue(mockData);

        const handler = handlers.get("unifi_list_traffic_matching_lists");
        const result = await handler({
          siteId: "site123",
          offset: 0,
          limit: 25,
          filter: "type.like(PORTS)",
        });

        expect(mockFn(client, "get")).toHaveBeenCalledWith(
          "/sites/site123/traffic-matching-lists?offset=0&limit=25&filter=type.like%28PORTS%29"
        );
        expect(result.content).toBeDefined();
        expect(result.content[0].text).toContain("Web Ports");
        expect(result.content[0].text).toContain("Office IPs");
        expect(result.isError).toBeUndefined();
      });

      it("should return error when client.get fails", async () => {
        const testError = new Error("API connection failed");
        mockFn(client, "get").mockRejectedValue(testError);

        const handler = handlers.get("unifi_list_traffic_matching_lists");
        const result = await handler({ siteId: "site123" });

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain("API connection failed");
      });
    });

    describe("unifi_get_traffic_matching_list", () => {
      it("should register the tool", () => {
        expect(handlers.has("unifi_get_traffic_matching_list")).toBe(true);
      });

      it("should have correct annotations", () => {
        const config = configs.get("unifi_get_traffic_matching_list");
        expect(config?.annotations.readOnlyHint).toBe(true);
        expect(config?.annotations.destructiveHint).toBe(false);
      });

      it("should return success when client.get succeeds", async () => {
        const mockData = {
          id: "list1",
          name: "Web Ports",
          type: "PORTS",
          items: ["80", "443"],
        };
        mockFn(client, "get").mockResolvedValue(mockData);

        const handler = handlers.get("unifi_get_traffic_matching_list");
        const result = await handler({
          siteId: "site123",
          trafficMatchingListId: "list1",
        });

        expect(mockFn(client, "get")).toHaveBeenCalledWith(
          "/sites/site123/traffic-matching-lists/list1"
        );
        expect(result.content).toBeDefined();
        expect(result.content[0].text).toContain("Web Ports");
        expect(result.content[0].text).toContain("80");
        expect(result.isError).toBeUndefined();
      });

      it("should return error when client.get fails", async () => {
        const testError = new Error("List not found");
        mockFn(client, "get").mockRejectedValue(testError);

        const handler = handlers.get("unifi_get_traffic_matching_list");
        const result = await handler({
          siteId: "site123",
          trafficMatchingListId: "list1",
        });

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain("List not found");
      });
    });
  });

  describe("write tools", () => {
    beforeEach(() => {
      registerTrafficMatchingTools(server, client, false);
    });

    describe("unifi_create_traffic_matching_list", () => {
      it("should register the tool", () => {
        expect(handlers.has("unifi_create_traffic_matching_list")).toBe(true);
      });

      it("should have correct annotations", () => {
        const config = configs.get("unifi_create_traffic_matching_list");
        expect(config?.annotations.readOnlyHint).toBe(false);
        expect(config?.annotations.destructiveHint).toBe(false);
        expect(config?.annotations.idempotentHint).toBe(false);
      });

      it("should return success when client.post succeeds", async () => {
        const mockData = {
          id: "list2",
          name: "Custom Ports",
          type: "PORTS",
          items: ["8080", "8443"],
        };
        mockFn(client, "post").mockResolvedValue(mockData);

        const handler = handlers.get("unifi_create_traffic_matching_list");
        const result = await handler({
          siteId: "site123",
          type: "PORTS",
          name: "Custom Ports",
          items: ["8080", "8443"],
        });

        expect(mockFn(client, "post")).toHaveBeenCalledWith(
          "/sites/site123/traffic-matching-lists",
          {
            type: "PORTS",
            name: "Custom Ports",
            items: ["8080", "8443"],
          }
        );
        expect(result.content).toBeDefined();
        expect(result.isError).toBeUndefined();
      });

      it("should handle different list types", async () => {
        const mockData = {
          id: "list3",
          name: "Office Networks",
          type: "IPV4_ADDRESSES",
          items: ["192.168.1.0/24", "10.0.0.0/8"],
        };
        mockFn(client, "post").mockResolvedValue(mockData);

        const handler = handlers.get("unifi_create_traffic_matching_list");
        const result = await handler({
          siteId: "site123",
          type: "IPV4_ADDRESSES",
          name: "Office Networks",
          items: ["192.168.1.0/24", "10.0.0.0/8"],
        });

        expect(mockFn(client, "post")).toHaveBeenCalledWith(
          "/sites/site123/traffic-matching-lists",
          {
            type: "IPV4_ADDRESSES",
            name: "Office Networks",
            items: ["192.168.1.0/24", "10.0.0.0/8"],
          }
        );
        expect(result.content).toBeDefined();
      });

      it("should return error when client.post fails", async () => {
        const testError = new Error("Failed to create list");
        mockFn(client, "post").mockRejectedValue(testError);

        const handler = handlers.get("unifi_create_traffic_matching_list");
        const result = await handler({
          siteId: "site123",
          type: "PORTS",
          name: "Test",
          items: ["80"],
        });

        expect(result.isError).toBe(true);
      });

      it("should return dry run preview when dryRun=true", async () => {
        const handler = handlers.get("unifi_create_traffic_matching_list");
        const result = await handler({
          siteId: "site123",
          type: "PORTS",
          name: "Custom Ports",
          items: ["8080", "8443"],
          dryRun: true,
        });

        expect(mockFn(client, "post")).not.toHaveBeenCalled();
        expect(result.content).toBeDefined();
        const text = result.content[0].text;
        expect(text).toContain('"dryRun": true');
        expect(text).toContain("POST");
        expect(text).toContain("/sites/site123/traffic-matching-lists");
      });
    });

    describe("unifi_update_traffic_matching_list", () => {
      it("should register the tool", () => {
        expect(handlers.has("unifi_update_traffic_matching_list")).toBe(true);
      });

      it("should have correct annotations", () => {
        const config = configs.get("unifi_update_traffic_matching_list");
        expect(config?.annotations.readOnlyHint).toBe(false);
        expect(config?.annotations.destructiveHint).toBe(false);
        expect(config?.annotations.idempotentHint).toBe(true);
      });

      it("should return success when client.put succeeds", async () => {
        const mockData = {
          id: "list1",
          name: "Web Ports Updated",
          type: "PORTS",
          items: ["80", "443", "8080"],
        };
        mockFn(client, "put").mockResolvedValue(mockData);

        const handler = handlers.get("unifi_update_traffic_matching_list");
        const result = await handler({
          siteId: "site123",
          trafficMatchingListId: "list1",
          type: "PORTS",
          name: "Web Ports Updated",
          items: ["80", "443", "8080"],
        });

        expect(mockFn(client, "put")).toHaveBeenCalledWith(
          "/sites/site123/traffic-matching-lists/list1",
          {
            type: "PORTS",
            name: "Web Ports Updated",
            items: ["80", "443", "8080"],
          }
        );
        expect(result.content).toBeDefined();
        expect(result.isError).toBeUndefined();
      });

      it("should return error when client.put fails", async () => {
        const testError = new Error("List not found");
        mockFn(client, "put").mockRejectedValue(testError);

        const handler = handlers.get("unifi_update_traffic_matching_list");
        const result = await handler({
          siteId: "site123",
          trafficMatchingListId: "list1",
          type: "PORTS",
          name: "Updated",
          items: ["80"],
        });

        expect(result.isError).toBe(true);
      });

      it("should return dry run preview when dryRun=true", async () => {
        const handler = handlers.get("unifi_update_traffic_matching_list");
        const result = await handler({
          siteId: "site123",
          trafficMatchingListId: "list1",
          type: "PORTS",
          name: "Web Ports Updated",
          items: ["80", "443", "8080"],
          dryRun: true,
        });

        expect(mockFn(client, "put")).not.toHaveBeenCalled();
        expect(result.content).toBeDefined();
        const text = result.content[0].text;
        expect(text).toContain('"dryRun": true');
        expect(text).toContain("PUT");
        expect(text).toContain("/sites/site123/traffic-matching-lists/list1");
      });
    });

    describe("unifi_delete_traffic_matching_list", () => {
      it("should register the tool", () => {
        expect(handlers.has("unifi_delete_traffic_matching_list")).toBe(true);
      });

      it("should have correct annotations", () => {
        const config = configs.get("unifi_delete_traffic_matching_list");
        expect(config?.annotations.readOnlyHint).toBe(false);
        expect(config?.annotations.destructiveHint).toBe(true);
        expect(config?.description).toContain("DESTRUCTIVE:");
      });

      it("should return success when client.delete succeeds", async () => {
        const mockData = { success: true };
        mockFn(client, "delete").mockResolvedValue(mockData);

        const handler = handlers.get("unifi_delete_traffic_matching_list");
        const result = await handler({
          siteId: "site123",
          trafficMatchingListId: "list1",
          confirm: true,
        });

        expect(mockFn(client, "delete")).toHaveBeenCalledWith(
          "/sites/site123/traffic-matching-lists/list1"
        );
        expect(result.content).toBeDefined();
        expect(result.isError).toBeUndefined();
      });

      it("should return error when client.delete fails", async () => {
        const testError = new Error("List not found");
        mockFn(client, "delete").mockRejectedValue(testError);

        const handler = handlers.get("unifi_delete_traffic_matching_list");
        const result = await handler({
          siteId: "site123",
          trafficMatchingListId: "list1",
          confirm: true,
        });

        expect(result.isError).toBe(true);
      });

      it("should return dry run preview when dryRun=true", async () => {
        const handler = handlers.get("unifi_delete_traffic_matching_list");
        const result = await handler({
          siteId: "site123",
          trafficMatchingListId: "list1",
          confirm: true,
          dryRun: true,
        });

        expect(mockFn(client, "delete")).not.toHaveBeenCalled();
        expect(result.content).toBeDefined();
        const text = result.content[0].text;
        expect(text).toContain('"dryRun": true');
        expect(text).toContain("DELETE");
        expect(text).toContain("/sites/site123/traffic-matching-lists/list1");
      });

      it("should return error when confirm is not provided", async () => {
        const handler = handlers.get("unifi_delete_traffic_matching_list");
        const result = await handler({
          siteId: "site123",
          trafficMatchingListId: "list1",
        });

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain("requires explicit confirmation");
      });

      it("should return error when confirm is false", async () => {
        const handler = handlers.get("unifi_delete_traffic_matching_list");
        const result = await handler({
          siteId: "site123",
          trafficMatchingListId: "list1",
          confirm: false,
        });

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain("requires explicit confirmation");
      });
    });
  });

  describe("readOnly mode", () => {
    beforeEach(() => {
      registerTrafficMatchingTools(server, client, true);
    });

    it("should register read tools when readOnly=true", () => {
      expect(handlers.has("unifi_list_traffic_matching_lists")).toBe(true);
      expect(handlers.has("unifi_get_traffic_matching_list")).toBe(true);
    });

    it("should not register write tools when readOnly=true", () => {
      expect(handlers.has("unifi_create_traffic_matching_list")).toBe(false);
      expect(handlers.has("unifi_update_traffic_matching_list")).toBe(false);
      expect(handlers.has("unifi_delete_traffic_matching_list")).toBe(false);
    });
  });
});
