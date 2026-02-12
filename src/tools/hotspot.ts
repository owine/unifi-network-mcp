import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { NetworkClient } from "../client.js";
import { formatSuccess, formatError } from "../utils/responses.js";
import { buildQuery } from "../utils/query.js";
import {
  READ_ONLY,
  WRITE_NOT_IDEMPOTENT,
  DESTRUCTIVE,
  formatDryRun,
  requireConfirmation,
} from "../utils/safety.js";

export function registerHotspotTools(
  server: McpServer,
  client: NetworkClient,
  readOnly = false
) {
  server.tool(
    "unifi_list_vouchers",
    "List all hotspot vouchers at a site",
    {
      siteId: z.string().describe("Site ID"),
      offset: z
        .number()
        .int()
        .nonnegative()
        .optional()
        .default(0)
        .describe("Number of records to skip (default: 0)"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(1000)
        .optional()
        .default(100)
        .describe("Number of records to return (default: 100, max: 1000)"),
      filter: z
        .string()
        .optional()
        .describe("Filter expression (e.g., 'expired.eq(true)')"),
    },
    READ_ONLY,
    async ({ siteId, offset, limit, filter }) => {
      try {
        const query = buildQuery({ offset, limit, filter });
        const data = await client.get(
          `/sites/${siteId}/hotspot/vouchers${query}`
        );
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.tool(
    "unifi_get_voucher",
    "Get a specific hotspot voucher by ID",
    {
      siteId: z.string().describe("Site ID"),
      voucherId: z.string().describe("Voucher ID"),
    },
    READ_ONLY,
    async ({ siteId, voucherId }) => {
      try {
        const data = await client.get(
          `/sites/${siteId}/hotspot/vouchers/${voucherId}`
        );
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  if (readOnly) return;

  server.tool(
    "unifi_create_voucher",
    "Create hotspot vouchers",
    {
      siteId: z.string().describe("Site ID"),
      name: z
        .string()
        .describe("Voucher note/name (duplicated across all generated vouchers)"),
      timeLimitMinutes: z
        .number()
        .int()
        .min(1)
        .max(1000000)
        .describe("How long the voucher provides access (1-1000000 minutes)"),
      count: z
        .number()
        .int()
        .min(1)
        .max(1000)
        .optional()
        .default(1)
        .describe("Number of vouchers to create (1-1000, default: 1)"),
      authorizedGuestLimit: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe("How many guests can use this voucher"),
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
        .describe("Download rate limit in kbps (2-100000)"),
      txRateLimitKbps: z
        .number()
        .int()
        .min(2)
        .max(100000)
        .optional()
        .describe("Upload rate limit in kbps (2-100000)"),
      dryRun: z
        .boolean()
        .optional()
        .describe("Preview this action without executing it"),
    },
    WRITE_NOT_IDEMPOTENT,
    async ({
      siteId,
      name,
      timeLimitMinutes,
      count,
      authorizedGuestLimit,
      dataUsageLimitMBytes,
      rxRateLimitKbps,
      txRateLimitKbps,
      dryRun,
    }) => {
      try {
        const body: Record<string, unknown> = {
          name,
          timeLimitMinutes,
        };
        if (count !== undefined) body.count = count;
        if (authorizedGuestLimit !== undefined)
          body.authorizedGuestLimit = authorizedGuestLimit;
        if (dataUsageLimitMBytes !== undefined)
          body.dataUsageLimitMBytes = dataUsageLimitMBytes;
        if (rxRateLimitKbps !== undefined) body.rxRateLimitKbps = rxRateLimitKbps;
        if (txRateLimitKbps !== undefined) body.txRateLimitKbps = txRateLimitKbps;

        if (dryRun)
          return formatDryRun("POST", `/sites/${siteId}/hotspot/vouchers`, body);
        const data = await client.post(
          `/sites/${siteId}/hotspot/vouchers`,
          body
        );
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.tool(
    "unifi_delete_voucher",
    "DESTRUCTIVE: Delete a hotspot voucher",
    {
      siteId: z.string().describe("Site ID"),
      voucherId: z.string().describe("Voucher ID"),
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
    async ({ siteId, voucherId, confirm, dryRun }) => {
      const guard = requireConfirmation(confirm, "This will permanently delete the voucher");
      if (guard) return guard;

      try {
        const path = `/sites/${siteId}/hotspot/vouchers/${voucherId}`;
        if (dryRun) return formatDryRun("DELETE", path);
        const data = await client.delete(path);
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.tool(
    "unifi_bulk_delete_vouchers",
    "DESTRUCTIVE: Bulk delete hotspot vouchers based on filter criteria",
    {
      siteId: z.string().describe("Site ID"),
      filter: z
        .string()
        .describe(
          "Required filter expression (e.g., 'expired.eq(true)', 'name.like(guest*)')"
        ),
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
    async ({ siteId, filter, confirm, dryRun }) => {
      try {
        const guard = requireConfirmation(
          confirm,
          "This will delete all vouchers matching the filter"
        );
        if (guard) return guard;

        const query = buildQuery({ filter });
        const path = `/sites/${siteId}/hotspot/vouchers${query}`;
        if (dryRun) return formatDryRun("DELETE", path);
        const data = await client.delete(path);
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );
}
