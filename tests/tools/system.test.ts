import { describe, it, expect, beforeEach } from "vitest";
import { createMockServer, createMockClient, mockFn } from "./_helpers.js";
import { registerSystemTools } from "../../src/tools/system.js";

describe("registerSystemTools", () => {
  describe("unifi_get_info", () => {
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
      registerSystemTools(server, client);
    });

    it("should register the tool", () => {
      expect(handlers.has("unifi_get_info")).toBe(true);
    });

    it("should have correct annotations", () => {
      const config = configs.get("unifi_get_info");
      expect(config?.annotations.readOnlyHint).toBe(true);
      expect(config?.annotations.destructiveHint).toBe(false);
    });

    it("should return success when client.get succeeds", async () => {
      const mockData = { version: "7.0.0", isConsole: true };
      mockFn(client, "get").mockResolvedValue(mockData);

      const handler = handlers.get("unifi_get_info");
      const result = await handler();

      expect(mockFn(client, "get")).toHaveBeenCalledWith("/info");
      expect(result.content).toBeDefined();
      expect(result.content[0].text).toContain("version");
      expect(result.content[0].text).toContain("7.0.0");
      expect(result.isError).toBeUndefined();
    });

    it("should return error when client.get fails", async () => {
      const testError = new Error("API connection failed");
      mockFn(client, "get").mockRejectedValue(testError);

      const handler = handlers.get("unifi_get_info");
      const result = await handler();

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("API connection failed");
    });
  });
});
