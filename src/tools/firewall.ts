import { isDeepStrictEqual } from "node:util";
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
  confirmDestructive,
  requireConfirmationIf,
  reorderOpens,
} from "../utils/safety.js";
import {
  asObject,
  mergeForPut,
  missingFields,
  unsupportedFields,
  withResourceLock,
} from "../utils/full-put.js";
import {
  listFirewallZonesOutputSchema,
  firewallZoneOutputSchema,
  listFirewallPoliciesOutputSchema,
  firewallPolicyOutputSchema,
  firewallPolicyOrderingOutputSchema,
  writeResult,
} from "../utils/output-schemas.js";
import { resourceId } from "../utils/params.js";
import { DEFAULT_WAN_POLICY, WanExposure, wanRefusal, type WanPolicy } from "../utils/wan-exposure.js";

// Firewall policy request-body fields, from the 11.0.83 POST/PUT schemas.
const FIREWALL_POLICY_FIELDS = [
  "enabled",
  "name",
  "description",
  "action",
  "source",
  "destination",
  "ipProtocolScope",
  "connectionStateFilter",
  "ipsecFilter",
  "loggingEnabled",
  "reportFlowEnabled",
  "schedule",
] as const;

const FIREWALL_POLICY_REQUIRED = [
  "enabled",
  "name",
  "action",
  "source",
  "destination",
  "ipProtocolScope",
  "loggingEnabled",
] as const;

// PATCH fields that change what is logged or reported, never what passes.
const REPORTING_FIELDS: readonly string[] = ["loggingEnabled", "reportFlowEnabled"];

// Present in responses but not part of the request body.
const FIREWALL_POLICY_READ_ONLY: readonly string[] = ["id", "index", "metadata"];

// The fields that decide which traffic a policy applies to, and how.
const FIREWALL_POLICY_MATCH_FIELDS = [
  "action", "source", "destination", "ipProtocolScope", "connectionStateFilter", "ipsecFilter", "schedule",
] as const;

/**
 * Whether a policy lets traffic through: any action but BLOCK or REJECT,
 * including a missing one. Compared without case, since policy is a free-form
 * object the controller may accept "allow" in.
 */
function letsThrough(policy: Record<string, unknown>): boolean {
  const action = policy.action;
  const type = action !== null && typeof action === "object" && "type" in action ? action.type : undefined;
  return typeof type !== "string" || !["BLOCK", "REJECT"].includes(type.toUpperCase());
}

/**
 * What a firewall policy write would open, if anything. before is undefined
 * on create. Changing what an enabled policy matches counts whatever its
 * action: widening an ALLOW and narrowing a BLOCK both let more through, and
 * which of the two a change does cannot be told from here.
 */
function firewallOpening(
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown>
): string | undefined {
  if (before === undefined) {
    return letsThrough(after) ? "This creates a firewall policy that ALLOWs traffic" : undefined;
  }
  if (letsThrough(after) && !letsThrough(before)) return "This changes the firewall policy's action to ALLOW";
  if (after.enabled === false) {
    return before.enabled !== false && !letsThrough(before) ? "This disables a firewall policy that blocks traffic" : undefined;
  }
  if (before.enabled === false) {
    return letsThrough(after) ? "This enables a firewall policy that ALLOWs traffic" : undefined;
  }
  const changed = FIREWALL_POLICY_MATCH_FIELDS.filter((field) => !isDeepStrictEqual(before[field], after[field]));
  return changed.length > 0
    ? `This changes what an enabled firewall policy matches (${changed.join(", ")}), which can let more traffic through`
    : undefined;
}

// Stands for the system-defined policies in an evaluation order; not an ID
// the API can return, since IDs never contain spaces.
const SYSTEM_DEFINED = "system defined";

/** A zone pair's policies in evaluation order, the system-defined ones as a single entry. */
function evaluationOrder(ordering: unknown): string[] {
  const ids = (list: unknown) => Array.isArray(list) ? list.filter((id) => typeof id === "string") : [];
  const lists = ordering !== null && typeof ordering === "object" ? ordering as Record<string, unknown> : {};
  return [...ids(lists.beforeSystemDefined), SYSTEM_DEFINED, ...ids(lists.afterSystemDefined)];
}

const confirmOpening = z
  .boolean()
  .optional()
  .describe("Set true to confirm a change that can let traffic through: an ALLOW action, enabling an ALLOW policy, disabling a policy that blocks, or changing what an enabled policy matches; not needed with dryRun: true");

const FIREWALL_POLICY_BODY_DOC =
  "required enabled, name (non-empty), action ({type: ALLOW|BLOCK, allowReturnTraffic? on ALLOW}), source and destination ({zoneId, trafficFilter?}), ipProtocolScope ({ipVersion, protocolFilter?}), loggingEnabled; optional description, connectionStateFilter (array of NEW/INVALID/ESTABLISHED/RELATED), ipsecFilter (MATCH_ENCRYPTED/MATCH_NOT_ENCRYPTED), schedule (null = always active), reportFlowEnabled (report matches in Insights Flows; defaults to true when omitted).";

export function registerFirewallTools(
  server: McpServer,
  client: NetworkClient,
  readOnly = false,
  wan: WanPolicy = DEFAULT_WAN_POLICY
) {
  server.registerTool(
    "unifi_list_firewall_zones",
    {
      description: "List firewall zones (groupings of networks for zone-based firewalling) at a site. Returns: id, name, networkIds[], metadata.origin (indicates system-defined vs user-defined). Use for: zone inventory; pair with unifi_list_firewall_policies to see rules between zones.",
      inputSchema: {
        siteId: resourceId().describe("Site ID"),
        offset: z
          .number()
          .int()
          .nonnegative()
          .optional()
          .describe("Number of records to skip"),
        limit: z
          .number()
          .int()
          .min(0)
          .max(200)
          .optional()
          .describe("Number of records to return (API default: 25)"),
        filter: z
          .string()
          .optional()
          .describe("Filter expression, e.g. name.eq('Internal'). NOTE: totalCount ignores the filter on this endpoint (observed 11.0.83) — page by count"),
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
        siteId: resourceId().describe("Site ID"),
        firewallZoneId: resourceId().describe("Firewall zone ID"),
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
      description: "List firewall policies (zone-based rules) at a site. Returns: id, name, enabled, action (object with type field), source/destination (zone reference + trafficFilter), ipProtocolScope, connectionStateFilter, ipsecFilter, schedule, loggingEnabled, reportFlowEnabled (Insights Flows reporting; false on the predefined Allow Return Traffic and Block policies), index, description, metadata (origin SYSTEM_DEFINED/USER_DEFINED/DERIVED, configurable on system policies). action is {type: ALLOW|BLOCK, allowReturnTraffic on ALLOW}. The protocol lives in ipProtocolScope.protocolFilter (NAMED_PROTOCOL or PRESET); ports and addresses live in source/destination.trafficFilter, which is omitted when a side matches the whole zone. Unset optional fields (ipsecFilter, schedule, connectionStateFilter) are omitted, not null. Evaluation order within a zone pair comes from unifi_get_firewall_policy_ordering.",
      inputSchema: {
        siteId: resourceId().describe("Site ID"),
        offset: z
          .number()
          .int()
          .nonnegative()
          .optional()
          .describe("Number of records to skip"),
        limit: z
          .number()
          .int()
          .min(0)
          .max(200)
          .optional()
          .describe("Number of records to return (API default: 25)"),
        filter: z
          .string()
          .optional()
          .describe("Filter expression, e.g. metadata.origin.eq('USER_DEFINED') or name.eq('Allow Return Traffic'). Boolean fields (enabled, loggingEnabled, reportFlowEnabled) are not filterable"),
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
      description: "Get a firewall policy by ID with full match criteria and action. Returns the same fields as a unifi_list_firewall_policies entry, including loggingEnabled and reportFlowEnabled.",
      inputSchema: {
        siteId: resourceId().describe("Site ID"),
        firewallPolicyId: resourceId().describe("Firewall policy ID"),
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
      description: "Get the evaluation order of user-defined firewall policies for a specific (source zone, destination zone) pair. Returns: orderedFirewallPolicyIds.beforeSystemDefined[] and orderedFirewallPolicyIds.afterSystemDefined[] arrays of policy IDs. System-defined rules sit between these two arrays.",
      inputSchema: {
        siteId: resourceId().describe("Site ID"),
        sourceFirewallZoneId: resourceId()
          .describe("Source firewall zone ID"),
        destinationFirewallZoneId: resourceId()
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
        siteId: resourceId().describe("Site ID"),
        name: z.string().describe("Zone name"),
        networkIds: z
          .array(z.string())
          .describe("Network IDs to include in this zone"),
        dryRun: z
          .boolean()
          .optional()
          .describe("Preview this action without executing it"),
      },
      outputSchema: writeResult(firewallZoneOutputSchema),
      annotations: WRITE_NOT_IDEMPOTENT,
    },
    async ({ siteId, name, networkIds, dryRun }) => {
      try {
        const body = { name, networkIds };
        const exposure = await new WanExposure(client, wan, siteId).firewallZone(undefined, networkIds);
        if (exposure) return wanRefusal(exposure, "POST", `/sites/${siteId}/firewall/zones`);
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
      description: "Replace a firewall zone's name and networkIds (full PUT: both are required, and networkIds replaces the zone's whole network list, so start from unifi_get_firewall_zone).",
      inputSchema: {
        siteId: resourceId().describe("Site ID"),
        firewallZoneId: resourceId().describe("Firewall zone ID"),
        name: z.string().describe("Zone name"),
        networkIds: z
          .array(z.string())
          .describe("Network IDs to include in this zone"),
        dryRun: z
          .boolean()
          .optional()
          .describe("Preview this action without executing it"),
      },
      outputSchema: writeResult(firewallZoneOutputSchema),
      annotations: WRITE,
    },
    async ({ siteId, firewallZoneId, name, networkIds, dryRun }) => {
      try {
        const body = { name, networkIds };
        const exposure = await new WanExposure(client, wan, siteId).firewallZone(firewallZoneId, networkIds);
        if (exposure) return wanRefusal(exposure, "PUT", `/sites/${siteId}/firewall/zones/${firewallZoneId}`);
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
        siteId: resourceId().describe("Site ID"),
        firewallZoneId: resourceId().describe("Firewall zone ID"),
        confirm: confirmDestructive(),
        dryRun: z
          .boolean()
          .optional()
          .describe("Preview this action without executing it"),
      },
      annotations: DESTRUCTIVE,
    },
    async ({ siteId, firewallZoneId, confirm, dryRun }) => {
      try {
        const path = `/sites/${siteId}/firewall/zones/${firewallZoneId}`;
        const exposure = await new WanExposure(client, wan, siteId).zoneDelete(firewallZoneId);
        if (exposure) return wanRefusal(exposure, "DELETE", path);
        const guard = dryRun ? null : requireConfirmation(confirm, "This will delete the firewall zone");
        if (guard) return guard;
        if (dryRun) return formatDryRun("DELETE", path);
        const data = await client.delete(path);
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.registerTool(
    "unifi_create_firewall_policy",
    {
      description: `Create a new firewall policy. Body fields (per 11.0.83 docs): ${FIREWALL_POLICY_BODY_DOC} Copy nested shapes (trafficFilter, protocolFilter) from an existing policy via unifi_get_firewall_policy. Idempotency: not safe to retry — re-running creates a duplicate policy.`,
      inputSchema: {
        siteId: resourceId().describe("Site ID"),
        policy: z
          .record(z.string(), z.unknown())
          .describe("Firewall policy configuration (JSON object)"),
        confirm: confirmOpening,
        dryRun: z
          .boolean()
          .optional()
          .describe("Preview this action without executing it"),
      },
      outputSchema: writeResult(firewallPolicyOutputSchema),
      annotations: WRITE_NOT_IDEMPOTENT,
    },
    async ({ siteId, policy, confirm, dryRun }) => {
      try {
        const exposure = await new WanExposure(client, wan, siteId).firewallPolicy(policy);
        if (exposure) return wanRefusal(exposure, "POST", `/sites/${siteId}/firewall/policies`);
        const opening = firewallOpening(undefined, policy);
        const guard = requireConfirmationIf(opening, confirm, dryRun);
        if (guard) return guard;
        if (dryRun) return formatDryRun("POST", `/sites/${siteId}/firewall/policies`, policy, opening);
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
      description: `Update a firewall policy. Pass only the fields to change in policy. The API's PUT replaces the whole policy — and an omitted reportFlowEnabled reverts to true — so this tool reads the current policy, keeps every documented body field, overlays your fields and sends the full body. Top-level fields are replaced whole (e.g. send the complete source object). Read-only response fields (id, index, metadata) are ignored. Body fields: ${FIREWALL_POLICY_BODY_DOC} For just logging/flow-reporting toggles, prefer unifi_patch_firewall_policy. dryRun shows the merged body.`,
      inputSchema: {
        siteId: resourceId().describe("Site ID"),
        firewallPolicyId: resourceId().describe("Firewall policy ID"),
        policy: z
          .record(z.string(), z.unknown())
          .describe("Firewall policy fields to change (JSON object); null clears an optional field such as schedule"),
        confirm: confirmOpening,
        dryRun: z
          .boolean()
          .optional()
          .describe("Preview the merged PUT body without executing it (still reads the current policy)"),
      },
      outputSchema: writeResult(firewallPolicyOutputSchema),
      annotations: WRITE,
    },
    async ({ siteId, firewallPolicyId, policy, confirm, dryRun }) => {
      try {
        const path = `/sites/${siteId}/firewall/policies/${firewallPolicyId}`;
        const updates = Object.fromEntries(
          Object.entries(policy).filter(([field]) => !FIREWALL_POLICY_READ_ONLY.includes(field))
        );
        const rejected = unsupportedFields(updates, FIREWALL_POLICY_FIELDS);
        if (rejected.length > 0) {
          throw new Error(`Fields not accepted by the firewall policy PUT body: ${rejected.join(", ")}`);
        }
        return await withResourceLock(path, async () => {
          const current = asObject(await client.get(path), "the current firewall policy");
          const body = mergeForPut(current, updates, FIREWALL_POLICY_FIELDS);
          const missing = missingFields(body, FIREWALL_POLICY_REQUIRED);
          if (missing.length > 0) {
            throw new Error(`Missing required fields: ${missing.join(", ")}`);
          }
          const exposure = await new WanExposure(client, wan, siteId).firewallPolicy(body);
          if (exposure) return wanRefusal(exposure, "PUT", path);
          const opening = firewallOpening(current, body);
          const guard = requireConfirmationIf(opening, confirm, dryRun);
          if (guard) return guard;
          if (dryRun) return formatDryRun("PUT", path, body, opening);
          const data = await client.put(path, body);
          return formatSuccess(data, { structured: true });
        });
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.registerTool(
    "unifi_patch_firewall_policy",
    {
      description: "Partially update a firewall policy without resending all fields. loggingEnabled and reportFlowEnabled are the only fields documented as patchable in API 11.0.83 (reportFlowEnabled is ignored for the predefined Allow Return Traffic policies, which are never reported); other fields may be rejected — use unifi_update_firewall_policy for a full update. Idempotent for fields supplied.",
      inputSchema: {
        siteId: resourceId().describe("Site ID"),
        firewallPolicyId: resourceId().describe("Firewall policy ID"),
        policy: z
          .record(z.string(), z.unknown())
          .describe("Partial firewall policy fields to update (e.g. { loggingEnabled: true } or { reportFlowEnabled: false })"),
        confirm: z
          .boolean()
          .optional()
          .describe("Set true to confirm a patch that can let traffic through, judged on the current policy with the patch applied: an ALLOW action, enabling an ALLOW policy, disabling a policy that blocks, or changing what an enabled policy matches. Logging and flow-reporting toggles never need it. A patch that could let traffic in from the WAN is refused, and confirm does not override that. Not needed with dryRun: true"),
        dryRun: z
          .boolean()
          .optional()
          .describe("Preview this action without executing it"),
      },
      outputSchema: writeResult(firewallPolicyOutputSchema),
      annotations: WRITE,
    },
    async ({ siteId, firewallPolicyId, policy, confirm, dryRun }) => {
      try {
        const path = `/sites/${siteId}/firewall/policies/${firewallPolicyId}`;
        // Queue behind any in-flight update of this policy, whose PUT would
        // otherwise overwrite this change with the values it read earlier.
        return await withResourceLock(path, async () => {
          // Toggling logging or flow reporting changes what is recorded, never
          // what passes. Anything else is judged on the policy as the PATCH
          // would leave it, which takes reading it first.
          const reportingOnly = Object.keys(policy).every((field) => REPORTING_FIELDS.includes(field));
          let opening: string | undefined;
          if (!reportingOnly) {
            const current = asObject(await client.get(path), "the current firewall policy");
            const after = { ...current, ...policy };
            // Disabling cannot let traffic in from the WAN.
            const disablesOnly = Object.entries(policy).every(([field, value]) =>
              REPORTING_FIELDS.includes(field) || (field === "enabled" && value === false));
            if (!wan.allowExposure && !disablesOnly) {
              const exposure = await new WanExposure(client, wan, siteId).firewallPolicy(after);
              if (exposure) return wanRefusal(exposure, "PATCH", path);
            }
            opening = firewallOpening(current, after);
            const guard = requireConfirmationIf(opening, confirm, dryRun);
            if (guard) return guard;
          }
          if (dryRun) return formatDryRun("PATCH", path, policy, opening);
          const data = await client.patch(path, policy);
          return formatSuccess(data, { structured: true });
        });
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
        siteId: resourceId().describe("Site ID"),
        firewallPolicyId: resourceId().describe("Firewall policy ID"),
        confirm: confirmDestructive(),
        dryRun: z
          .boolean()
          .optional()
          .describe("Preview this action without executing it"),
      },
      annotations: DESTRUCTIVE,
    },
    async ({ siteId, firewallPolicyId, confirm, dryRun }) => {
      const guard = dryRun ? null : requireConfirmation(confirm, "This will delete the firewall policy");
      if (guard) return guard;

      try {
        if (dryRun) return formatDryRun("DELETE", `/sites/${siteId}/firewall/policies/${firewallPolicyId}`);
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
      description: "Reorder user-defined firewall policies for a zone pair. Policies are evaluated in order, user-defined ones in beforeSystemDefined ahead of the system-defined policies and those in afterSystemDefined after them. Moving a policy that lets traffic through ahead of one that blocks it, or across the system-defined policies, needs confirm. Reads the current order and the policies it moves past one another, on a dry run too.",
      inputSchema: {
        siteId: resourceId().describe("Site ID"),
        sourceFirewallZoneId: resourceId().describe("Source firewall zone ID"),
        destinationFirewallZoneId: resourceId()
          .describe("Destination firewall zone ID"),
        orderedFirewallPolicyIds: z
          .record(z.string(), z.unknown())
          .describe(
            "Ordered policy IDs object with beforeSystemDefined and afterSystemDefined arrays"
          ),
        confirm: z
          .boolean()
          .optional()
          .describe("Set true to confirm a reorder that moves a policy that lets traffic through ahead of one that blocks it, or across the system-defined policies; not needed with dryRun: true"),
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
      confirm,
      dryRun,
    }) => {
      try {
        const exposure = await new WanExposure(client, wan, siteId).policyOrder(sourceFirewallZoneId);
        if (exposure) return wanRefusal(exposure, "PUT", `/sites/${siteId}/firewall/policies/ordering`);
        const query = `?sourceFirewallZoneId=${encodeURIComponent(sourceFirewallZoneId)}&destinationFirewallZoneId=${encodeURIComponent(destinationFirewallZoneId)}`;
        const path = `/sites/${siteId}/firewall/policies/ordering${query}`;
        const body = { orderedFirewallPolicyIds };
        const current = asObject(await client.get(path), "the current firewall policy ordering");
        const opens = await reorderOpens(
          evaluationOrder(current.orderedFirewallPolicyIds),
          evaluationOrder(orderedFirewallPolicyIds),
          async (id) => {
            // The system-defined policies are not listed, so their actions are
            // unknown: moving anything across them counts both ways.
            if (id === SYSTEM_DEFINED) return { letsThrough: true, blocks: true };
            const policy = asObject(await client.get(`/sites/${siteId}/firewall/policies/${id}`), "a firewall policy");
            const active = policy.enabled !== false;
            return { letsThrough: active && letsThrough(policy), blocks: active && !letsThrough(policy) };
          }
        );
        const opening = opens ? "This moves a firewall policy that lets traffic through ahead of one that blocks it" : undefined;
        const guard = requireConfirmationIf(opening, confirm, dryRun);
        if (guard) return guard;
        if (dryRun) return formatDryRun("PUT", path, body, opening);
        const data = await client.put(path, body);
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );
}
