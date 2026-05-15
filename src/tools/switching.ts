import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { NetworkClient } from "../client.js";
import { formatSuccess, formatError } from "../utils/responses.js";
import { buildQuery } from "../utils/query.js";
import { READ_ONLY } from "../utils/safety.js";
import {
  listSwitchStacksOutputSchema,
  switchStackOutputSchema,
  listMcLagDomainsOutputSchema,
  mcLagDomainOutputSchema,
  listLagsOutputSchema,
  lagOutputSchema,
} from "../utils/output-schemas.js";

export function registerSwitchingTools(
  server: McpServer,
  client: NetworkClient
) {
  server.registerTool(
    "unifi_list_switch_stacks",
    {
      description: "List Switch Stacks (multiple physical switches managed as one logical unit) at a site. Returns: id, name, members[], lags[] (LAGs spanning the stack), metadata.origin. Use for: identifying stacked switches; individual member configs/stats still come from unifi_get_device.",
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
      outputSchema: listSwitchStacksOutputSchema,
      annotations: READ_ONLY,
    },
    async ({ siteId, offset, limit, filter }) => {
      try {
        const query = buildQuery({ offset, limit, filter });
        const data = await client.get(
          `/sites/${siteId}/switching/switch-stacks${query}`
        );
        return formatSuccess(data, { structured: true });
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.registerTool(
    "unifi_get_switch_stack",
    {
      description: "Get full details of a Switch Stack including all members and stacking topology. Returns the same fields as the list response but for a single stack.",
      inputSchema: {
        siteId: z.string().describe("Site ID"),
        switchStackId: z.string().describe("Switch Stack ID"),
      },
      outputSchema: switchStackOutputSchema,
      annotations: READ_ONLY,
    },
    async ({ siteId, switchStackId }) => {
      try {
        const data = await client.get(
          `/sites/${siteId}/switching/switch-stacks/${switchStackId}`
        );
        return formatSuccess(data, { structured: true });
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.registerTool(
    "unifi_list_mc_lag_domains",
    {
      description: "List MC-LAG (Multi-Chassis Link Aggregation) Domains — pairs of switches presenting as one for LAG redundancy. Returns: id, name, peers[], lags[] (LAGs spanning the domain), metadata.origin.",
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
      outputSchema: listMcLagDomainsOutputSchema,
      annotations: READ_ONLY,
    },
    async ({ siteId, offset, limit, filter }) => {
      try {
        const query = buildQuery({ offset, limit, filter });
        const data = await client.get(
          `/sites/${siteId}/switching/mc-lag-domains${query}`
        );
        return formatSuccess(data, { structured: true });
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.registerTool(
    "unifi_get_mc_lag_domain",
    {
      description: "Get full details of an MC-LAG Domain (peer switches and member LAGs).",
      inputSchema: {
        siteId: z.string().describe("Site ID"),
        mcLagDomainId: z.string().describe("MC-LAG Domain ID"),
      },
      outputSchema: mcLagDomainOutputSchema,
      annotations: READ_ONLY,
    },
    async ({ siteId, mcLagDomainId }) => {
      try {
        const data = await client.get(
          `/sites/${siteId}/switching/mc-lag-domains/${mcLagDomainId}`
        );
        return formatSuccess(data, { structured: true });
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.registerTool(
    "unifi_list_lags",
    {
      description: "List LAGs (Link Aggregation Groups — bonded switch ports) at a site. Returns: id, type (LOCAL/SWITCH_STACK/MULTI_CHASSIS), members[], metadata.origin.",
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
      outputSchema: listLagsOutputSchema,
      annotations: READ_ONLY,
    },
    async ({ siteId, offset, limit, filter }) => {
      try {
        const query = buildQuery({ offset, limit, filter });
        const data = await client.get(
          `/sites/${siteId}/switching/lags${query}`
        );
        return formatSuccess(data, { structured: true });
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.registerTool(
    "unifi_get_lag",
    {
      description: "Get full details of a LAG including its type (LOCAL/SWITCH_STACK/MULTI_CHASSIS) and member ports.",
      inputSchema: {
        siteId: z.string().describe("Site ID"),
        lagId: z.string().describe("LAG ID"),
      },
      outputSchema: lagOutputSchema,
      annotations: READ_ONLY,
    },
    async ({ siteId, lagId }) => {
      try {
        const data = await client.get(
          `/sites/${siteId}/switching/lags/${lagId}`
        );
        return formatSuccess(data, { structured: true });
      } catch (err) {
        return formatError(err);
      }
    }
  );
}
