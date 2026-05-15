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
import {
  listFirewallZonesOutputSchema,
  firewallZoneOutputSchema,
  listFirewallPoliciesOutputSchema,
  firewallPolicyOutputSchema,
  firewallPolicyOrderingOutputSchema,
} from "../utils/output-schemas.js";

export function registerFirewallTools(
  server: McpServer,
  client: NetworkClient,
  readOnly = false
) {
  server.registerTool(
    "unifi_list_firewall_zones",
    {
      description: "List firewall zones (groupings of networks for zone-based firewalling) at a site. Returns: id, name, networkIds[], metadata.origin (indicates system-defined vs user-defined). Use for: zone inventory; pair with unifi_list_firewall_policies to see rules between zones.",
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
      outputSchema: listFirewallZonesOutputSchema,
      annotations: READ_ONLY,
    },
    async ({ siteId, offset, limit, filter }) => {
      try {
        const query = buildQuery({ offset, limit, filter });
        const data = await client.get(`/sites/${siteId}/firewall/zones${query}`);
        return formatSuccess(data, { structured: true });
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.registerTool(
    "unifi_get_firewall_zone",
    {
      description: "Get a firewall zone by ID (same fields as the list entry).",
      inputSchema: {
        siteId: z.string().describe("Site ID"),
        firewallZoneId: z.string().describe("Firewall zone ID"),
      },
      outputSchema: firewallZoneOutputSchema,
      annotations: READ_ONLY,
    },
    async ({ siteId, firewallZoneId }) => {
      try {
        const data = await client.get(
          `/sites/${siteId}/firewall/zones/${firewallZoneId}`
        );
        return formatSuccess(data, { structured: true });
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.registerTool(
    "unifi_list_firewall_policies",
    {
      description: "List firewall policies (zone-based rules) at a site. Returns: id, name, enabled, action (object with type field), source/destination (zone reference + trafficFilter), ipProtocolScope, connectionStateFilter, ipsecFilter, schedule, loggingEnabled, index, description, metadata.origin. Protocols/ports are encoded inside source/destination.trafficFilter, not as top-level fields. Evaluation order within a zone pair comes from unifi_get_firewall_policy_ordering.",
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
      outputSchema: listFirewallPoliciesOutputSchema,
      annotations: READ_ONLY,
    },
    async ({ siteId, offset, limit, filter }) => {
      try {
        const query = buildQuery({ offset, limit, filter });
        const data = await client.get(
          `/sites/${siteId}/firewall/policies${query}`
        );
        return formatSuccess(data, { structured: true });
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.registerTool(
    "unifi_get_firewall_policy",
    {
      description: "Get a firewall policy by ID with full match criteria and action.",
      inputSchema: {
        siteId: z.string().describe("Site ID"),
        firewallPolicyId: z.string().describe("Firewall policy ID"),
      },
      outputSchema: firewallPolicyOutputSchema,
      annotations: READ_ONLY,
    },
    async ({ siteId, firewallPolicyId }) => {
      try {
        const data = await client.get(
          `/sites/${siteId}/firewall/policies/${firewallPolicyId}`
        );
        return formatSuccess(data, { structured: true });
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.registerTool(
    "unifi_get_firewall_policy_ordering",
    {
      description: "Get the evaluation order of user-defined firewall policies for a specific (source zone, destination zone) pair. Returns: beforeSystemDefined[] and afterSystemDefined[] arrays of policy IDs. System-defined rules sit between these two arrays.",
      inputSchema: {
        siteId: z.string().describe("Site ID"),
        sourceFirewallZoneId: z
          .string()
          .describe("Source firewall zone ID"),
        destinationFirewallZoneId: z
          .string()
          .describe("Destination firewall zone ID"),
      },
      outputSchema: firewallPolicyOrderingOutputSchema,
      annotations: READ_ONLY,
    },
    async ({ siteId, sourceFirewallZoneId, destinationFirewallZoneId }) => {
      try {
        const query = `?sourceFirewallZoneId=${encodeURIComponent(sourceFirewallZoneId)}&destinationFirewallZoneId=${encodeURIComponent(destinationFirewallZoneId)}`;
        const data = await client.get(
          `/sites/${siteId}/firewall/policies/ordering${query}`
        );
        return formatSuccess(data, { structured: true });
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
      outputSchema: firewallZoneOutputSchema,
      annotations: WRITE_NOT_IDEMPOTENT,
    },
    async ({ siteId, name, networkIds, dryRun }) => {
      try {
        const body = { name, networkIds };
        if (dryRun) return formatDryRun("POST", `/sites/${siteId}/firewall/zones`, body);
        const data = await client.post(`/sites/${siteId}/firewall/zones`, body);
        return formatSuccess(data, { structured: true });
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
      outputSchema: firewallZoneOutputSchema,
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
        return formatSuccess(data, { structured: true });
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
      outputSchema: firewallPolicyOutputSchema,
      annotations: WRITE_NOT_IDEMPOTENT,
    },
    async ({ siteId, policy, dryRun }) => {
      try {
        if (dryRun) return formatDryRun("POST", `/sites/${siteId}/firewall/policies`, policy);
        const data = await client.post(`/sites/${siteId}/firewall/policies`, policy);
        return formatSuccess(data, { structured: true });
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
      outputSchema: firewallPolicyOutputSchema,
      annotations: WRITE,
    },
    async ({ siteId, firewallPolicyId, policy, dryRun }) => {
      try {
        if (dryRun) return formatDryRun("PUT", `/sites/${siteId}/firewall/policies/${firewallPolicyId}`, policy);
        const data = await client.put(
          `/sites/${siteId}/firewall/policies/${firewallPolicyId}`,
          policy
        );
        return formatSuccess(data, { structured: true });
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.registerTool(
    "unifi_patch_firewall_policy",
    {
      description: "Partially update a firewall policy without resending all fields. Common use: toggle loggingEnabled or enabled. Idempotent for fields supplied.",
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
      outputSchema: firewallPolicyOutputSchema,
      annotations: WRITE,
    },
    async ({ siteId, firewallPolicyId, policy, dryRun }) => {
      try {
        if (dryRun) return formatDryRun("PATCH", `/sites/${siteId}/firewall/policies/${firewallPolicyId}`, policy);
        const data = await client.patch(
          `/sites/${siteId}/firewall/policies/${firewallPolicyId}`,
          policy
        );
        return formatSuccess(data, { structured: true });
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
