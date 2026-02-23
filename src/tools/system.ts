import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { NetworkClient } from "../client.js";
import { formatSuccess, formatError } from "../utils/responses.js";
import { READ_ONLY } from "../utils/safety.js";

export function registerSystemTools(
  server: McpServer,
  client: NetworkClient
) {
  server.registerTool(
    "unifi_get_info",
    {
      description: "Get application information including version and whether it's a UniFi OS Console",
      inputSchema: {},
      annotations: READ_ONLY,
    },
    async () => {
      try {
        const data = await client.get("/info");
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );
}
