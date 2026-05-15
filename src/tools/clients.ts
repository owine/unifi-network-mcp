import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { NetworkClient } from "../client.js";
import { formatSuccess, formatError } from "../utils/responses.js";
import { buildQuery } from "../utils/query.js";
import { READ_ONLY, WRITE_NOT_IDEMPOTENT, WRITE, formatDryRun } from "../utils/safety.js";

export function registerClientTools(
  server: McpServer,
  client: NetworkClient,
  readOnly = false
) {
  server.registerTool(
    "unifi_list_clients",
    {
      description: "List currently connected clients at a site. Returns per client (shape varies by type): id, name, type (WIRED/WIRELESS/VPN/TELEPORT), macAddress, ipAddress, connectedAt, uplinkDeviceId (the switch/AP they're attached to), access (object with type). WIRELESS and WIRED variants include their own connection details (signal/channel for wireless, port binding for wired) — call the tool and inspect by type for exact fields. Use for: who's online right now. Disconnected/historical clients are NOT in the Integration API.",
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
        filter: z.string().optional().describe("Filter expression"),
      },
      annotations: READ_ONLY,
    },
    async ({ siteId, offset, limit, filter }) => {
      try {
        const query = buildQuery({ offset, limit, filter });
        const data = await client.get(`/sites/${siteId}/clients${query}`);
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.registerTool(
    "unifi_get_client",
    {
      description: "Get a specific connected client by ID. Returns same shape as unifi_list_clients entries.",
      inputSchema: {
        siteId: z.string().describe("Site ID"),
        clientId: z.string().describe("Client ID"),
      },
      annotations: READ_ONLY,
    },
    async ({ siteId, clientId }) => {
      try {
        const data = await client.get(`/sites/${siteId}/clients/${clientId}`);
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  if (readOnly) return;

  server.registerTool(
    "unifi_authorize_guest",
    {
      description: "Authorize a guest client through a captive-portal hotspot. Optional limits override hotspot defaults. Idempotency: not safe to retry — re-authorizing extends the session.",
      inputSchema: {
        siteId: z.string().describe("Site ID"),
        clientId: z.string().describe("Client ID"),
        timeLimitMinutes: z
          .number()
          .int()
          .min(1)
          .max(1000000)
          .optional()
          .describe("How long (in minutes) the guest will be authorized (1-1000000)"),
        dataUsageLimitMBytes: z
          .number()
          .int()
          .min(1)
          .max(1048576)
          .optional()
          .describe("Data usage limit in megabytes (1-1048576)"),
        rxRateLimitKbps: z
          .number()
          .int()
          .min(2)
          .max(100000)
          .optional()
          .describe("Download rate limit in kilobits per second (2-100000)"),
        txRateLimitKbps: z
          .number()
          .int()
          .min(2)
          .max(100000)
          .optional()
          .describe("Upload rate limit in kilobits per second (2-100000)"),
        dryRun: z.boolean().optional().describe("Preview this action without executing it"),
      },
      annotations: WRITE_NOT_IDEMPOTENT,
    },
    async ({
      siteId,
      clientId,
      timeLimitMinutes,
      dataUsageLimitMBytes,
      rxRateLimitKbps,
      txRateLimitKbps,
      dryRun,
    }) => {
      const body: Record<string, unknown> = {
        action: "AUTHORIZE_GUEST_ACCESS",
      };
      if (timeLimitMinutes !== undefined)
        body.timeLimitMinutes = timeLimitMinutes;
      if (dataUsageLimitMBytes !== undefined)
        body.dataUsageLimitMBytes = dataUsageLimitMBytes;
      if (rxRateLimitKbps !== undefined)
        body.rxRateLimitKbps = rxRateLimitKbps;
      if (txRateLimitKbps !== undefined)
        body.txRateLimitKbps = txRateLimitKbps;

      if (dryRun) return formatDryRun("POST", `/sites/${siteId}/clients/${clientId}/actions`, body);

      try {
        const data = await client.post(
          `/sites/${siteId}/clients/${clientId}/actions`,
          body
        );
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.registerTool(
    "unifi_unauthorize_guest",
    {
      description: "Revoke guest authorization; the client returns to the captive portal on next request. Idempotent.",
      inputSchema: {
        siteId: z.string().describe("Site ID"),
        clientId: z.string().describe("Client ID"),
        dryRun: z.boolean().optional().describe("Preview this action without executing it"),
      },
      annotations: WRITE,
    },
    async ({ siteId, clientId, dryRun }) => {
      const body = { action: "UNAUTHORIZE_GUEST_ACCESS" };

      if (dryRun) return formatDryRun("POST", `/sites/${siteId}/clients/${clientId}/actions`, body);

      try {
        const data = await client.post(
          `/sites/${siteId}/clients/${clientId}/actions`,
          body
        );
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );
}
