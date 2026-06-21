import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { NetworkClient } from "../client.js";
import { formatSuccess, formatError } from "../utils/responses.js";
import { buildQuery } from "../utils/query.js";
import { READ_ONLY } from "../utils/safety.js";
import {
  listWansOutputSchema,
  listVpnTunnelsOutputSchema,
  listVpnServersOutputSchema,
  listRadiusProfilesOutputSchema,
  listDeviceTagsOutputSchema,
  listDpiCategoriesOutputSchema,
  listDpiApplicationsOutputSchema,
  listCountriesOutputSchema,
} from "../utils/output-schemas.js";

export function registerSupportingTools(
  server: McpServer,
  client: NetworkClient
) {
  server.registerTool(
    "unifi_list_wans",
    {
      description: "List WAN interface definitions at a site. Returns: id, name only (verified against 10.5.43 — the Integration API exposes no live link status or throughput rates here). Use for: WAN inventory, multi-WAN topology.",
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
      outputSchema: listWansOutputSchema,
      annotations: READ_ONLY,
    },
    async ({ siteId, offset, limit }) => {
      try {
        const query = buildQuery({ offset, limit });
        const data = await client.get(`/sites/${siteId}/wans${query}`);
        return formatSuccess(data, { structured: true });
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.registerTool(
    "unifi_list_vpn_tunnels",
    {
      description: "List site-to-site VPN tunnels (IPsec, WireGuard, OpenVPN site-to-site) at a site. Returns: tunnel definitions per row (per-row schema not rendered in 10.5.43 docs — call to inspect). For roaming client VPN servers, see unifi_list_vpn_servers.",
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
      outputSchema: listVpnTunnelsOutputSchema,
      annotations: READ_ONLY,
    },
    async ({ siteId, offset, limit, filter }) => {
      try {
        const query = buildQuery({ offset, limit, filter });
        const data = await client.get(`/sites/${siteId}/vpn/site-to-site-tunnels${query}`);
        return formatSuccess(data, { structured: true });
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.registerTool(
    "unifi_list_vpn_servers",
    {
      description: "List VPN servers (roaming/client-access VPNs: WireGuard, OpenVPN, L2TP, Teleport) at a site. Returns: id, type (e.g. WIREGUARD, UID), name, enabled, metadata.origin.",
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
      outputSchema: listVpnServersOutputSchema,
      annotations: READ_ONLY,
    },
    async ({ siteId, offset, limit, filter }) => {
      try {
        const query = buildQuery({ offset, limit, filter });
        const data = await client.get(`/sites/${siteId}/vpn/servers${query}`);
        return formatSuccess(data, { structured: true });
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.registerTool(
    "unifi_list_radius_profiles",
    {
      description: "List RADIUS profiles (auth/accounting server configurations referenced by WiFi WPA-Enterprise, switch 802.1X port auth, VPN). Returns: id, name, metadata (origin, configurable).",
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
      outputSchema: listRadiusProfilesOutputSchema,
      annotations: READ_ONLY,
    },
    async ({ siteId, offset, limit, filter }) => {
      try {
        const query = buildQuery({ offset, limit, filter });
        const data = await client.get(
          `/sites/${siteId}/radius/profiles${query}`
        );
        return formatSuccess(data, { structured: true });
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
      outputSchema: listDeviceTagsOutputSchema,
      annotations: READ_ONLY,
    },
    async ({ siteId, offset, limit, filter }) => {
      try {
        const query = buildQuery({ offset, limit, filter });
        const data = await client.get(`/sites/${siteId}/device-tags${query}`);
        return formatSuccess(data, { structured: true });
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.registerTool(
    "unifi_list_dpi_categories",
    {
      description: "List DPI categories (global, not site-scoped) — high-level traffic groupings like 'Streaming', 'Social Networks', 'Gaming'. Returns: id (numeric), name. Use the category id when building firewall policies that match by category.",
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
      outputSchema: listDpiCategoriesOutputSchema,
      annotations: READ_ONLY,
    },
    async ({ offset, limit, filter }) => {
      try {
        const query = buildQuery({ offset, limit, filter });
        const data = await client.get(`/dpi/categories${query}`);
        return formatSuccess(data, { structured: true });
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.registerTool(
    "unifi_list_dpi_applications",
    {
      description: "List individual DPI applications (global) — specific apps/services like 'Netflix', 'Zoom', 'Steam'. Returns: id (numeric), name. More granular than unifi_list_dpi_categories.",
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
      outputSchema: listDpiApplicationsOutputSchema,
      annotations: READ_ONLY,
    },
    async ({ offset, limit, filter }) => {
      try {
        const query = buildQuery({ offset, limit, filter });
        const data = await client.get(`/dpi/applications${query}`);
        return formatSuccess(data, { structured: true });
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.registerTool(
    "unifi_list_countries",
    {
      description: "List countries/regions (global) for geo-IP firewall rules. Returns: code (ISO alpha-2, e.g. 'US'), name. Use the code when building firewall policies that match by source/destination country.",
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
      outputSchema: listCountriesOutputSchema,
      annotations: READ_ONLY,
    },
    async ({ offset, limit, filter }) => {
      try {
        const query = buildQuery({ offset, limit, filter });
        const data = await client.get(`/countries${query}`);
        return formatSuccess(data, { structured: true });
      } catch (err) {
        return formatError(err);
      }
    }
  );
}
