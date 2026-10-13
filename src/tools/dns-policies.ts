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
  asObject,
  definedEntries,
  mergeForPut,
  missingFields,
  unsupportedFields,
  type JsonObject,
} from "../utils/full-put.js";
import {
  listDnsPoliciesOutputSchema,
  dnsPolicyOutputSchema,
  writeResult,
} from "../utils/output-schemas.js";
import { resourceId } from "../utils/params.js";

// Type-specific request-body fields, from the 11.0.83 POST/PUT schemas (every
// type also takes type, enabled, domain). MX/TXT/SRV/FORWARD_DOMAIN have no TTL.
const DNS_TYPE_FIELDS = {
  A_RECORD: ["ipv4Address", "ttlSeconds"],
  AAAA_RECORD: ["ipv6Address", "ttlSeconds"],
  CNAME_RECORD: ["targetDomain", "ttlSeconds"],
  MX_RECORD: ["mailServerDomain", "priority"],
  TXT_RECORD: ["text"],
  SRV_RECORD: ["serverDomain", "service", "protocol", "port", "priority", "weight"],
  FORWARD_DOMAIN: ["ipAddress"],
} as const;

const DNS_TYPES_DOC =
  "A_RECORD: ipv4Address, ttlSeconds (0-86400). AAAA_RECORD: ipv6Address, ttlSeconds (0-86400). CNAME_RECORD: targetDomain, ttlSeconds (0-604800). MX_RECORD: mailServerDomain, priority. TXT_RECORD: text. SRV_RECORD: serverDomain, service (e.g. _ldap), protocol (e.g. _tcp), port, priority, weight. FORWARD_DOMAIN: ipAddress (upstream DNS server). All type-specific fields are required for their type.";

const dnsType = z
  .enum([
    "A_RECORD",
    "AAAA_RECORD",
    "CNAME_RECORD",
    "MX_RECORD",
    "TXT_RECORD",
    "SRV_RECORD",
    "FORWARD_DOMAIN",
  ])
  .describe("DNS record type");

function fieldsForDnsType(type: unknown) {
  if (typeof type !== "string" || !(type in DNS_TYPE_FIELDS)) {
    throw new Error(`Unsupported DNS policy type: ${String(type)}`);
  }
  const specific = DNS_TYPE_FIELDS[type as keyof typeof DNS_TYPE_FIELDS];
  return {
    allowed: ["type", "enabled", "domain", ...specific],
    required: ["type", "enabled", "domain", ...specific],
  };
}

function checkDnsBody(body: JsonObject, updates: JsonObject) {
  const { allowed, required } = fieldsForDnsType(body.type);
  const rejected = unsupportedFields(updates, allowed);
  if (rejected.length > 0) {
    throw new Error(`Fields not accepted for type ${String(body.type)}: ${rejected.join(", ")}`);
  }
  const missing = missingFields(body, required);
  if (missing.length > 0) {
    throw new Error(`Missing required fields for type ${String(body.type)}: ${missing.join(", ")}`);
  }
  if (
    (body.type === "A_RECORD" || body.type === "AAAA_RECORD") &&
    typeof body.ttlSeconds === "number" &&
    body.ttlSeconds > 86400
  ) {
    throw new Error(`ttlSeconds for ${body.type} must be 0-86400 (604800 is the CNAME_RECORD maximum)`);
  }
}

const uint16 = (description: string) =>
  z.number().int().min(0).max(65535).optional().describe(description);

const hostname = (description: string) =>
  z.string().min(1).max(127).optional().describe(description);

const dnsFields = {
  ipv4Address: z.string().optional().describe("IPv4 address. A_RECORD."),
  ipv6Address: z.string().optional().describe("IPv6 address. AAAA_RECORD."),
  targetDomain: hostname("Canonical name the alias points at. CNAME_RECORD."),
  mailServerDomain: hostname("Mail server domain. MX_RECORD."),
  text: z.string().min(1).max(1024).optional().describe("TXT value: up to four 255-character strings; lines containing commas must be double-quoted. TXT_RECORD."),
  serverDomain: hostname("Domain of the server running the service. SRV_RECORD."),
  service: z.string().optional().describe("Service, e.g. _ldap. SRV_RECORD."),
  protocol: z.string().optional().describe("Protocol, e.g. _tcp. SRV_RECORD."),
  port: uint16("Service port. SRV_RECORD."),
  priority: uint16("Priority; lower is preferred. MX_RECORD, SRV_RECORD."),
  weight: uint16("Relative weight among records with the same priority. SRV_RECORD."),
  ipAddress: z.string().optional().describe("IP address of the DNS server queries are forwarded to. FORWARD_DOMAIN."),
  ttlSeconds: z
    .number()
    .int()
    .min(0)
    .max(604800)
    .optional()
    .describe("Time to live in seconds: 0-86400 for A/AAAA_RECORD, 0-604800 for CNAME_RECORD"),
};

export function registerDnsPolicyTools(
  server: McpServer,
  client: NetworkClient,
  readOnly = false
) {
  server.registerTool(
    "unifi_list_dns_policies",
    {
      description: "List DNS policies (local DNS records and forward rules served by the gateway) at a site. Returns: id, type (A_RECORD, AAAA_RECORD, CNAME_RECORD, MX_RECORD, TXT_RECORD, SRV_RECORD, FORWARD_DOMAIN), enabled, domain, metadata.origin, plus type-specific fields: A ipv4Address+ttlSeconds; AAAA ipv6Address+ttlSeconds; CNAME targetDomain+ttlSeconds; MX mailServerDomain+priority; TXT text; SRV serverDomain/service/protocol/port/priority/weight; FORWARD_DOMAIN ipAddress (per 11.0.83 response samples).",
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
          .describe("Filter expression, e.g. type.eq('A_RECORD')"),
      },
      outputSchema: listDnsPoliciesOutputSchema,
      annotations: READ_ONLY,
    },
    async ({ siteId, offset, limit, filter }) => {
      try {
        const query = buildQuery({ offset, limit, filter });
        const data = await client.get(`/sites/${siteId}/dns/policies${query}`);
        return formatSuccess(data, { structured: true });
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.registerTool(
    "unifi_get_dns_policy",
    {
      description: "Get a specific DNS policy by ID (same fields as the list entry).",
      inputSchema: {
        siteId: resourceId().describe("Site ID"),
        dnsPolicyId: resourceId().describe("DNS policy ID"),
      },
      outputSchema: dnsPolicyOutputSchema,
      annotations: READ_ONLY,
    },
    async ({ siteId, dnsPolicyId }) => {
      try {
        const data = await client.get(
          `/sites/${siteId}/dns/policies/${dnsPolicyId}`
        );
        return formatSuccess(data, { structured: true });
      } catch (err) {
        return formatError(err);
      }
    }
  );

  if (readOnly) return;

  server.registerTool(
    "unifi_create_dns_policy",
    {
      description: `Create a new DNS policy. Every type takes type, enabled, domain; the rest depends on type (per 11.0.83 docs): ${DNS_TYPES_DOC} Fields belonging to other types are rejected. Idempotency: not safe to retry — re-running creates a duplicate record.`,
      inputSchema: {
        siteId: resourceId().describe("Site ID"),
        ...dnsFields,
        type: dnsType,
        enabled: z.boolean().describe("Whether the DNS policy is enabled"),
        domain: z.string().min(1).max(127).describe("Domain name"),
        dryRun: z
          .boolean()
          .optional()
          .describe("Preview this action without executing it"),
      },
      outputSchema: writeResult(dnsPolicyOutputSchema),
      annotations: WRITE_NOT_IDEMPOTENT,
    },
    async ({ siteId, dryRun, ...fields }) => {
      try {
        const body = definedEntries(fields);
        checkDnsBody(body, body);
        if (dryRun) return formatDryRun("POST", `/sites/${siteId}/dns/policies`, body);
        const data = await client.post(`/sites/${siteId}/dns/policies`, body);
        return formatSuccess(data, { structured: true });
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.registerTool(
    "unifi_update_dns_policy",
    {
      description: `Update a DNS policy. Pass only the fields to change. The API's PUT replaces the whole policy, so this tool reads the current policy, keeps the documented fields for the (possibly new) type, overlays your changes and sends the full body. Changing type drops the old type's fields, so supply the new type's required fields: ${DNS_TYPES_DOC} dryRun shows the merged body.`,
      inputSchema: {
        siteId: resourceId().describe("Site ID"),
        dnsPolicyId: resourceId().describe("DNS policy ID"),
        ...dnsFields,
        type: dnsType.optional(),
        enabled: z.boolean().optional().describe("Whether the DNS policy is enabled"),
        domain: z.string().min(1).max(127).optional().describe("Domain name"),
        dryRun: z
          .boolean()
          .optional()
          .describe("Preview the merged PUT body without executing it (still reads the current policy)"),
      },
      outputSchema: writeResult(dnsPolicyOutputSchema),
      annotations: WRITE,
    },
    async ({ siteId, dnsPolicyId, dryRun, ...fields }) => {
      try {
        const path = `/sites/${siteId}/dns/policies/${dnsPolicyId}`;
        const current = asObject(await client.get(path), "the current DNS policy");
        const updates = definedEntries(fields);
        const { allowed } = fieldsForDnsType(updates.type ?? current.type);
        const body = mergeForPut(current, updates, allowed);
        checkDnsBody(body, updates);
        if (dryRun) return formatDryRun("PUT", path, body);
        const data = await client.put(path, body);
        return formatSuccess(data, { structured: true });
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
        siteId: resourceId().describe("Site ID"),
        dnsPolicyId: resourceId().describe("DNS policy ID"),
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
