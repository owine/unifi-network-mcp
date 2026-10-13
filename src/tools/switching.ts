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
import { resourceId } from "../utils/params.js";

export function registerSwitchingTools(
  server: McpServer,
  client: NetworkClient
) {
  server.registerTool(
    "unifi_list_switch_stacks",
    {
      description: "List Switch Stacks (multiple physical switches managed as one logical unit) at a site. Returns: id, deviceId (the stack's primary device), name, units[] (the stacked switches — named `members` on consoles older than 10.6.106), lags[] (LAGs spanning the stack), metadata.origin. Per-unit schema is not rendered in the 11.0.83 docs — call unifi_get_switch_stack to inspect. Use for: identifying stacked switches; individual member configs/stats still come from unifi_get_device.",
      inputSchema: {
        siteId: resourceId().describe("Site ID"),
        offset: z
          .number()
          .int()
          .nonnegative()
          .optional()
          .describe("Number of records to skip (default: 0)"),
        limit: z
          .number()
          .int()
          .min(0)
          .max(200)
          .optional()
          .describe("Number of records to return (default: 25, max: 200)"),
        filter: z
          .string()
          .optional()
          .describe("Filter expression, e.g. name.like('Core*') or metadata.origin.eq('USER_DEFINED'). Device filters (members.deviceId, units.deviceId) are rejected on 11.0.83"),
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
      description: "Get full details of a Switch Stack including all units and stacking topology. Returns the same fields as the list response but for a single stack: id, deviceId, name, units[] (named `members` before 10.6.106), lags[], metadata.origin.",
      inputSchema: {
        siteId: resourceId().describe("Site ID"),
        switchStackId: resourceId().describe("Switch Stack ID"),
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
      description: "List MC-LAG (Multi-Chassis Link Aggregation) Domains — pairs of switches presenting as one for LAG redundancy. Returns: id, name, peers[] (per the older 10.4.57 spec: {deviceId, linkPortIdxs[], role TOP|BOTTOM}; not live-verified), lags[] (LAGs spanning the domain), metadata.origin.",
      inputSchema: {
        siteId: resourceId().describe("Site ID"),
        offset: z
          .number()
          .int()
          .nonnegative()
          .optional()
          .describe("Number of records to skip (default: 0)"),
        limit: z
          .number()
          .int()
          .min(0)
          .max(200)
          .optional()
          .describe("Number of records to return (default: 25, max: 200)"),
        filter: z
          .string()
          .optional()
          .describe("Filter expression, e.g. peers.deviceId.contains('<deviceId>')"),
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
        siteId: resourceId().describe("Site ID"),
        mcLagDomainId: resourceId().describe("MC-LAG Domain ID"),
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
      description: "List LAGs (Link Aggregation Groups — bonded switch ports) at a site. Returns: id, type (LOCAL/SWITCH_STACK/MULTI_CHASSIS), members[] ({deviceId, portIdxs[]}), switchStackId (SWITCH_STACK) or mcLagDomainId (MULTI_CHASSIS), metadata.origin.",
      inputSchema: {
        siteId: resourceId().describe("Site ID"),
        offset: z
          .number()
          .int()
          .nonnegative()
          .optional()
          .describe("Number of records to skip (default: 0)"),
        limit: z
          .number()
          .int()
          .min(0)
          .max(200)
          .optional()
          .describe("Number of records to return (default: 25, max: 200)"),
        filter: z
          .string()
          .optional()
          .describe("Filter expression, e.g. type.eq('LOCAL'), members.deviceId.contains('<deviceId>'), switchStackId.isNull()"),
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
        siteId: resourceId().describe("Site ID"),
        lagId: resourceId().describe("LAG ID"),
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
