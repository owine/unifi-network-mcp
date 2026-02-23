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

export function registerDnsPolicyTools(
  server: McpServer,
  client: NetworkClient,
  readOnly = false
) {
  server.registerTool(
    "unifi_list_dns_policies",
    {
      description: "List all DNS policies at a site",
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
        const data = await client.get(`/sites/${siteId}/dns/policies${query}`);
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.registerTool(
    "unifi_get_dns_policy",
    {
      description: "Get a specific DNS policy by ID",
      inputSchema: {
        siteId: z.string().describe("Site ID"),
        dnsPolicyId: z.string().describe("DNS policy ID"),
      },
      annotations: READ_ONLY,
    },
    async ({ siteId, dnsPolicyId }) => {
      try {
        const data = await client.get(
          `/sites/${siteId}/dns/policies/${dnsPolicyId}`
        );
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  if (readOnly) return;

  server.registerTool(
    "unifi_create_dns_policy",
    {
      description: "Create a new DNS policy",
      inputSchema: {
        siteId: z.string().describe("Site ID"),
        policy: z
          .record(z.string(), z.unknown())
          .describe("DNS policy configuration (JSON object)"),
        dryRun: z
          .boolean()
          .optional()
          .describe("Preview this action without executing it"),
      },
      annotations: WRITE_NOT_IDEMPOTENT,
    },
    async ({ siteId, policy, dryRun }) => {
      try {
        if (dryRun) return formatDryRun("POST", `/sites/${siteId}/dns/policies`, policy);
        const data = await client.post(`/sites/${siteId}/dns/policies`, policy);
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.registerTool(
    "unifi_update_dns_policy",
    {
      description: "Update a DNS policy",
      inputSchema: {
        siteId: z.string().describe("Site ID"),
        dnsPolicyId: z.string().describe("DNS policy ID"),
        policy: z
          .record(z.string(), z.unknown())
          .describe("DNS policy configuration (JSON object)"),
        dryRun: z
          .boolean()
          .optional()
          .describe("Preview this action without executing it"),
      },
      annotations: WRITE,
    },
    async ({ siteId, dnsPolicyId, policy, dryRun }) => {
      try {
        if (dryRun) return formatDryRun("PUT", `/sites/${siteId}/dns/policies/${dnsPolicyId}`, policy);
        const data = await client.put(
          `/sites/${siteId}/dns/policies/${dnsPolicyId}`,
          policy
        );
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.registerTool(
    "unifi_delete_dns_policy",
    {
      description: "DESTRUCTIVE: Delete a DNS policy",
      inputSchema: {
        siteId: z.string().describe("Site ID"),
        dnsPolicyId: z.string().describe("DNS policy ID"),
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
    async ({ siteId, dnsPolicyId, confirm, dryRun }) => {
      const guard = requireConfirmation(confirm, "This will delete the DNS policy");
      if (guard) return guard;

      try {
        if (dryRun) return formatDryRun("DELETE", `/sites/${siteId}/dns/policies/${dnsPolicyId}`, {});
        const data = await client.delete(
          `/sites/${siteId}/dns/policies/${dnsPolicyId}`
        );
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );
}
