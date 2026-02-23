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

export function registerTrafficMatchingTools(
  server: McpServer,
  client: NetworkClient,
  readOnly = false
) {
  server.registerTool(
    "unifi_list_traffic_matching_lists",
    {
      description: "List all traffic matching lists at a site (port groups, IP groups)",
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
        filter: z
          .string()
          .optional()
          .describe("Filter expression"),
      },
      annotations: READ_ONLY,
    },
    async ({ siteId, offset, limit, filter }) => {
      try {
        const query = buildQuery({ offset, limit, filter });
        const data = await client.get(
          `/sites/${siteId}/traffic-matching-lists${query}`
        );
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.registerTool(
    "unifi_get_traffic_matching_list",
    {
      description: "Get a specific traffic matching list by ID",
      inputSchema: {
        siteId: z.string().describe("Site ID"),
        trafficMatchingListId: z.string().describe("Traffic matching list ID"),
      },
      annotations: READ_ONLY,
    },
    async ({ siteId, trafficMatchingListId }) => {
      try {
        const data = await client.get(
          `/sites/${siteId}/traffic-matching-lists/${trafficMatchingListId}`
        );
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  if (readOnly) return;

  server.registerTool(
    "unifi_create_traffic_matching_list",
    {
      description: "Create a new traffic matching list",
      inputSchema: {
        siteId: z.string().describe("Site ID"),
        type: z
          .enum(["PORTS", "IPV4_ADDRESSES", "IPV6_ADDRESSES"])
          .describe("List type"),
        name: z.string().describe("List name"),
        items: z
          .array(z.unknown())
          .describe("List items (ports or IP addresses)"),
        dryRun: z
          .boolean()
          .optional()
          .describe("Preview this action without executing it"),
      },
      annotations: WRITE_NOT_IDEMPOTENT,
    },
    async ({ siteId, type, name, items, dryRun }) => {
      try {
        const body = { type, name, items };
        if (dryRun) return formatDryRun("POST", `/sites/${siteId}/traffic-matching-lists`, body);
        const data = await client.post(
          `/sites/${siteId}/traffic-matching-lists`,
          body
        );
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.registerTool(
    "unifi_update_traffic_matching_list",
    {
      description: "Update a traffic matching list",
      inputSchema: {
        siteId: z.string().describe("Site ID"),
        trafficMatchingListId: z.string().describe("Traffic matching list ID"),
        type: z
          .enum(["PORTS", "IPV4_ADDRESSES", "IPV6_ADDRESSES"])
          .describe("List type"),
        name: z.string().describe("List name"),
        items: z.array(z.unknown()).describe("List items"),
        dryRun: z
          .boolean()
          .optional()
          .describe("Preview this action without executing it"),
      },
      annotations: WRITE,
    },
    async ({ siteId, trafficMatchingListId, type, name, items, dryRun }) => {
      try {
        const body = { type, name, items };
        if (dryRun) return formatDryRun("PUT", `/sites/${siteId}/traffic-matching-lists/${trafficMatchingListId}`, body);
        const data = await client.put(
          `/sites/${siteId}/traffic-matching-lists/${trafficMatchingListId}`,
          body
        );
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.registerTool(
    "unifi_delete_traffic_matching_list",
    {
      description: "DESTRUCTIVE: Delete a traffic matching list",
      inputSchema: {
        siteId: z.string().describe("Site ID"),
        trafficMatchingListId: z.string().describe("Traffic matching list ID"),
        confirm: z
          .boolean()
          .optional()
          .describe("Must be true to execute this destructive action"),
        dryRun: z
          .boolean()
          .optional()
          .describe("Preview this action without executing it"),
      },
      annotations: DESTRUCTIVE,
    },
    async ({ siteId, trafficMatchingListId, confirm, dryRun }) => {
      const guard = requireConfirmation(confirm, "This will delete the traffic matching list");
      if (guard) return guard;

      try {
        if (dryRun) return formatDryRun("DELETE", `/sites/${siteId}/traffic-matching-lists/${trafficMatchingListId}`, {});
        const data = await client.delete(
          `/sites/${siteId}/traffic-matching-lists/${trafficMatchingListId}`
        );
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );
}
