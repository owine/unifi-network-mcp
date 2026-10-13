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
      description: "Get UniFi Network application info. Returns: applicationVersion only — the Integration API returns no isUniFiOSConsole or other field here. Use for: checking the Network version when a tool's description notes version-specific behaviour.",
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
