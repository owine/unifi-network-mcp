import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { NetworkClient } from "../client.js";
import { formatSuccess, formatError } from "../utils/responses.js";
import { buildQuery } from "../utils/query.js";
import { READ_ONLY } from "../utils/safety.js";
import { listSitesOutputSchema } from "../utils/output-schemas.js";

export function registerSiteTools(
  server: McpServer,
  client: NetworkClient
) {
  server.registerTool(
    "unifi_list_sites",
    {
      description: "List all sites the API key has access to. Returns: id (the siteId every other tool requires), internalReference, name. Use for: first call in any workflow — almost every other tool needs a siteId.",
      inputSchema: {
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
          .describe("Filter expression. Filterable: id, internalReference, name — eq/ne/in/notIn only (like is rejected). Example: name.eq('Default')"),
      },
      outputSchema: listSitesOutputSchema,
      annotations: READ_ONLY,
    },
    async ({ offset, limit, filter }) => {
      try {
        const query = buildQuery({ offset, limit, filter });
        const data = await client.get(`/sites${query}`);
        return formatSuccess(data, { structured: true });
      } catch (err) {
        return formatError(err);
      }
    }
  );
}
