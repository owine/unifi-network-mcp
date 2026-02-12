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

export function registerAclTools(
  server: McpServer,
  client: NetworkClient,
  readOnly = false
) {
  server.tool(
    "unifi_list_acl_rules",
    "List all ACL (firewall) rules at a site",
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
        const data = await client.get(`/sites/${siteId}/acl-rules${query}`);
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.tool(
    "unifi_get_acl_rule",
    "Get a specific ACL rule by ID",
    {
      siteId: z.string().describe("Site ID"),
      aclRuleId: z.string().describe("ACL rule ID"),
    },
    READ_ONLY,
    async ({ siteId, aclRuleId }) => {
      try {
        const data = await client.get(
          `/sites/${siteId}/acl-rules/${aclRuleId}`
        );
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.tool(
    "unifi_get_acl_rule_ordering",
    "Get user-defined ACL rule ordering",
    {
      siteId: z.string().describe("Site ID"),
    },
    READ_ONLY,
    async ({ siteId }) => {
      try {
        const data = await client.get(`/sites/${siteId}/acl-rules/ordering`);
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  if (readOnly) return;

  server.tool(
    "unifi_create_acl_rule",
    "Create a new ACL (firewall) rule",
    {
      siteId: z.string().describe("Site ID"),
      type: z.enum(["IPV4", "MAC"]).describe("Rule type"),
      name: z.string().describe("Rule name"),
      enabled: z.boolean().describe("Enable the rule"),
      action: z.enum(["ALLOW", "BLOCK"]).describe("Rule action"),
      description: z
        .string()
        .optional()
        .describe("Rule description"),
      protocolFilter: z
        .array(z.string())
        .optional()
        .describe("Protocols: TCP, UDP"),
      dryRun: z
        .boolean()
        .optional()
        .describe("Preview this action without executing it"),
    },
    WRITE_NOT_IDEMPOTENT,
    async ({ siteId, type, name, enabled, action, description, protocolFilter, dryRun }) => {
      try {
        const body: Record<string, unknown> = { type, name, enabled, action };
        if (description !== undefined) body.description = description;
        if (protocolFilter !== undefined) body.protocolFilter = protocolFilter;
        if (dryRun) return formatDryRun("POST", `/sites/${siteId}/acl-rules`, body);
        const data = await client.post(`/sites/${siteId}/acl-rules`, body);
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.tool(
    "unifi_update_acl_rule",
    "Update an ACL rule",
    {
      siteId: z.string().describe("Site ID"),
      aclRuleId: z.string().describe("ACL rule ID"),
      rule: z
        .record(z.string(), z.unknown())
        .describe("ACL rule configuration (JSON object)"),
      dryRun: z
        .boolean()
        .optional()
        .describe("Preview this action without executing it"),
    },
    WRITE,
    async ({ siteId, aclRuleId, rule, dryRun }) => {
      try {
        if (dryRun) return formatDryRun("PUT", `/sites/${siteId}/acl-rules/${aclRuleId}`, rule);
        const data = await client.put(
          `/sites/${siteId}/acl-rules/${aclRuleId}`,
          rule
        );
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.tool(
    "unifi_delete_acl_rule",
    "DESTRUCTIVE: Delete an ACL rule",
    {
      siteId: z.string().describe("Site ID"),
      aclRuleId: z.string().describe("ACL rule ID"),
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
    async ({ siteId, aclRuleId, confirm, dryRun }) => {
      const guard = requireConfirmation(confirm, "This will delete the ACL rule");
      if (guard) return guard;

      try {
        if (dryRun) return formatDryRun("DELETE", `/sites/${siteId}/acl-rules/${aclRuleId}`, {});
        const data = await client.delete(
          `/sites/${siteId}/acl-rules/${aclRuleId}`
        );
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.tool(
    "unifi_reorder_acl_rules",
    "Reorder user-defined ACL rules",
    {
      siteId: z.string().describe("Site ID"),
      orderedAclRuleIds: z
        .array(z.string())
        .describe("Ordered ACL rule IDs"),
      dryRun: z
        .boolean()
        .optional()
        .describe("Preview this action without executing it"),
    },
    WRITE,
    async ({ siteId, orderedAclRuleIds, dryRun }) => {
      try {
        const body = { orderedAclRuleIds };
        if (dryRun) return formatDryRun("PUT", `/sites/${siteId}/acl-rules/ordering`, body);
        const data = await client.put(
          `/sites/${siteId}/acl-rules/ordering`,
          body
        );
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );
}
