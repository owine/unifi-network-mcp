import { describe, it, expect, beforeEach } from "vitest";
import { registerDeviceTools } from "../../src/tools/devices.js";
import { NetworkClient } from "../../src/client.js";
import { createMockServer, createMockClient, mockFn } from "./_helpers.js";

describe("registerDeviceTools", () => {
  let server: ReturnType<typeof createMockServer>;
  let client: NetworkClient;

  beforeEach(() => {
    server = createMockServer();
    client = createMockClient();
  });

  describe("read-only tools", () => {
    beforeEach(() => {
      registerDeviceTools(server.server, client, false);
    });

    describe("unifi_list_devices", () => {
      it("should list devices with success response", async () => {
        const mockData = { devices: [{ id: "dev1", name: "Device 1" }] };
        mockFn(client, "get").mockResolvedValue(mockData);

        const handler = server.handlers.get("unifi_list_devices");
        const result = await handler({
          siteId: "site1",
          offset: 0,
          limit: 25,
        });

        expect(mockFn(client, "get")).toHaveBeenCalledWith(
          "/sites/site1/devices?offset=0&limit=25"
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

        const handler = server.handlers.get("unifi_list_devices");
        const result = await handler({ siteId: "site1" });

        expect(result).toEqual({
          content: [{ type: "text", text: "Error: Network error" }],
          isError: true,
        });
      });

      it("should have READ_ONLY annotations", () => {
        const config = server.configs.get("unifi_list_devices");
        expect(config?.annotations.readOnlyHint).toBe(true);
        expect(config?.annotations.destructiveHint).toBe(false);
      });

      it("should build query string with all parameters", async () => {
        mockFn(client, "get").mockResolvedValue({});

        const handler = server.handlers.get("unifi_list_devices");
        await handler({
          siteId: "site1",
          offset: 10,
          limit: 50,
          filter: "name.like(test*)",
        });

        expect(mockFn(client, "get")).toHaveBeenCalledWith(
          "/sites/site1/devices?offset=10&limit=50&filter=name.like%28test*%29"
        );
      });
    });

    describe("unifi_get_device", () => {
      it("should get device with success response", async () => {
        const mockData = { id: "dev1", name: "Device 1", status: "online" };
        mockFn(client, "get").mockResolvedValue(mockData);

        const handler = server.handlers.get("unifi_get_device");
        const result = await handler({
          siteId: "site1",
          deviceId: "dev1",
        });

        expect(mockFn(client, "get")).toHaveBeenCalledWith(
          "/sites/site1/devices/dev1"
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
        const error = new Error("Device not found");
        mockFn(client, "get").mockRejectedValue(error);

        const handler = server.handlers.get("unifi_get_device");
        const result = await handler({
          siteId: "site1",
          deviceId: "nonexistent",
        });

        expect(result).toEqual({
          content: [{ type: "text", text: "Error: Device not found" }],
          isError: true,
        });
      });

      it("should have READ_ONLY annotations", () => {
        const config = server.configs.get("unifi_get_device");
        expect(config?.annotations.readOnlyHint).toBe(true);
        expect(config?.annotations.destructiveHint).toBe(false);
      });
    });

    describe("unifi_get_device_statistics", () => {
      it("should get statistics with success response", async () => {
        const mockData = { uptime: 1000, temperature: 45 };
        mockFn(client, "get").mockResolvedValue(mockData);

        const handler = server.handlers.get("unifi_get_device_statistics");
        const result = await handler({
          siteId: "site1",
          deviceId: "dev1",
        });

        expect(mockFn(client, "get")).toHaveBeenCalledWith(
          "/sites/site1/devices/dev1/statistics/latest"
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
        const error = new Error("Statistics unavailable");
        mockFn(client, "get").mockRejectedValue(error);

        const handler = server.handlers.get("unifi_get_device_statistics");
        const result = await handler({
          siteId: "site1",
          deviceId: "dev1",
        });

        expect(result).toEqual({
          content: [
            {
              type: "text",
              text: "Error: Statistics unavailable",
            },
          ],
          isError: true,
        });
      });

      it("should have READ_ONLY annotations", () => {
        const config = server.configs.get("unifi_get_device_statistics");
        expect(config?.annotations.readOnlyHint).toBe(true);
        expect(config?.annotations.destructiveHint).toBe(false);
      });
    });

    describe("unifi_list_pending_devices", () => {
      it("should list pending devices with success response", async () => {
        const mockData = { devices: [{ mac: "00:11:22:33:44:55" }] };
        mockFn(client, "get").mockResolvedValue(mockData);

        const handler = server.handlers.get("unifi_list_pending_devices");
        const result = await handler({ offset: 0, limit: 25 });

        expect(mockFn(client, "get")).toHaveBeenCalledWith(
          "/pending-devices?offset=0&limit=25"
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
        const error = new Error("Failed to list pending devices");
        mockFn(client, "get").mockRejectedValue(error);

        const handler = server.handlers.get("unifi_list_pending_devices");
        const result = await handler({});

        expect(result).toEqual({
          content: [
            {
              type: "text",
              text: "Error: Failed to list pending devices",
            },
          ],
          isError: true,
        });
      });

      it("should have READ_ONLY annotations", () => {
        const config = server.configs.get("unifi_list_pending_devices");
        expect(config?.annotations.readOnlyHint).toBe(true);
        expect(config?.annotations.destructiveHint).toBe(false);
      });
    });
  });

  describe("write tools (not registered in readOnly mode)", () => {
    describe("when readOnly=true", () => {
      beforeEach(() => {
        registerDeviceTools(server.server, client, true);
      });

      it("should not register unifi_adopt_device", () => {
        expect(server.handlers.has("unifi_adopt_device")).toBe(false);
      });

      it("should not register unifi_remove_device", () => {
        expect(server.handlers.has("unifi_remove_device")).toBe(false);
      });

      it("should not register unifi_restart_device", () => {
        expect(server.handlers.has("unifi_restart_device")).toBe(false);
      });

      it("should not register unifi_power_cycle_port", () => {
        expect(server.handlers.has("unifi_power_cycle_port")).toBe(false);
      });

      it("should still register read-only tools", () => {
        expect(server.handlers.has("unifi_list_devices")).toBe(true);
        expect(server.handlers.has("unifi_get_device")).toBe(true);
        expect(server.handlers.has("unifi_get_device_statistics")).toBe(true);
        expect(server.handlers.has("unifi_list_pending_devices")).toBe(true);
      });
    });

    describe("unifi_adopt_device", () => {
      beforeEach(() => {
        registerDeviceTools(server.server, client, false);
      });

      it("should adopt device with success response", async () => {
        const mockData = { id: "dev1", status: "adopted" };
        mockFn(client, "post").mockResolvedValue(mockData);

        const handler = server.handlers.get("unifi_adopt_device");
        const result = await handler({
          siteId: "site1",
          macAddress: "00:11:22:33:44:55",
        });

        expect(mockFn(client, "post")).toHaveBeenCalledWith(
          "/sites/site1/devices",
          {
            macAddress: "00:11:22:33:44:55",
            ignoreDeviceLimit: false,
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
        const error = new Error("Adoption failed");
        mockFn(client, "post").mockRejectedValue(error);

        const handler = server.handlers.get("unifi_adopt_device");
        const result = await handler({
          siteId: "site1",
          macAddress: "00:11:22:33:44:55",
        });

        expect(result).toEqual({
          content: [{ type: "text", text: "Error: Adoption failed" }],
          isError: true,
        });
      });

      it("should have WRITE_NOT_IDEMPOTENT annotations", () => {
        const config = server.configs.get("unifi_adopt_device");
        expect(config?.annotations.readOnlyHint).toBe(false);
        expect(config?.annotations.destructiveHint).toBe(false);
        expect(config?.annotations.idempotentHint).toBe(false);
      });

      it("should preview action when dryRun=true", async () => {
        const handler = server.handlers.get("unifi_adopt_device");
        const result = await handler({
          siteId: "site1",
          macAddress: "00:11:22:33:44:55",
          dryRun: true,
        });

        expect(mockFn(client, "post")).not.toHaveBeenCalled();
        expect(result.content[0].type).toBe("text");
        const text = JSON.parse(result.content[0].text);
        expect(text.dryRun).toBe(true);
        expect(text.wouldExecute.method).toBe("POST");
        expect(text.wouldExecute.path).toBe("/sites/site1/devices");
      });
    });

    describe("unifi_remove_device", () => {
      beforeEach(() => {
        registerDeviceTools(server.server, client, false);
      });

      it("should remove device with confirm=true", async () => {
        const mockData = { success: true };
        mockFn(client, "delete").mockResolvedValue(mockData);

        const handler = server.handlers.get("unifi_remove_device");
        const result = await handler({
          siteId: "site1",
          deviceId: "dev1",
          confirm: true,
        });

        expect(mockFn(client, "delete")).toHaveBeenCalledWith(
          "/sites/site1/devices/dev1"
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

      it("should require confirmation", async () => {
        const handler = server.handlers.get("unifi_remove_device");
        const result = await handler({
          siteId: "site1",
          deviceId: "dev1",
        });

        expect(mockFn(client, "delete")).not.toHaveBeenCalled();
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain(
          "This action requires explicit confirmation"
        );
      });

      it("should require confirmation=true (not just truthy)", async () => {
        const handler = server.handlers.get("unifi_remove_device");
        const result = await handler({
          siteId: "site1",
          deviceId: "dev1",
          confirm: false,
        });

        expect(mockFn(client, "delete")).not.toHaveBeenCalled();
        expect(result.isError).toBe(true);
      });

      it("should handle client errors when confirm=true", async () => {
        const error = new Error("Removal failed");
        mockFn(client, "delete").mockRejectedValue(error);

        const handler = server.handlers.get("unifi_remove_device");
        const result = await handler({
          siteId: "site1",
          deviceId: "dev1",
          confirm: true,
        });

        expect(result).toEqual({
          content: [{ type: "text", text: "Error: Removal failed" }],
          isError: true,
        });
      });

      it("should have DESTRUCTIVE annotations", () => {
        const config = server.configs.get("unifi_remove_device");
        expect(config?.annotations.readOnlyHint).toBe(false);
        expect(config?.annotations.destructiveHint).toBe(true);
        expect(config?.annotations.idempotentHint).toBe(false);
      });

      it("should preview action when dryRun=true and confirm=true", async () => {
        const handler = server.handlers.get("unifi_remove_device");
        const result = await handler({
          siteId: "site1",
          deviceId: "dev1",
          confirm: true,
          dryRun: true,
        });

        expect(mockFn(client, "delete")).not.toHaveBeenCalled();
        expect(result.content[0].type).toBe("text");
        const text = JSON.parse(result.content[0].text);
        expect(text.dryRun).toBe(true);
        expect(text.wouldExecute.method).toBe("DELETE");
        expect(text.wouldExecute.path).toBe("/sites/site1/devices/dev1");
      });
    });

    describe("unifi_restart_device", () => {
      beforeEach(() => {
        registerDeviceTools(server.server, client, false);
      });

      it("should restart device with success response", async () => {
        const mockData = { status: "restarting" };
        mockFn(client, "post").mockResolvedValue(mockData);

        const handler = server.handlers.get("unifi_restart_device");
        const result = await handler({
          siteId: "site1",
          deviceId: "dev1",
        });

        expect(mockFn(client, "post")).toHaveBeenCalledWith(
          "/sites/site1/devices/dev1/actions",
          { action: "RESTART" }
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
        const error = new Error("Restart failed");
        mockFn(client, "post").mockRejectedValue(error);

        const handler = server.handlers.get("unifi_restart_device");
        const result = await handler({
          siteId: "site1",
          deviceId: "dev1",
        });

        expect(result).toEqual({
          content: [{ type: "text", text: "Error: Restart failed" }],
          isError: true,
        });
      });

      it("should have WRITE annotations", () => {
        const config = server.configs.get("unifi_restart_device");
        expect(config?.annotations.readOnlyHint).toBe(false);
        expect(config?.annotations.destructiveHint).toBe(false);
        expect(config?.annotations.idempotentHint).toBe(true);
      });

      it("should preview action when dryRun=true", async () => {
        const handler = server.handlers.get("unifi_restart_device");
        const result = await handler({
          siteId: "site1",
          deviceId: "dev1",
          dryRun: true,
        });

        expect(mockFn(client, "post")).not.toHaveBeenCalled();
        expect(result.content[0].type).toBe("text");
        const text = JSON.parse(result.content[0].text);
        expect(text.dryRun).toBe(true);
        expect(text.wouldExecute.method).toBe("POST");
        expect(text.wouldExecute.path).toBe("/sites/site1/devices/dev1/actions");
        expect(text.wouldExecute.body).toEqual({ action: "RESTART" });
      });
    });

    describe("unifi_power_cycle_port", () => {
      beforeEach(() => {
        registerDeviceTools(server.server, client, false);
      });

      it("should power cycle port with success response", async () => {
        const mockData = { status: "power_cycling" };
        mockFn(client, "post").mockResolvedValue(mockData);

        const handler = server.handlers.get("unifi_power_cycle_port");
        const result = await handler({
          siteId: "site1",
          deviceId: "dev1",
          portIdx: 1,
        });

        expect(mockFn(client, "post")).toHaveBeenCalledWith(
          "/sites/site1/devices/dev1/interfaces/ports/1/actions",
          { action: "POWER_CYCLE" }
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
        const error = new Error("Power cycle failed");
        mockFn(client, "post").mockRejectedValue(error);

        const handler = server.handlers.get("unifi_power_cycle_port");
        const result = await handler({
          siteId: "site1",
          deviceId: "dev1",
          portIdx: 1,
        });

        expect(result).toEqual({
          content: [{ type: "text", text: "Error: Power cycle failed" }],
          isError: true,
        });
      });

      it("should have WRITE annotations", () => {
        const config = server.configs.get("unifi_power_cycle_port");
        expect(config?.annotations.readOnlyHint).toBe(false);
        expect(config?.annotations.destructiveHint).toBe(false);
        expect(config?.annotations.idempotentHint).toBe(true);
      });

      it("should preview action when dryRun=true", async () => {
        const handler = server.handlers.get("unifi_power_cycle_port");
        const result = await handler({
          siteId: "site1",
          deviceId: "dev1",
          portIdx: 1,
          dryRun: true,
        });

        expect(mockFn(client, "post")).not.toHaveBeenCalled();
        expect(result.content[0].type).toBe("text");
        const text = JSON.parse(result.content[0].text);
        expect(text.dryRun).toBe(true);
        expect(text.wouldExecute.method).toBe("POST");
        expect(text.wouldExecute.path).toBe(
          "/sites/site1/devices/dev1/interfaces/ports/1/actions"
        );
        expect(text.wouldExecute.body).toEqual({ action: "POWER_CYCLE" });
      });

      it("should work with different port indices", async () => {
        mockFn(client, "post").mockResolvedValue({});

        const handler = server.handlers.get("unifi_power_cycle_port");
        await handler({
          siteId: "site1",
          deviceId: "dev1",
          portIdx: 5,
        });

        expect(mockFn(client, "post")).toHaveBeenCalledWith(
          "/sites/site1/devices/dev1/interfaces/ports/5/actions",
          { action: "POWER_CYCLE" }
        );
      });
    });
  });
});
