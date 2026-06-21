import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { NetworkClient } from "../client.js";
import { formatSuccess, formatError } from "../utils/responses.js";
import { buildQuery } from "../utils/query.js";
import { READ_ONLY, WRITE_NOT_IDEMPOTENT, DESTRUCTIVE, WRITE, formatDryRun, requireConfirmation } from "../utils/safety.js";
import {
  listDevicesOutputSchema,
  getDeviceOutputSchema,
  getDeviceStatisticsOutputSchema,
  listPendingDevicesOutputSchema,
} from "../utils/output-schemas.js";
// Adopt echoes the adopted device — reuse the device detail schema.
const adoptDeviceOutputSchema = getDeviceOutputSchema;

export function registerDeviceTools(
  server: McpServer,
  client: NetworkClient,
  readOnly = false
) {
  server.registerTool(
    "unifi_list_devices",
    {
      description: "List all adopted devices (gateways, switches, APs) at a site. Returns: id, name, model, macAddress, ipAddress, state (ONLINE/OFFLINE/etc), supported, firmwareVersion, firmwareUpdatable, features[] (capability tags, e.g. ['switching'] or ['accessPoint']), interfaces[] (e.g. ['ports'] or ['radios']). NOTE: features/interfaces are string arrays here; unifi_get_device expands them into objects. Use for: device inventory; pair with unifi_get_device for full config (port table, radios) and unifi_get_device_statistics for live metrics.",
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
      outputSchema: listDevicesOutputSchema,
      annotations: READ_ONLY,
    },
    async ({ siteId, offset, limit, filter }) => {
      try {
        const query = buildQuery({ offset, limit, filter });
        const data = await client.get(`/sites/${siteId}/devices${query}`);
        return formatSuccess(data, { structured: true });
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.registerTool(
    "unifi_get_device",
    {
      description: "Get full configuration for a device. Returns (in addition to list fields): supported, firmwareUpdatable, provisionedAt, configurationId, uplink.deviceId, features (object keyed by capability: switching {lags[]} / accessPoint {}), interfaces.ports[] for switches ({idx, state, connector, maxSpeedMbps, speedMbps, poe:{standard, type, enabled, state}}), interfaces.radios[] for APs ({wlanStandard, frequencyGHz, channelWidthMHz, channel}). NOTE: in the LIST endpoint, features/interfaces are capability-tag string arrays instead. Use for: switch port layout/PoE state, AP radio config, uplink topology. For live throughput/CPU/memory, use unifi_get_device_statistics.",
      inputSchema: {
        siteId: z.string().describe("Site ID"),
        deviceId: z.string().describe("Device ID"),
      },
      outputSchema: getDeviceOutputSchema,
      annotations: READ_ONLY,
    },
    async ({ siteId, deviceId }) => {
      try {
        const data = await client.get(`/sites/${siteId}/devices/${deviceId}`);
        return formatSuccess(data, { structured: true });
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.registerTool(
    "unifi_get_device_statistics",
    {
      description: "Get latest live statistics for a device. Returns: uptimeSec, lastHeartbeatAt, nextHeartbeatAt, loadAverage1/5/15Min, cpuUtilizationPct, memoryUtilizationPct, uplink (txRateBps, rxRateBps), interfaces.radios[] for APs ({frequencyGHz, txRetriesPct}). NOTE: verified against 10.5.43 — the Integration API does NOT expose per-switch-port byte/error/PoE-power counters here; port-level live stats are unavailable. Use for: device health and AP radio metrics. For config (channel, power, port assignment), use unifi_get_device.",
      inputSchema: {
        siteId: z.string().describe("Site ID"),
        deviceId: z.string().describe("Device ID"),
      },
      outputSchema: getDeviceStatisticsOutputSchema,
      annotations: READ_ONLY,
    },
    async ({ siteId, deviceId }) => {
      try {
        const data = await client.get(
          `/sites/${siteId}/devices/${deviceId}/statistics/latest`
        );
        return formatSuccess(data, { structured: true });
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.registerTool(
    "unifi_list_pending_devices",
    {
      description: "List devices pending adoption across all sites (global endpoint, not site-scoped). Returns: basic device info per pending device (macAddress, model, ipAddress, firmwareVersion, etc. — exact per-row schema is not rendered in the 10.5.43 docs). Use for: discovering new devices on the network before calling unifi_adopt_device.",
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
      outputSchema: listPendingDevicesOutputSchema,
      annotations: READ_ONLY,
    },
    async ({ offset, limit, filter }) => {
      try {
        const query = buildQuery({ offset, limit, filter });
        const data = await client.get(`/pending-devices${query}`);
        return formatSuccess(data, { structured: true });
      } catch (err) {
        return formatError(err);
      }
    }
  );

  if (readOnly) return;

  server.registerTool(
    "unifi_adopt_device",
    {
      description: "Adopt a pending device into a site by MAC address. The device must already appear in unifi_list_pending_devices. Idempotency: not safe to retry — re-adopting may error or duplicate.",
      inputSchema: {
        siteId: z.string().describe("Site ID"),
        macAddress: z.string().describe("MAC address of the device"),
        ignoreDeviceLimit: z.boolean().optional().describe("Ignore device limit when adopting (default: false)"),
        dryRun: z.boolean().optional().describe("Preview this action without executing it"),
      },
      outputSchema: adoptDeviceOutputSchema,
      annotations: WRITE_NOT_IDEMPOTENT,
    },
    async ({ siteId, macAddress, ignoreDeviceLimit, dryRun }) => {
      const body = {
        macAddress,
        ignoreDeviceLimit: ignoreDeviceLimit ?? false,
      };

      if (dryRun) return formatDryRun("POST", `/sites/${siteId}/devices`, body);

      try {
        const data = await client.post(`/sites/${siteId}/devices`, body);
        return formatSuccess(data, { structured: true });
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
      description: "Restart (reboot) a device. The device will be unreachable for ~1–3 minutes. Idempotent: repeated calls trigger fresh reboots.",
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
      description: "Power-cycle PoE on a specific switch port (briefly drops then restores power). portIdx is the port number (1-based) as shown in unifi_get_device interfaces.ports[].idx. Use for: rebooting a PoE-powered camera/AP without touching the device.",
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
