import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { NetworkClient } from "../client.js";
import { formatSuccess, formatError } from "../utils/responses.js";
import { READ_ONLY } from "../utils/safety.js";
import { getInfoOutputSchema } from "../utils/output-schemas.js";

export function registerSystemTools(
  server: McpServer,
  client: NetworkClient
) {
  server.registerTool(
    "unifi_get_info",
    {
      description: "Get UniFi Network application info. Returns: applicationVersion. NOTE: verified against 10.5.43 on a UniFi OS console — the Integration API returns ONLY applicationVersion here; there is no isUniFiOSConsole or other field. Use for: version checks before calling version-gated tools.",
      inputSchema: {},
      outputSchema: getInfoOutputSchema,
      annotations: READ_ONLY,
    },
    async () => {
      try {
        const data = await client.get("/info");
        return formatSuccess(data, { structured: true });
      } catch (err) {
        return formatError(err);
      }
    }
  );
}
