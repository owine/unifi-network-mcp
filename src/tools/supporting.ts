import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { NetworkClient } from "../client.js";
import { formatSuccess, formatError } from "../utils/responses.js";
import { buildQuery } from "../utils/query.js";
import { READ_ONLY } from "../utils/safety.js";

export function registerSupportingTools(
  server: McpServer,
  client: NetworkClient
) {
  server.registerTool(
    "unifi_list_wans",
    {
      description: "List WAN interfaces (uplinks to the internet) at a site. Returns: id, name, type (WAN/WAN2), enabled, ipv4 config, ipv6 config, status (UP/DOWN), gateway, dns servers, currentRxRateBps/currentTxRateBps. Use for: WAN status, multi-WAN/failover inventory.",
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
      },
      annotations: READ_ONLY,
    },
    async ({ siteId, offset, limit }) => {
      try {
        const query = buildQuery({ offset, limit });
        const data = await client.get(`/sites/${siteId}/wans${query}`);
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.registerTool(
    "unifi_list_vpn_tunnels",
    {
      description: "List site-to-site VPN tunnels (IPsec, WireGuard, OpenVPN site-to-site) at a site. Returns: id, name, type, enabled, remoteEndpoint, localNetworks, remoteNetworks, status. For roaming client VPN servers, see unifi_list_vpn_servers.",
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
        const data = await client.get(`/sites/${siteId}/vpn/site-to-site-tunnels${query}`);
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.registerTool(
    "unifi_list_vpn_servers",
    {
      description: "List VPN servers (roaming/client-access VPNs: WireGuard, OpenVPN, L2TP, Teleport) at a site. Returns: id, name, type, enabled, listenPort, clientNetworks, dnsServers, connectedClientsCount.",
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
        const data = await client.get(`/sites/${siteId}/vpn/servers${query}`);
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.registerTool(
    "unifi_list_radius_profiles",
    {
      description: "List RADIUS profiles (auth/accounting server configurations referenced by WiFi WPA-Enterprise, switch 802.1X port auth, VPN). Returns: id, name, authServers[], accountingServers[], interimUpdateIntervalSec.",
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
          `/sites/${siteId}/radius/profiles${query}`
        );
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.registerTool(
    "unifi_list_device_tags",
    {
      description: "List device tags at a site. Tags group APs/switches for selective WiFi broadcast (via broadcastingDeviceFilter on a WiFi network). Returns: id, name, deviceIds[].",
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
        const data = await client.get(`/sites/${siteId}/device-tags${query}`);
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.registerTool(
    "unifi_list_dpi_categories",
    {
      description: "List DPI categories (global, not site-scoped) — high-level traffic groupings like 'Streaming', 'Social Networks', 'Gaming'. Returns: id, name. Use the category id when building firewall policies that match by category.",
      inputSchema: {
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
    async ({ offset, limit, filter }) => {
      try {
        const query = buildQuery({ offset, limit, filter });
        const data = await client.get(`/dpi/categories${query}`);
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.registerTool(
    "unifi_list_dpi_applications",
    {
      description: "List individual DPI applications (global) — specific apps/services like 'Netflix', 'Zoom', 'Steam'. Returns: id, name, categoryId. More granular than unifi_list_dpi_categories.",
      inputSchema: {
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
    async ({ offset, limit, filter }) => {
      try {
        const query = buildQuery({ offset, limit, filter });
        const data = await client.get(`/dpi/applications${query}`);
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.registerTool(
    "unifi_list_countries",
    {
      description: "List countries/regions (global) for geo-IP firewall rules. Returns: id (ISO alpha-2 code), name. Use the id when building firewall policies that match by source/destination country.",
      inputSchema: {
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
          .describe(
            "Filter expression (e.g., 'name.like(United*)')"
          ),
      },
      annotations: READ_ONLY,
    },
    async ({ offset, limit, filter }) => {
      try {
        const query = buildQuery({ offset, limit, filter });
        const data = await client.get(`/countries${query}`);
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );
}
