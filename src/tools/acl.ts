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
  listAclRulesOutputSchema,
  aclRuleOutputSchema,
  aclRuleOrderingOutputSchema,
  writeResult,
} from "../utils/output-schemas.js";
import { resourceId } from "../utils/params.js";
import { asObject, definedEntries, mergeForPut, missingFields, withResourceLock } from "../utils/full-put.js";

// PUT body fields per the 11.0.83 docs. index is deprecated (and read-only in
// practice), so it stays out of the body even though GET returns it.
const ACL_RULE_FIELDS = [
  "type", "enabled", "name", "description", "action",
  "enforcingDeviceFilter", "sourceFilter", "destinationFilter", "protocolFilter",
] as const;
const ACL_RULE_REQUIRED = ["type", "enabled", "name", "action"] as const;

export function registerAclTools(
  server: McpServer,
  client: NetworkClient,
  readOnly = false
) {
  server.registerTool(
    "unifi_list_acl_rules",
    {
      description: "List ACL rules (switch/AP-level access control lists, distinct from zone-based firewall policies) at a site. Returns: id, type (IPV4/MAC), name, enabled, action (ALLOW/BLOCK), description, protocolFilter, sourceFilter/destinationFilter matchers, enforcingDeviceFilter (which devices apply the rule), index (evaluation order — read-only; change it with unifi_reorder_acl_rules), metadata.origin. ACLs apply earlier in the path than firewall policies.",
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
          .describe("Filter expression"),
      },
      outputSchema: listAclRulesOutputSchema,
      annotations: READ_ONLY,
    },
    async ({ siteId, offset, limit, filter }) => {
      try {
        const query = buildQuery({ offset, limit, filter });
        const data = await client.get(`/sites/${siteId}/acl-rules${query}`);
        return formatSuccess(data, { structured: true });
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.registerTool(
    "unifi_get_acl_rule",
    {
      description: "Get a specific ACL rule by ID (full match criteria and action).",
      inputSchema: {
        siteId: resourceId().describe("Site ID"),
        aclRuleId: resourceId().describe("ACL rule ID"),
      },
      outputSchema: aclRuleOutputSchema,
      annotations: READ_ONLY,
    },
    async ({ siteId, aclRuleId }) => {
      try {
        const data = await client.get(
          `/sites/${siteId}/acl-rules/${aclRuleId}`
        );
        return formatSuccess(data, { structured: true });
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.registerTool(
    "unifi_get_acl_rule_ordering",
    {
      description: "Get the evaluation order of user-defined ACL rules. Returns: orderedAclRuleIds[] — rules are evaluated in list order.",
      inputSchema: {
        siteId: resourceId().describe("Site ID"),
      },
      outputSchema: aclRuleOrderingOutputSchema,
      annotations: READ_ONLY,
    },
    async ({ siteId }) => {
      try {
        const data = await client.get(`/sites/${siteId}/acl-rules/ordering`);
        return formatSuccess(data, { structured: true });
      } catch (err) {
        return formatError(err);
      }
    }
  );

  if (readOnly) return;

  server.registerTool(
    "unifi_create_acl_rule",
    {
      description: "Create a new ACL rule",
      inputSchema: {
        siteId: resourceId().describe("Site ID"),
        type: z.enum(["IPV4", "MAC"]).describe("Rule type"),
        name: z.string().describe("Rule name"),
        enabled: z.boolean().describe("Enable the rule"),
        action: z.enum(["ALLOW", "BLOCK"]).describe("Rule action"),
        description: z
          .string()
          .optional()
          .describe("Rule description"),
        protocolFilter: z
          .array(z.enum(["TCP", "UDP"]))
          .optional()
          .describe("Protocols this ACL rule will be applied to (TCP, UDP). When null, applies to all protocols"),
        sourceFilter: z
          .unknown()
          .optional()
          .describe("Traffic source filter (opaque object — pass the structure the API expects)"),
        destinationFilter: z
          .unknown()
          .optional()
          .describe("Traffic destination filter (opaque object — pass the structure the API expects)"),
        enforcingDeviceFilter: z
          .unknown()
          .optional()
          .describe("Device filter object (with a type discriminator) selecting the switch-capable devices that enforce the rule. When null/omitted, the rule is provisioned to all switches on the site"),
        dryRun: z
          .boolean()
          .optional()
          .describe("Preview this action without executing it"),
      },
      outputSchema: writeResult(aclRuleOutputSchema),
      annotations: WRITE_NOT_IDEMPOTENT,
    },
    async ({ siteId, type, name, enabled, action, description, protocolFilter, sourceFilter, destinationFilter, enforcingDeviceFilter, dryRun }) => {
      try {
        const body: Record<string, unknown> = { type, name, enabled, action };
        if (description !== undefined) body.description = description;
        if (protocolFilter !== undefined) body.protocolFilter = protocolFilter;
        if (sourceFilter !== undefined) body.sourceFilter = sourceFilter;
        if (destinationFilter !== undefined) body.destinationFilter = destinationFilter;
        if (enforcingDeviceFilter !== undefined) body.enforcingDeviceFilter = enforcingDeviceFilter;
        if (dryRun) return formatDryRun("POST", `/sites/${siteId}/acl-rules`, body);
        const data = await client.post(`/sites/${siteId}/acl-rules`, body);
        return formatSuccess(data, { structured: true });
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.registerTool(
    "unifi_update_acl_rule",
    {
      description: "Update an ACL rule. Pass only the fields to change. The API's PUT replaces the whole rule, and an omitted filter means \"all\" (all protocols, sources, destinations or switches), so this tool reads the current rule, overlays your fields and sends the full body. Filters are replaced whole; null clears one. dryRun shows the merged body.",
      inputSchema: {
        siteId: resourceId().describe("Site ID"),
        aclRuleId: resourceId().describe("ACL rule ID"),
        type: z.enum(["IPV4", "MAC"]).optional().describe("ACL rule type"),
        name: z.string().min(1).optional().describe("ACL rule name"),
        enabled: z.boolean().optional().describe("Whether the rule is enabled"),
        action: z.enum(["ALLOW", "BLOCK"]).optional().describe("Rule action"),
        description: z
          .string()
          .nullable()
          .optional()
          .describe("Rule description; null clears it"),
        protocolFilter: z
          .array(z.enum(["TCP", "UDP"]))
          .nullable()
          .optional()
          .describe("Protocols this ACL rule will be applied to (TCP, UDP). When null, applies to all protocols"),
        sourceFilter: z
          .unknown()
          .optional()
          .describe("Traffic source filter (opaque object — pass the structure the API expects)"),
        destinationFilter: z
          .unknown()
          .optional()
          .describe("Traffic destination filter (opaque object — pass the structure the API expects)"),
        enforcingDeviceFilter: z
          .unknown()
          .optional()
          .describe("Device filter object (with a type discriminator) selecting the switch-capable devices that enforce the rule. When null/omitted, the rule is provisioned to all switches on the site"),
        dryRun: z
          .boolean()
          .optional()
          .describe("Preview the merged PUT body without executing it (still reads the current rule)"),
      },
      outputSchema: writeResult(aclRuleOutputSchema),
      annotations: WRITE,
    },
    async ({ siteId, aclRuleId, dryRun, ...fields }) => {
      try {
        const path = `/sites/${siteId}/acl-rules/${aclRuleId}`;
        return await withResourceLock(path, async () => {
          const current = asObject(await client.get(path), "the current ACL rule");
          const body = mergeForPut(current, definedEntries(fields), ACL_RULE_FIELDS);
          const missing = missingFields(body, ACL_RULE_REQUIRED);
          if (missing.length > 0) {
            throw new Error(`Missing required fields: ${missing.join(", ")}`);
          }
          if (dryRun) return formatDryRun("PUT", path, body);
          const data = await client.put(path, body);
          return formatSuccess(data, { structured: true });
        });
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.registerTool(
    "unifi_delete_acl_rule",
    {
      description: "DESTRUCTIVE: Delete an ACL rule",
      inputSchema: {
        siteId: resourceId().describe("Site ID"),
        aclRuleId: resourceId().describe("ACL rule ID"),
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
    async ({ siteId, aclRuleId, confirm, dryRun }) => {
      const guard = dryRun ? null : requireConfirmation(confirm, "This will delete the ACL rule");
      if (guard) return guard;

      try {
        if (dryRun) return formatDryRun("DELETE", `/sites/${siteId}/acl-rules/${aclRuleId}`);
        const data = await client.delete(
          `/sites/${siteId}/acl-rules/${aclRuleId}`
        );
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.registerTool(
    "unifi_reorder_acl_rules",
    {
      description: "Reorder user-defined ACL rules",
      inputSchema: {
        siteId: resourceId().describe("Site ID"),
        orderedAclRuleIds: z
          .array(z.string())
          .describe("Ordered ACL rule IDs"),
        dryRun: z
          .boolean()
          .optional()
          .describe("Preview this action without executing it"),
      },
      annotations: WRITE,
    },
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
