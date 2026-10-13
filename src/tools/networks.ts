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
  withResourceLock,
} from "../utils/full-put.js";
import {
  listNetworksOutputSchema,
  networkOutputSchema,
  getNetworkReferencesOutputSchema,
  writeResult,
} from "../utils/output-schemas.js";
import { resourceId } from "../utils/params.js";

// Request-body fields per management type, from the 11.0.83 POST/PUT schemas.
const COMMON_FIELDS = ["management", "name", "enabled", "vlanId", "dhcpGuarding"] as const;
const COMMON_REQUIRED = ["management", "name", "enabled", "vlanId"] as const;

const NETWORK_VARIANTS = {
  UNMANAGED: { allowed: COMMON_FIELDS, required: COMMON_REQUIRED },
  GATEWAY: {
    allowed: [
      ...COMMON_FIELDS,
      "isolationEnabled",
      "cellularBackupEnabled",
      "zoneId",
      "internetAccessEnabled",
      "mdnsForwardingEnabled",
      "ipv4Configuration",
      "ipv6Configuration",
    ],
    required: [
      ...COMMON_REQUIRED,
      "isolationEnabled",
      "cellularBackupEnabled",
      "internetAccessEnabled",
      "ipv4Configuration",
    ],
  },
  SWITCH: {
    allowed: [
      ...COMMON_FIELDS,
      "isolationEnabled",
      "cellularBackupEnabled",
      "deviceId",
      "ipv4Configuration",
    ],
    required: [
      ...COMMON_REQUIRED,
      "isolationEnabled",
      "cellularBackupEnabled",
      "deviceId",
      "ipv4Configuration",
    ],
  },
} as const;

const NETWORK_VARIANTS_DOC =
  "all types take name, enabled, vlanId, optional dhcpGuarding (omitted or null = disabled). GATEWAY (routed by the UniFi gateway) also requires isolationEnabled, cellularBackupEnabled, internetAccessEnabled, ipv4Configuration (gateway-managed subnet + DHCP), optional zoneId, mdnsForwardingEnabled, ipv6Configuration. SWITCH (routed by an L3 switch) also requires isolationEnabled, cellularBackupEnabled, deviceId (the L3 switch), ipv4Configuration (switch-managed).";

function fieldsForManagement(management: unknown) {
  if (management === "UNMANAGED" || management === "GATEWAY" || management === "SWITCH") {
    return NETWORK_VARIANTS[management];
  }
  throw new Error(`Unsupported network management type: ${String(management)}`);
}

function checkNetworkBody(body: JsonObject, updates: JsonObject) {
  const { allowed, required } = fieldsForManagement(body.management);
  const rejected = unsupportedFields(updates, allowed);
  if (rejected.length > 0) {
    throw new Error(`Fields not accepted for management ${String(body.management)}: ${rejected.join(", ")}`);
  }
  const missing = missingFields(body, required);
  if (missing.length > 0) {
    throw new Error(`Missing required fields for management ${String(body.management)}: ${missing.join(", ")}`);
  }
}

const config = (description: string) =>
  z.record(z.string(), z.unknown()).describe(description);

// Every body field as an optional input. Create tightens the common fields to
// required; update keeps them optional and fills gaps from the current network.
const networkFields = {
  name: z.string().optional().describe("Network name"),
  management: z
    .enum(["UNMANAGED", "GATEWAY", "SWITCH"])
    .optional()
    .describe("Network management type"),
  enabled: z.boolean().optional().describe("Enable the network"),
  vlanId: z
    .number()
    .int()
    .min(1)
    .max(4009)
    .optional()
    .describe("VLAN ID (1 for the default network, 2-4009 for additional networks)"),
  dhcpGuarding: config("DHCP Guarding settings (trustedDhcpServerIpAddresses). Omitted or null = disabled.")
    .nullable()
    .optional(),
  isolationEnabled: z.boolean().optional().describe("Isolate this network from all other networks. GATEWAY/SWITCH."),
  cellularBackupEnabled: z.boolean().optional().describe("Allow cellular data when WAN connection(s) are down. GATEWAY/SWITCH."),
  internetAccessEnabled: z.boolean().optional().describe("Allow internet access for devices on this network. GATEWAY only."),
  mdnsForwardingEnabled: z
    .boolean()
    .nullable()
    .optional()
    .describe("Participate in mDNS forwarding; null = use the site mDNS default. GATEWAY only."),
  zoneId: resourceId().optional().describe("Firewall zone ID for this network. GATEWAY only."),
  deviceId: resourceId().optional().describe("ID of the L3 switching capable device that manages this network. SWITCH only."),
  ipv4Configuration: config("IPv4 configuration (hostIpAddress, prefixLength, dhcpConfiguration, …) — copy the shape from unifi_get_network. GATEWAY/SWITCH.")
    .optional(),
  ipv6Configuration: config("IPv6 configuration (interfaceType, clientAddressAssignment, routerAdvertisement, …); omitted or null = IPv6 not configured. GATEWAY only.")
    .nullable()
    .optional(),
};

export function registerNetworkTools(
  server: McpServer,
  client: NetworkClient,
  readOnly = false
) {
  server.registerTool(
    "unifi_list_networks",
    {
      description: "List all networks (VLANs/LAN segments) at a site. Returns: id, name, management (UNMANAGED/GATEWAY/SWITCH), enabled, vlanId, default (true for the default network), zoneId (the firewall zone the network sits in), dhcpGuarding (only present when enabled), metadata.origin (+ metadata.configurable on the system-defined default network). NOTE: the list view is sparse — for subnet/DHCP/NTP detail (ipv4Configuration/ipv6Configuration), call unifi_get_network on a specific id. Use for: VLAN inventory; pair with unifi_get_network_references to find what consumes a network.",
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
          .describe("Filter expression, e.g. vlanId.eq(20)"),
      },
      outputSchema: listNetworksOutputSchema,
      annotations: READ_ONLY,
    },
    async ({ siteId, offset, limit, filter }) => {
      try {
        const query = buildQuery({ offset, limit, filter });
        const data = await client.get(`/sites/${siteId}/networks${query}`);
        return formatSuccess(data, { structured: true });
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.registerTool(
    "unifi_get_network",
    {
      description: "Get a network/VLAN by ID. Returns the list fields PLUS (live-verified) isolationEnabled, internetAccessEnabled, mdnsForwardingEnabled, cellularBackupEnabled, a full ipv4Configuration object (autoScaleEnabled, hostIpAddress, prefixLength, dhcpConfiguration with mode/ipAddressRange/leaseTimeSeconds/domainName/pingConflictDetectionEnabled/ntpServerIpAddresses — which may contain empty-string entries), and an ipv6Configuration object when IPv6 is configured (interfaceType, clientAddressAssignment, routerAdvertisement, hostIpAddress, prefixLength). NOTE: subnet/DHCP detail appears here at get-by-id but NOT in unifi_list_networks (sparse list view).",
      inputSchema: {
        siteId: resourceId().describe("Site ID"),
        networkId: resourceId().describe("Network ID"),
      },
      outputSchema: networkOutputSchema,
      annotations: READ_ONLY,
    },
    async ({ siteId, networkId }) => {
      try {
        const data = await client.get(`/sites/${siteId}/networks/${networkId}`);
        return formatSuccess(data, { structured: true });
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.registerTool(
    "unifi_get_network_references",
    {
      description: "Get all objects that reference this network. Returns: { referenceResources: [{ resourceType (e.g. WIFI), referenceCount, references: [{ referenceId }] }] }. Use before deleting a network to find dependencies that need to be re-pointed or removed. NOTE: on 11.0.83 the controller returns HTTP 500 (api.unexpected-error) for many networks — observed on the default network and on networks used by PPSK keys. On a 500, fall back to unifi_list_wifi + unifi_get_wifi (network.networkId and securityConfiguration.presharedKeys[].network.networkId) and unifi_list_firewall_zones (networkIds).",
      inputSchema: {
        siteId: resourceId().describe("Site ID"),
        networkId: resourceId().describe("Network ID"),
      },
      outputSchema: getNetworkReferencesOutputSchema,
      annotations: READ_ONLY,
    },
    async ({ siteId, networkId }) => {
      try {
        const data = await client.get(
          `/sites/${siteId}/networks/${networkId}/references`
        );
        return formatSuccess(data, { structured: true });
      } catch (err) {
        return formatError(err);
      }
    }
  );

  if (readOnly) return;

  server.registerTool(
    "unifi_create_network",
    {
      description: `Create a new VLAN/network. The body depends on management (per 11.0.83 docs): ${NETWORK_VARIANTS_DOC} Idempotency: not safe to retry — re-running creates duplicates.`,
      inputSchema: {
        siteId: resourceId().describe("Site ID"),
        ...networkFields,
        name: z.string().describe("Network name"),
        management: z
          .enum(["UNMANAGED", "GATEWAY", "SWITCH"])
          .describe("Network management type"),
        enabled: z.boolean().describe("Enable the network"),
        vlanId: z
          .number()
          .int()
          .min(1)
          .max(4009)
          .describe("VLAN ID (1 for default, 2+ for additional)"),
        dryRun: z
          .boolean()
          .optional()
          .describe("Preview this action without executing it"),
      },
      outputSchema: writeResult(networkOutputSchema),
      annotations: WRITE_NOT_IDEMPOTENT,
    },
    async ({ siteId, dryRun, ...fields }) => {
      try {
        const body = definedEntries(fields);
        checkNetworkBody(body, body);
        if (dryRun) return formatDryRun("POST", `/sites/${siteId}/networks`, body);
        const data = await client.post(`/sites/${siteId}/networks`, body);
        return formatSuccess(data, { structured: true });
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.registerTool(
    "unifi_update_network",
    {
      description: `Update an existing network. Pass only the fields to change. The API's PUT replaces the whole network — omitting dhcpGuarding disables DHCP guarding, and GATEWAY networks must resend their full ipv4Configuration — so this tool reads the current network, keeps every documented body field for its management type, overlays your changes and sends the full body. Pass null to clear an optional field (e.g. ipv6Configuration: null removes IPv6). Nested objects such as ipv4Configuration are replaced whole, not deep-merged: read them with unifi_get_network and send the complete object. Variants: ${NETWORK_VARIANTS_DOC} dryRun shows the merged body.`,
      inputSchema: {
        siteId: resourceId().describe("Site ID"),
        networkId: resourceId().describe("Network ID"),
        ...networkFields,
        dryRun: z
          .boolean()
          .optional()
          .describe("Preview the merged PUT body without executing it (still reads the current network)"),
      },
      outputSchema: writeResult(networkOutputSchema),
      annotations: WRITE,
    },
    async ({ siteId, networkId, dryRun, ...fields }) => {
      try {
        const path = `/sites/${siteId}/networks/${networkId}`;
        return await withResourceLock(path, async () => {
          const current = asObject(await client.get(path), "the current network");
          const updates = definedEntries(fields);
          const { allowed } = fieldsForManagement(updates.management ?? current.management);
          const body = mergeForPut(current, updates, allowed);
          checkNetworkBody(body, updates);
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
    "unifi_delete_network",
    {
      description: "DESTRUCTIVE: Delete a network — all clients on this network will be disconnected",
      inputSchema: {
        siteId: resourceId().describe("Site ID"),
        networkId: resourceId().describe("Network ID"),
        force: z
          .boolean()
          .optional()
          .default(false)
          .describe("Force delete (default: false)"),
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
    async ({ siteId, networkId, force, confirm, dryRun }) => {
      const guard = dryRun ? null : requireConfirmation(confirm, "This will delete the network and disconnect all clients on it");
      if (guard) return guard;

      try {
        let path = `/sites/${siteId}/networks/${networkId}`;
        if (force) {
          path += "?force=true";
        }
        if (dryRun) return formatDryRun("DELETE", path);
        const data = await client.delete(path);
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );
}
