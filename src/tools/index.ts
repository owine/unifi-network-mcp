import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { NetworkClient } from "../client.js";
import { registerSystemTools } from "./system.js";
import { registerSiteTools } from "./sites.js";
import { registerDeviceTools } from "./devices.js";
import { registerClientTools } from "./clients.js";
import { registerNetworkTools } from "./networks.js";
import { registerWifiTools } from "./wifi.js";
import { registerHotspotTools } from "./hotspot.js";
import { registerFirewallTools } from "./firewall.js";
import { registerAclTools } from "./acl.js";
import { registerDnsPolicyTools } from "./dns-policies.js";
import { registerTrafficMatchingTools } from "./traffic-matching.js";
import { registerSupportingTools } from "./supporting.js";

export function registerAllTools(
  server: McpServer,
  client: NetworkClient,
  readOnly = false
) {
  registerSystemTools(server, client);
  registerSiteTools(server, client);
  registerDeviceTools(server, client, readOnly);
  registerClientTools(server, client, readOnly);
  registerNetworkTools(server, client, readOnly);
  registerWifiTools(server, client, readOnly);
  registerHotspotTools(server, client, readOnly);
  registerFirewallTools(server, client, readOnly);
  registerAclTools(server, client, readOnly);
  registerDnsPolicyTools(server, client, readOnly);
  registerTrafficMatchingTools(server, client, readOnly);
  registerSupportingTools(server, client);
}
