import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { NetworkClient } from "../client.js";
import { formatSuccess, formatError } from "../utils/responses.js";
import { buildQuery } from "../utils/query.js";
import { READ_ONLY } from "../utils/safety.js";

export function registerSwitchingTools(
  server: McpServer,
  client: NetworkClient
) {
  server.registerTool(
    "unifi_list_switch_stacks",
    {
      description: "List all Switch Stacks at a site",
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
          `/sites/${siteId}/switching/switch-stacks${query}`
        );
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.registerTool(
    "unifi_get_switch_stack",
    {
      description: "Get details of a specific Switch Stack",
      inputSchema: {
        siteId: z.string().describe("Site ID"),
        switchStackId: z.string().describe("Switch Stack ID"),
      },
      annotations: READ_ONLY,
    },
    async ({ siteId, switchStackId }) => {
      try {
        const data = await client.get(
          `/sites/${siteId}/switching/switch-stacks/${switchStackId}`
        );
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.registerTool(
    "unifi_list_mc_lag_domains",
    {
      description: "List all MC-LAG (Multi-Chassis LAG) Domains at a site",
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
          `/sites/${siteId}/switching/mc-lag-domains${query}`
        );
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.registerTool(
    "unifi_get_mc_lag_domain",
    {
      description: "Get details of a specific MC-LAG (Multi-Chassis LAG) Domain",
      inputSchema: {
        siteId: z.string().describe("Site ID"),
        mcLagDomainId: z.string().describe("MC-LAG Domain ID"),
      },
      annotations: READ_ONLY,
    },
    async ({ siteId, mcLagDomainId }) => {
      try {
        const data = await client.get(
          `/sites/${siteId}/switching/mc-lag-domains/${mcLagDomainId}`
        );
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.registerTool(
    "unifi_list_lags",
    {
      description: "List all LAGs (Link Aggregation Groups) at a site",
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
          `/sites/${siteId}/switching/lags${query}`
        );
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.registerTool(
    "unifi_get_lag",
    {
      description: "Get details of a specific LAG (Link Aggregation Group)",
      inputSchema: {
        siteId: z.string().describe("Site ID"),
        lagId: z.string().describe("LAG ID"),
      },
      annotations: READ_ONLY,
    },
    async ({ siteId, lagId }) => {
      try {
        const data = await client.get(
          `/sites/${siteId}/switching/lags/${lagId}`
        );
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );
}
