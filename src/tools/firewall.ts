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

export function registerFirewallTools(
  server: McpServer,
  client: NetworkClient,
  readOnly = false
) {
  server.registerTool(
    "unifi_list_firewall_zones",
    {
      description: "List all firewall zones at a site",
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
        const data = await client.get(`/sites/${siteId}/firewall/zones${query}`);
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.registerTool(
    "unifi_get_firewall_zone",
    {
      description: "Get a specific firewall zone by ID",
      inputSchema: {
        siteId: z.string().describe("Site ID"),
        firewallZoneId: z.string().describe("Firewall zone ID"),
      },
      annotations: READ_ONLY,
    },
    async ({ siteId, firewallZoneId }) => {
      try {
        const data = await client.get(
          `/sites/${siteId}/firewall/zones/${firewallZoneId}`
        );
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.registerTool(
    "unifi_list_firewall_policies",
    {
      description: "List all firewall policies at a site",
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
          `/sites/${siteId}/firewall/policies${query}`
        );
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.registerTool(
    "unifi_get_firewall_policy",
    {
      description: "Get a specific firewall policy by ID",
      inputSchema: {
        siteId: z.string().describe("Site ID"),
        firewallPolicyId: z.string().describe("Firewall policy ID"),
      },
      annotations: READ_ONLY,
    },
    async ({ siteId, firewallPolicyId }) => {
      try {
        const data = await client.get(
          `/sites/${siteId}/firewall/policies/${firewallPolicyId}`
        );
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.registerTool(
    "unifi_get_firewall_policy_ordering",
    {
      description: "Get user-defined firewall policy ordering for a zone pair",
      inputSchema: {
        siteId: z.string().describe("Site ID"),
        sourceFirewallZoneId: z.string().describe("Source firewall zone ID"),
        destinationFirewallZoneId: z
          .string()
          .describe("Destination firewall zone ID"),
      },
      annotations: READ_ONLY,
    },
    async ({ siteId, sourceFirewallZoneId, destinationFirewallZoneId }) => {
      try {
        const query = `?sourceFirewallZoneId=${encodeURIComponent(sourceFirewallZoneId)}&destinationFirewallZoneId=${encodeURIComponent(destinationFirewallZoneId)}`;
        const data = await client.get(
          `/sites/${siteId}/firewall/policies/ordering${query}`
        );
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  if (readOnly) return;

  server.registerTool(
    "unifi_create_firewall_zone",
    {
      description: "Create a new custom firewall zone",
      inputSchema: {
        siteId: z.string().describe("Site ID"),
        name: z.string().describe("Zone name"),
        networkIds: z
          .array(z.string())
          .describe("Network IDs to include in this zone"),
        dryRun: z
          .boolean()
          .optional()
          .describe("Preview this action without executing it"),
      },
      annotations: WRITE_NOT_IDEMPOTENT,
    },
    async ({ siteId, name, networkIds, dryRun }) => {
      try {
        const body = { name, networkIds };
        if (dryRun) return formatDryRun("POST", `/sites/${siteId}/firewall/zones`, body);
        const data = await client.post(`/sites/${siteId}/firewall/zones`, body);
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.registerTool(
    "unifi_update_firewall_zone",
    {
      description: "Update a firewall zone",
      inputSchema: {
        siteId: z.string().describe("Site ID"),
        firewallZoneId: z.string().describe("Firewall zone ID"),
        name: z.string().describe("Zone name"),
        networkIds: z
          .array(z.string())
          .describe("Network IDs to include in this zone"),
        dryRun: z
          .boolean()
          .optional()
          .describe("Preview this action without executing it"),
      },
      annotations: WRITE,
    },
    async ({ siteId, firewallZoneId, name, networkIds, dryRun }) => {
      try {
        const body = { name, networkIds };
        if (dryRun) return formatDryRun("PUT", `/sites/${siteId}/firewall/zones/${firewallZoneId}`, body);
        const data = await client.put(
          `/sites/${siteId}/firewall/zones/${firewallZoneId}`,
          body
        );
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.registerTool(
    "unifi_delete_firewall_zone",
    {
      description: "DESTRUCTIVE: Delete a custom firewall zone",
      inputSchema: {
        siteId: z.string().describe("Site ID"),
        firewallZoneId: z.string().describe("Firewall zone ID"),
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
    async ({ siteId, firewallZoneId, confirm, dryRun }) => {
      const guard = requireConfirmation(confirm, "This will delete the firewall zone");
      if (guard) return guard;

      try {
        if (dryRun) return formatDryRun("DELETE", `/sites/${siteId}/firewall/zones/${firewallZoneId}`, {});
        const data = await client.delete(
          `/sites/${siteId}/firewall/zones/${firewallZoneId}`
        );
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.registerTool(
    "unifi_create_firewall_policy",
    {
      description: "Create a new firewall policy",
      inputSchema: {
        siteId: z.string().describe("Site ID"),
        policy: z
          .record(z.string(), z.unknown())
          .describe("Firewall policy configuration (JSON object)"),
        dryRun: z
          .boolean()
          .optional()
          .describe("Preview this action without executing it"),
      },
      annotations: WRITE_NOT_IDEMPOTENT,
    },
    async ({ siteId, policy, dryRun }) => {
      try {
        if (dryRun) return formatDryRun("POST", `/sites/${siteId}/firewall/policies`, policy);
        const data = await client.post(`/sites/${siteId}/firewall/policies`, policy);
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.registerTool(
    "unifi_update_firewall_policy",
    {
      description: "Update a firewall policy",
      inputSchema: {
        siteId: z.string().describe("Site ID"),
        firewallPolicyId: z.string().describe("Firewall policy ID"),
        policy: z
          .record(z.string(), z.unknown())
          .describe("Firewall policy configuration (JSON object)"),
        dryRun: z
          .boolean()
          .optional()
          .describe("Preview this action without executing it"),
      },
      annotations: WRITE,
    },
    async ({ siteId, firewallPolicyId, policy, dryRun }) => {
      try {
        if (dryRun) return formatDryRun("PUT", `/sites/${siteId}/firewall/policies/${firewallPolicyId}`, policy);
        const data = await client.put(
          `/sites/${siteId}/firewall/policies/${firewallPolicyId}`,
          policy
        );
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.registerTool(
    "unifi_patch_firewall_policy",
    {
      description: "Partially update a firewall policy (e.g. toggle logging)",
      inputSchema: {
        siteId: z.string().describe("Site ID"),
        firewallPolicyId: z.string().describe("Firewall policy ID"),
        policy: z
          .record(z.string(), z.unknown())
          .describe("Partial firewall policy fields to update (e.g. { loggingEnabled: true })"),
        dryRun: z
          .boolean()
          .optional()
          .describe("Preview this action without executing it"),
      },
      annotations: WRITE,
    },
    async ({ siteId, firewallPolicyId, policy, dryRun }) => {
      try {
        if (dryRun) return formatDryRun("PATCH", `/sites/${siteId}/firewall/policies/${firewallPolicyId}`, policy);
        const data = await client.patch(
          `/sites/${siteId}/firewall/policies/${firewallPolicyId}`,
          policy
        );
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.registerTool(
    "unifi_delete_firewall_policy",
    {
      description: "DESTRUCTIVE: Delete a firewall policy",
      inputSchema: {
        siteId: z.string().describe("Site ID"),
        firewallPolicyId: z.string().describe("Firewall policy ID"),
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
    async ({ siteId, firewallPolicyId, confirm, dryRun }) => {
      const guard = requireConfirmation(confirm, "This will delete the firewall policy");
      if (guard) return guard;

      try {
        if (dryRun) return formatDryRun("DELETE", `/sites/${siteId}/firewall/policies/${firewallPolicyId}`, {});
        const data = await client.delete(
          `/sites/${siteId}/firewall/policies/${firewallPolicyId}`
        );
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.registerTool(
    "unifi_reorder_firewall_policies",
    {
      description: "Reorder user-defined firewall policies for a zone pair",
      inputSchema: {
        siteId: z.string().describe("Site ID"),
        sourceFirewallZoneId: z.string().describe("Source firewall zone ID"),
        destinationFirewallZoneId: z
          .string()
          .describe("Destination firewall zone ID"),
        orderedFirewallPolicyIds: z
          .record(z.string(), z.unknown())
          .describe(
            "Ordered policy IDs object with beforeSystemDefined and afterSystemDefined arrays"
          ),
        dryRun: z
          .boolean()
          .optional()
          .describe("Preview this action without executing it"),
      },
      annotations: WRITE,
    },
    async ({
      siteId,
      sourceFirewallZoneId,
      destinationFirewallZoneId,
      orderedFirewallPolicyIds,
      dryRun,
    }) => {
      try {
        const query = `?sourceFirewallZoneId=${encodeURIComponent(sourceFirewallZoneId)}&destinationFirewallZoneId=${encodeURIComponent(destinationFirewallZoneId)}`;
        const body = { orderedFirewallPolicyIds };
        if (dryRun) return formatDryRun("PUT", `/sites/${siteId}/firewall/policies/ordering${query}`, body);
        const data = await client.put(
          `/sites/${siteId}/firewall/policies/ordering${query}`,
          body
        );
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );
}
