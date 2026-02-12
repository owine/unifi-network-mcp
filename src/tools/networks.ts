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

export function registerNetworkTools(
  server: McpServer,
  client: NetworkClient,
  readOnly = false
) {
  server.tool(
    "unifi_list_networks",
    "List all networks at a site",
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
        const data = await client.get(`/sites/${siteId}/networks${query}`);
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.tool(
    "unifi_get_network",
    "Get a specific network by ID",
    {
      siteId: z.string().describe("Site ID"),
      networkId: z.string().describe("Network ID"),
    },
    READ_ONLY,
    async ({ siteId, networkId }) => {
      try {
        const data = await client.get(`/sites/${siteId}/networks/${networkId}`);
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.tool(
    "unifi_get_network_references",
    "Get references to a network (what WiFi broadcasts, firewall zones, etc. use this network)",
    {
      siteId: z.string().describe("Site ID"),
      networkId: z.string().describe("Network ID"),
    },
    READ_ONLY,
    async ({ siteId, networkId }) => {
      try {
        const data = await client.get(
          `/sites/${siteId}/networks/${networkId}/references`
        );
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  if (readOnly) return;

  server.tool(
    "unifi_create_network",
    "Create a new network",
    {
      siteId: z.string().describe("Site ID"),
      name: z.string().describe("Network name"),
      management: z
        .enum(["UNMANAGED", "GATEWAY", "SWITCH"])
        .describe("Network management type"),
      enabled: z.boolean().describe("Enable the network"),
      vlanId: z
        .number()
        .int()
        .min(1)
        .max(4009)
        .describe("VLAN ID (1 for default, 2+ for additional)"),
      dryRun: z
        .boolean()
        .optional()
        .describe("Preview this action without executing it"),
    },
    WRITE_NOT_IDEMPOTENT,
    async ({ siteId, name, management, enabled, vlanId, dryRun }) => {
      try {
        const body = { name, management, enabled, vlanId };
        if (dryRun) return formatDryRun("POST", `/sites/${siteId}/networks`, body);
        const data = await client.post(`/sites/${siteId}/networks`, body);
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.tool(
    "unifi_update_network",
    "Update an existing network",
    {
      siteId: z.string().describe("Site ID"),
      networkId: z.string().describe("Network ID"),
      name: z.string().describe("Network name"),
      management: z
        .enum(["UNMANAGED", "GATEWAY", "SWITCH"])
        .describe("Network management type"),
      enabled: z.boolean().describe("Enable the network"),
      vlanId: z
        .number()
        .int()
        .min(1)
        .max(4009)
        .describe("VLAN ID (1-4009)"),
      dryRun: z
        .boolean()
        .optional()
        .describe("Preview this action without executing it"),
    },
    WRITE,
    async ({ siteId, networkId, name, management, enabled, vlanId, dryRun }) => {
      try {
        const body = { name, management, enabled, vlanId };
        if (dryRun)
          return formatDryRun(
            "PUT",
            `/sites/${siteId}/networks/${networkId}`,
            body
          );
        const data = await client.put(
          `/sites/${siteId}/networks/${networkId}`,
          body
        );
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.tool(
    "unifi_delete_network",
    "DESTRUCTIVE: Delete a network — all clients on this network will be disconnected",
    {
      siteId: z.string().describe("Site ID"),
      networkId: z.string().describe("Network ID"),
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
    async ({ siteId, networkId, force, confirm, dryRun }) => {
      const guard = requireConfirmation(confirm, "This will delete the network and disconnect all clients on it");
      if (guard) return guard;

      try {
        let path = `/sites/${siteId}/networks/${networkId}`;
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
