import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { NetworkClient } from "../client.js";
import { formatSuccess, formatError } from "../utils/responses.js";
import { buildQuery } from "../utils/query.js";
import { READ_ONLY, WRITE_NOT_IDEMPOTENT, DESTRUCTIVE, WRITE, formatDryRun, requireConfirmation } from "../utils/safety.js";

export function registerDeviceTools(
  server: McpServer,
  client: NetworkClient,
  readOnly = false
) {
  server.registerTool(
    "unifi_list_devices",
    {
      description: "List all adopted devices at a site",
      inputSchema: {
        siteId: z.string().describe("Site ID"),
        offset: z
          .number()
          .int()
          .nonnegative()
          .optional()
          .describe("Number of records to skip (default: 0)"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(200)
          .optional()
          .describe("Number of records to return (default: 25, max: 200)"),
        filter: z.string().optional().describe("Filter expression"),
      },
      annotations: READ_ONLY,
    },
    async ({ siteId, offset, limit, filter }) => {
      try {
        const query = buildQuery({ offset, limit, filter });
        const data = await client.get(`/sites/${siteId}/devices${query}`);
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.registerTool(
    "unifi_get_device",
    {
      description: "Get a specific device by ID",
      inputSchema: {
        siteId: z.string().describe("Site ID"),
        deviceId: z.string().describe("Device ID"),
      },
      annotations: READ_ONLY,
    },
    async ({ siteId, deviceId }) => {
      try {
        const data = await client.get(`/sites/${siteId}/devices/${deviceId}`);
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.registerTool(
    "unifi_get_device_statistics",
    {
      description: "Get latest statistics for a device",
      inputSchema: {
        siteId: z.string().describe("Site ID"),
        deviceId: z.string().describe("Device ID"),
      },
      annotations: READ_ONLY,
    },
    async ({ siteId, deviceId }) => {
      try {
        const data = await client.get(
          `/sites/${siteId}/devices/${deviceId}/statistics/latest`
        );
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.registerTool(
    "unifi_list_pending_devices",
    {
      description: "List devices pending adoption (global, not site-specific)",
      inputSchema: {
        offset: z
          .number()
          .int()
          .nonnegative()
          .optional()
          .describe("Number of records to skip (default: 0)"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(200)
          .optional()
          .describe("Number of records to return (default: 25, max: 200)"),
        filter: z.string().optional().describe("Filter expression"),
      },
      annotations: READ_ONLY,
    },
    async ({ offset, limit, filter }) => {
      try {
        const query = buildQuery({ offset, limit, filter });
        const data = await client.get(`/pending-devices${query}`);
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  if (readOnly) return;

  server.registerTool(
    "unifi_adopt_device",
    {
      description: "Adopt a pending device",
      inputSchema: {
        siteId: z.string().describe("Site ID"),
        macAddress: z.string().describe("MAC address of the device"),
        dryRun: z.boolean().optional().describe("Preview this action without executing it"),
      },
      annotations: WRITE_NOT_IDEMPOTENT,
    },
    async ({ siteId, macAddress, dryRun }) => {
      const body = {
        macAddress,
        ignoreDeviceLimit: false,
      };

      if (dryRun) return formatDryRun("POST", `/sites/${siteId}/devices`, body);

      try {
        const data = await client.post(`/sites/${siteId}/devices`, body);
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.registerTool(
    "unifi_remove_device",
    {
      description: "DESTRUCTIVE: Remove (unadopt) a device from a site. If the device is online, it will be reset to factory defaults",
      inputSchema: {
        siteId: z.string().describe("Site ID"),
        deviceId: z.string().describe("Device ID"),
        confirm: z.boolean().optional().describe("Must be true to execute this destructive action"),
        dryRun: z.boolean().optional().describe("Preview this action without executing it"),
      },
      annotations: DESTRUCTIVE,
    },
    async ({ siteId, deviceId, confirm, dryRun }) => {
      const guard = requireConfirmation(confirm, "This will remove the device from the site. If the device is online, it will be reset to factory defaults");
      if (guard) return guard;

      if (dryRun) return formatDryRun("DELETE", `/sites/${siteId}/devices/${deviceId}`, {});

      try {
        const data = await client.delete(
          `/sites/${siteId}/devices/${deviceId}`
        );
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.registerTool(
    "unifi_restart_device",
    {
      description: "Restart a device",
      inputSchema: {
        siteId: z.string().describe("Site ID"),
        deviceId: z.string().describe("Device ID"),
        dryRun: z.boolean().optional().describe("Preview this action without executing it"),
      },
      annotations: WRITE,
    },
    async ({ siteId, deviceId, dryRun }) => {
      const body = { action: "RESTART" };

      if (dryRun) return formatDryRun("POST", `/sites/${siteId}/devices/${deviceId}/actions`, body);

      try {
        const data = await client.post(
          `/sites/${siteId}/devices/${deviceId}/actions`,
          body
        );
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.registerTool(
    "unifi_power_cycle_port",
    {
      description: "Power cycle a specific port on a device (PoE restart)",
      inputSchema: {
        siteId: z.string().describe("Site ID"),
        deviceId: z.string().describe("Device ID"),
        portIdx: z.number().int().describe("Port index number"),
        dryRun: z.boolean().optional().describe("Preview this action without executing it"),
      },
      annotations: WRITE,
    },
    async ({ siteId, deviceId, portIdx, dryRun }) => {
      const body = { action: "POWER_CYCLE" };

      if (dryRun) return formatDryRun("POST", `/sites/${siteId}/devices/${deviceId}/interfaces/ports/${portIdx}/actions`, body);

      try {
        const data = await client.post(
          `/sites/${siteId}/devices/${deviceId}/interfaces/ports/${portIdx}/actions`,
          body
        );
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );
}
