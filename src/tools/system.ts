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
      description: "Get UniFi Network application info. Returns: applicationVersion, isUniFiOSConsole (true on UDM/UDM-Pro/UNVR, false on standalone Network controller). Use for: capability checks before calling version-gated tools.",
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
