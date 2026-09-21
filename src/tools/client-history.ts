import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { NetworkClient } from "../client.js";
import { formatSuccess, formatError } from "../utils/responses.js";
import { READ_ONLY } from "../utils/safety.js";

const siteReference = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/)
  .describe("Site internalReference from unifi_list_sites (often default), not the Integration API UUID");
const historyClient = z.object({
  mac: z.string(), hostname: z.string().nullish(), display_name: z.string().nullish(),
  first_seen: z.number().optional(), last_seen: z.number().optional(),
  is_wired: z.boolean().optional(), status: z.string().optional(),
}).passthrough();
const session = z.object({
  _id: z.string(), mac: z.string(), assoc_time: z.number(), duration: z.number().optional(),
  rx_bytes: z.number().optional(), tx_bytes: z.number().optional(),
  hostname: z.string().nullish(), is_wired: z.boolean().optional(),
  roaming_sessions: z.array(z.unknown()).optional(),
}).passthrough();
const sessionEnvelope = z.object({ meta: z.object({ rc: z.literal("ok") }).passthrough(), data: z.array(session) });

export function registerClientHistoryTools(server: McpServer, client: NetworkClient) {
  server.registerTool("unifi_list_client_history", {
    description: "List historical/offline client inventory using the controller v2 API. Includes names, MACs, first_seen and last_seen epoch seconds when available. This is inventory, not session history; use unifi_list_client_sessions for past connections. Requires controller history API-key support; errors never mean zero activity. Retention depends on the controller.",
    inputSchema: { siteReference, withinHours: z.number().int().min(1).max(8760).default(168).describe("Lookback in hours, up to one year; does not extend controller retention") },
    outputSchema: { data: z.array(historyClient), count: z.number(), withinHours: z.number(), coverage: z.string() },
    annotations: READ_ONLY,
  }, async ({ siteReference, withinHours }) => {
    try {
      const data = z.array(historyClient).parse(await client.getClientHistory(siteReference, withinHours));
      return formatSuccess({ data, count: data.length, withinHours, coverage: "Historical client inventory returned by the controller; not a complete session log." }, { structured: true });
    } catch (err) { return formatError(err); }
  });

  server.registerTool("unifi_list_client_sessions", {
    description: "Read retained past client connections, including disconnected clients, from the controller stat/session query endpoint. POST here only reads statistics. Returns controller session IDs, MACs, assoc_time (epoch seconds), duration (seconds), rx_bytes/tx_bytes (controller perspective), and roaming_sessions when available. Use an explicit UTC epoch-second window (max 31 days). If mayBeTruncated is true, split the time window (overlap boundaries and deduplicate IDs) or filter by MAC. The controller ignores offset pagination. Records reflect controller retention and may omit ongoing sessions. Wi-Fi association/bytes do not establish end-to-end Internet success. Do not interpret controller is_guest as proof of a person's identity or ownership.",
    inputSchema: {
      siteReference,
      start: z.number().int().min(0).max(4102444800).describe("Start Unix epoch seconds, not milliseconds"),
      end: z.number().int().min(1).max(4102444800).describe("End Unix epoch seconds; after start and at most 31 days later"),
      mac: z.string().regex(/^([\da-f]{2}:){5}[\da-f]{2}$/i).optional().describe("Optional client MAC address"),
      limit: z.number().int().min(1).max(1000).default(1000).describe("Maximum records; a full result requires a narrower window or MAC filter"),
    },
    outputSchema: { data: z.array(session), count: z.number(), limit: z.number(), mayBeTruncated: z.boolean(), start: z.number(), end: z.number(), coverage: z.string() },
    annotations: READ_ONLY,
  }, async ({ siteReference, start, end, limit, mac }) => {
    try {
      if (end <= start || end - start > 31 * 86400) throw new Error("Use an increasing time window of at most 31 days");
      const { data } = sessionEnvelope.parse(await client.getClientSessions(siteReference, { start, end, limit, mac }));
      if (data.length > limit || new Set(data.map(row => row._id)).size !== data.length) {
        throw new Error("Controller returned inconsistent session results");
      }
      const mayBeTruncated = data.length === limit;
      return formatSuccess({ data, count: data.length, limit, mayBeTruncated, start, end,
        coverage: "Retained controller sessions; A non-truncated response does not prove retention coverage or include every ongoing connection." }, { structured: true });
    } catch (err) { return formatError(err); }
  });
}
