import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { NetworkClient } from "../client.js";
import { formatSuccess, formatError } from "../utils/responses.js";
import { buildQuery } from "../utils/query.js";
import {
  READ_ONLY,
  WRITE,
  WRITE_NOT_IDEMPOTENT,
  DESTRUCTIVE,
  formatDryRun,
  requireConfirmation,
} from "../utils/safety.js";

export function registerWifiTools(
  server: McpServer,
  client: NetworkClient,
  readOnly = false
) {
  server.tool(
    "unifi_list_wifi",
    "List all WiFi broadcasts (SSIDs) at a site",
    {
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
      filter: z
        .string()
        .optional()
        .describe("Filter expression"),
    },
    READ_ONLY,
    async ({ siteId, offset, limit, filter }) => {
      try {
        const query = buildQuery({ offset, limit, filter });
        const data = await client.get(`/sites/${siteId}/wifi${query}`);
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.tool(
    "unifi_get_wifi",
    "Get a specific WiFi network by ID",
    {
      siteId: z.string().describe("Site ID"),
      wifiBroadcastId: z.string().describe("WiFi Broadcast ID"),
    },
    READ_ONLY,
    async ({ siteId, wifiBroadcastId }) => {
      try {
        const data = await client.get(
          `/sites/${siteId}/wifi/${wifiBroadcastId}`
        );
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  if (readOnly) return;

  server.tool(
    "unifi_create_wifi",
    "Create a new WiFi network (SSID)",
    {
      siteId: z.string().describe("Site ID"),
      name: z.string().describe("SSID name"),
      enabled: z.boolean().describe("Enable the WiFi network"),
      type: z.enum(["STANDARD"]).describe("WiFi type"),
      broadcastingFrequenciesGHz: z
        .array(z.string())
        .describe("Frequencies: 2.4, 5, 6"),
      dryRun: z
        .boolean()
        .optional()
        .describe("Preview this action without executing it"),
    },
    WRITE_NOT_IDEMPOTENT,
    async ({
      siteId,
      name,
      enabled,
      type,
      broadcastingFrequenciesGHz,
      dryRun,
    }) => {
      try {
        const body = {
          name,
          enabled,
          type,
          broadcastingFrequenciesGHz: broadcastingFrequenciesGHz.map(Number),
        };
        if (dryRun) return formatDryRun("POST", `/sites/${siteId}/wifi`, body);
        const data = await client.post(`/sites/${siteId}/wifi`, body);
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.tool(
    "unifi_update_wifi",
    "Update an existing WiFi network",
    {
      siteId: z.string().describe("Site ID"),
      wifiBroadcastId: z.string().describe("WiFi Broadcast ID"),
      name: z.string().optional().describe("SSID name"),
      enabled: z.boolean().optional().describe("Enable the WiFi network"),
      dryRun: z
        .boolean()
        .optional()
        .describe("Preview this action without executing it"),
    },
    WRITE,
    async ({ siteId, wifiBroadcastId, name, enabled, dryRun }) => {
      try {
        const body: Record<string, unknown> = {};
        if (name !== undefined) body.name = name;
        if (enabled !== undefined) body.enabled = enabled;
        if (dryRun)
          return formatDryRun(
            "PUT",
            `/sites/${siteId}/wifi/${wifiBroadcastId}`,
            body
          );
        const data = await client.put(
          `/sites/${siteId}/wifi/${wifiBroadcastId}`,
          body
        );
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.tool(
    "unifi_delete_wifi",
    "DESTRUCTIVE: Delete a WiFi network — all clients on this SSID will be disconnected",
    {
      siteId: z.string().describe("Site ID"),
      wifiBroadcastId: z.string().describe("WiFi Broadcast ID"),
      force: z
        .boolean()
        .optional()
        .default(false)
        .describe("Force delete (default: false)"),
      confirm: z
        .boolean()
        .optional()
        .describe("Must be true to execute this destructive action"),
      dryRun: z
        .boolean()
        .optional()
        .describe("Preview this action without executing it"),
    },
    DESTRUCTIVE,
    async ({ siteId, wifiBroadcastId, force, confirm, dryRun }) => {
      const guard = requireConfirmation(confirm, "This will delete the WiFi network and disconnect all clients on this SSID");
      if (guard) return guard;

      try {
        let path = `/sites/${siteId}/wifi/${wifiBroadcastId}`;
        if (force) {
          path += "?force=true";
        }
        if (dryRun) return formatDryRun("DELETE", path);
        const data = await client.delete(path);
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );
}
