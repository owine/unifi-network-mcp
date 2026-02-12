import { describe, it, expect, beforeEach } from "vitest";
import { createMockServer, createMockClient, mockFn } from "./_helpers.js";
import { registerSiteTools } from "../../src/tools/sites.js";

describe("registerSiteTools", () => {
  describe("unifi_list_sites", () => {
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
      registerSiteTools(server, client);
    });

    it("should register the tool", () => {
      expect(handlers.has("unifi_list_sites")).toBe(true);
    });

    it("should have correct annotations", () => {
      const config = configs.get("unifi_list_sites");
      expect(config?.annotations.readOnlyHint).toBe(true);
      expect(config?.annotations.destructiveHint).toBe(false);
    });

    it("should return success with default parameters", async () => {
      const mockData = [{ id: "site1", name: "Office" }];
      mockFn(client, "get").mockResolvedValue(mockData);

      const handler = handlers.get("unifi_list_sites");
      const result = await handler({});

      expect(mockFn(client, "get")).toHaveBeenCalledWith("/sites");
      expect(result.content).toBeDefined();
      expect(result.content[0].text).toContain("site1");
      expect(result.isError).toBeUndefined();
    });

    it("should pass offset and limit to buildQuery", async () => {
      const mockData: unknown[] = [];
      mockFn(client, "get").mockResolvedValue(mockData);

      const handler = handlers.get("unifi_list_sites");
      await handler({ offset: 10, limit: 50 });

      expect(mockFn(client, "get")).toHaveBeenCalledWith(
        "/sites?offset=10&limit=50"
      );
    });

    it("should pass filter to buildQuery", async () => {
      const mockData: unknown[] = [];
      mockFn(client, "get").mockResolvedValue(mockData);

      const handler = handlers.get("unifi_list_sites");
      await handler({ filter: "name.like(office*)" });

      expect(mockFn(client, "get")).toHaveBeenCalledWith(
        "/sites?filter=name.like%28office*%29"
      );
    });

    it("should combine offset, limit, and filter in query", async () => {
      const mockData: unknown[] = [];
      mockFn(client, "get").mockResolvedValue(mockData);

      const handler = handlers.get("unifi_list_sites");
      await handler({ offset: 5, limit: 25, filter: "name.like(test*)" });

      expect(mockFn(client, "get")).toHaveBeenCalledWith(
        "/sites?offset=5&limit=25&filter=name.like%28test*%29"
      );
    });

    it("should return error when client.get fails", async () => {
      const testError = new Error("Network error");
      mockFn(client, "get").mockRejectedValue(testError);

      const handler = handlers.get("unifi_list_sites");
      const result = await handler({});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Network error");
    });
  });
});
