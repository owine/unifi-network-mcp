import { describe, it, expect, beforeEach } from "vitest";
import { registerClientTools } from "../../src/tools/clients.js";
import { NetworkClient } from "../../src/client.js";
import { createMockServer, createMockClient, mockFn } from "./_helpers.js";

describe("registerClientTools", () => {
  let server: ReturnType<typeof createMockServer>;
  let client: NetworkClient;

  beforeEach(() => {
    server = createMockServer();
    client = createMockClient();
  });

  describe("read-only tools", () => {
    beforeEach(() => {
      registerClientTools(server.server, client, false);
    });

    describe("unifi_list_clients", () => {
      it("should list clients with success response", async () => {
        const mockData = { clients: [{ id: "client1", hostname: "laptop" }] };
        mockFn(client, "get").mockResolvedValue(mockData);

        const handler = server.handlers.get("unifi_list_clients");
        const result = await handler({
          siteId: "site1",
          offset: 0,
          limit: 25,
        });

        expect(mockFn(client, "get")).toHaveBeenCalledWith(
          "/sites/site1/clients?offset=0&limit=25"
        );
        expect(result).toEqual({
          content: [
            {
              type: "text",
              text: JSON.stringify(mockData, null, 2),
            },
          ],
        });
      });

      it("should handle client errors", async () => {
        const error = new Error("Network error");
        mockFn(client, "get").mockRejectedValue(error);

        const handler = server.handlers.get("unifi_list_clients");
        const result = await handler({ siteId: "site1" });

        expect(result).toEqual({
          content: [{ type: "text", text: "Error: Network error" }],
          isError: true,
        });
      });

      it("should have READ_ONLY annotations", () => {
        const config = server.configs.get("unifi_list_clients");
        expect(config?.annotations.readOnlyHint).toBe(true);
        expect(config?.annotations.destructiveHint).toBe(false);
      });

      it("should build query string with all parameters", async () => {
        mockFn(client, "get").mockResolvedValue({});

        const handler = server.handlers.get("unifi_list_clients");
        await handler({
          siteId: "site1",
          offset: 10,
          limit: 50,
          filter: "hostname.like(test*)",
        });

        expect(mockFn(client, "get")).toHaveBeenCalledWith(
          "/sites/site1/clients?offset=10&limit=50&filter=hostname.like%28test*%29"
        );
      });
    });

    describe("unifi_get_client", () => {
      it("should get client with success response", async () => {
        const mockData = {
          id: "client1",
          hostname: "laptop",
          ip: "192.168.1.100",
        };
        mockFn(client, "get").mockResolvedValue(mockData);

        const handler = server.handlers.get("unifi_get_client");
        const result = await handler({
          siteId: "site1",
          clientId: "client1",
        });

        expect(mockFn(client, "get")).toHaveBeenCalledWith(
          "/sites/site1/clients/client1"
        );
        expect(result).toEqual({
          content: [
            {
              type: "text",
              text: JSON.stringify(mockData, null, 2),
            },
          ],
        });
      });

      it("should handle client errors", async () => {
        const error = new Error("Client not found");
        mockFn(client, "get").mockRejectedValue(error);

        const handler = server.handlers.get("unifi_get_client");
        const result = await handler({
          siteId: "site1",
          clientId: "nonexistent",
        });

        expect(result).toEqual({
          content: [{ type: "text", text: "Error: Client not found" }],
          isError: true,
        });
      });

      it("should have READ_ONLY annotations", () => {
        const config = server.configs.get("unifi_get_client");
        expect(config?.annotations.readOnlyHint).toBe(true);
        expect(config?.annotations.destructiveHint).toBe(false);
      });
    });
  });

  describe("write tools (not registered in readOnly mode)", () => {
    describe("when readOnly=true", () => {
      beforeEach(() => {
        registerClientTools(server.server, client, true);
      });

      it("should not register unifi_authorize_guest", () => {
        expect(server.handlers.has("unifi_authorize_guest")).toBe(false);
      });

      it("should not register unifi_unauthorize_guest", () => {
        expect(server.handlers.has("unifi_unauthorize_guest")).toBe(false);
      });

      it("should still register read-only tools", () => {
        expect(server.handlers.has("unifi_list_clients")).toBe(true);
        expect(server.handlers.has("unifi_get_client")).toBe(true);
      });
    });

    describe("unifi_authorize_guest", () => {
      beforeEach(() => {
        registerClientTools(server.server, client, false);
      });

      it("should authorize guest with required parameters only", async () => {
        const mockData = { id: "client1", authorized: true };
        mockFn(client, "post").mockResolvedValue(mockData);

        const handler = server.handlers.get("unifi_authorize_guest");
        const result = await handler({
          siteId: "site1",
          clientId: "client1",
        });

        expect(mockFn(client, "post")).toHaveBeenCalledWith(
          "/sites/site1/clients/client1/actions",
          {
            action: "AUTHORIZE_GUEST_ACCESS",
          }
        );
        expect(result).toEqual({
          content: [
            {
              type: "text",
              text: JSON.stringify(mockData, null, 2),
            },
          ],
        });
      });

      it("should authorize guest with all optional parameters", async () => {
        const mockData = { id: "client1", authorized: true };
        mockFn(client, "post").mockResolvedValue(mockData);

        const handler = server.handlers.get("unifi_authorize_guest");
        const result = await handler({
          siteId: "site1",
          clientId: "client1",
          timeLimitMinutes: 120,
          dataUsageLimitMBytes: 500,
          rxRateLimitKbps: 10000,
          txRateLimitKbps: 5000,
        });

        expect(mockFn(client, "post")).toHaveBeenCalledWith(
          "/sites/site1/clients/client1/actions",
          {
            action: "AUTHORIZE_GUEST_ACCESS",
            timeLimitMinutes: 120,
            dataUsageLimitMBytes: 500,
            rxRateLimitKbps: 10000,
            txRateLimitKbps: 5000,
          }
        );
        expect(result).toEqual({
          content: [
            {
              type: "text",
              text: JSON.stringify(mockData, null, 2),
            },
          ],
        });
      });

      it("should include only provided optional parameters", async () => {
        mockFn(client, "post").mockResolvedValue({});

        const handler = server.handlers.get("unifi_authorize_guest");
        await handler({
          siteId: "site1",
          clientId: "client1",
          timeLimitMinutes: 60,
          rxRateLimitKbps: 8000,
        });

        expect(mockFn(client, "post")).toHaveBeenCalledWith(
          "/sites/site1/clients/client1/actions",
          {
            action: "AUTHORIZE_GUEST_ACCESS",
            timeLimitMinutes: 60,
            rxRateLimitKbps: 8000,
          }
        );
      });

      it("should handle client errors", async () => {
        const error = new Error("Authorization failed");
        mockFn(client, "post").mockRejectedValue(error);

        const handler = server.handlers.get("unifi_authorize_guest");
        const result = await handler({
          siteId: "site1",
          clientId: "client1",
        });

        expect(result).toEqual({
          content: [
            {
              type: "text",
              text: "Error: Authorization failed",
            },
          ],
          isError: true,
        });
      });

      it("should have WRITE_NOT_IDEMPOTENT annotations", () => {
        const config = server.configs.get("unifi_authorize_guest");
        expect(config?.annotations.readOnlyHint).toBe(false);
        expect(config?.annotations.destructiveHint).toBe(false);
        expect(config?.annotations.idempotentHint).toBe(false);
      });

      it("should preview action when dryRun=true", async () => {
        const handler = server.handlers.get("unifi_authorize_guest");
        const result = await handler({
          siteId: "site1",
          clientId: "client1",
          timeLimitMinutes: 60,
          dryRun: true,
        });

        expect(mockFn(client, "post")).not.toHaveBeenCalled();
        expect(result.content[0].type).toBe("text");
        const text = JSON.parse(result.content[0].text);
        expect(text.dryRun).toBe(true);
        expect(text.wouldExecute.method).toBe("POST");
        expect(text.wouldExecute.path).toBe(
          "/sites/site1/clients/client1/actions"
        );
        expect(text.wouldExecute.body.action).toBe("AUTHORIZE_GUEST_ACCESS");
        expect(text.wouldExecute.body.timeLimitMinutes).toBe(60);
      });

      it("should preview action with all optional parameters", async () => {
        const handler = server.handlers.get("unifi_authorize_guest");
        const result = await handler({
          siteId: "site1",
          clientId: "client1",
          timeLimitMinutes: 120,
          dataUsageLimitMBytes: 500,
          rxRateLimitKbps: 10000,
          txRateLimitKbps: 5000,
          dryRun: true,
        });

        expect(mockFn(client, "post")).not.toHaveBeenCalled();
        const text = JSON.parse(result.content[0].text);
        expect(text.wouldExecute.body).toEqual({
          action: "AUTHORIZE_GUEST_ACCESS",
          timeLimitMinutes: 120,
          dataUsageLimitMBytes: 500,
          rxRateLimitKbps: 10000,
          txRateLimitKbps: 5000,
        });
      });
    });

    describe("unifi_unauthorize_guest", () => {
      beforeEach(() => {
        registerClientTools(server.server, client, false);
      });

      it("should unauthorize guest with success response", async () => {
        const mockData = { id: "client1", authorized: false };
        mockFn(client, "post").mockResolvedValue(mockData);

        const handler = server.handlers.get("unifi_unauthorize_guest");
        const result = await handler({
          siteId: "site1",
          clientId: "client1",
        });

        expect(mockFn(client, "post")).toHaveBeenCalledWith(
          "/sites/site1/clients/client1/actions",
          {
            action: "UNAUTHORIZE_GUEST_ACCESS",
          }
        );
        expect(result).toEqual({
          content: [
            {
              type: "text",
              text: JSON.stringify(mockData, null, 2),
            },
          ],
        });
      });

      it("should handle client errors", async () => {
        const error = new Error("Unauthorization failed");
        mockFn(client, "post").mockRejectedValue(error);

        const handler = server.handlers.get("unifi_unauthorize_guest");
        const result = await handler({
          siteId: "site1",
          clientId: "client1",
        });

        expect(result).toEqual({
          content: [
            {
              type: "text",
              text: "Error: Unauthorization failed",
            },
          ],
          isError: true,
        });
      });

      it("should have WRITE annotations", () => {
        const config = server.configs.get("unifi_unauthorize_guest");
        expect(config?.annotations.readOnlyHint).toBe(false);
        expect(config?.annotations.destructiveHint).toBe(false);
        expect(config?.annotations.idempotentHint).toBe(true);
      });

      it("should preview action when dryRun=true", async () => {
        const handler = server.handlers.get("unifi_unauthorize_guest");
        const result = await handler({
          siteId: "site1",
          clientId: "client1",
          dryRun: true,
        });

        expect(mockFn(client, "post")).not.toHaveBeenCalled();
        expect(result.content[0].type).toBe("text");
        const text = JSON.parse(result.content[0].text);
        expect(text.dryRun).toBe(true);
        expect(text.wouldExecute.method).toBe("POST");
        expect(text.wouldExecute.path).toBe(
          "/sites/site1/clients/client1/actions"
        );
        expect(text.wouldExecute.body).toEqual({
          action: "UNAUTHORIZE_GUEST_ACCESS",
        });
      });
    });
  });
});
