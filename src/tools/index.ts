import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { NetworkClient, withCallSignal } from "../client.js";
import { registerSystemTools } from "./system.js";
import { registerSiteTools } from "./sites.js";
import { registerDeviceTools } from "./devices.js";
import { registerClientTools } from "./clients.js";
import { registerClientHistoryTools } from "./client-history.js";
import { registerNetworkTools } from "./networks.js";
import { registerWifiTools } from "./wifi.js";
import { registerHotspotTools } from "./hotspot.js";
import { registerFirewallTools } from "./firewall.js";
import { registerAclTools } from "./acl.js";
import { registerDnsPolicyTools } from "./dns-policies.js";
import { registerTrafficMatchingTools } from "./traffic-matching.js";
import { registerSwitchingTools } from "./switching.js";
import { registerSupportingTools } from "./supporting.js";

export function registerAllTools(
  server: McpServer,
  client: NetworkClient,
  readOnly = false
) {
  server = withCancellation(server);
  registerSystemTools(server, client);
  registerSiteTools(server, client);
  registerDeviceTools(server, client, readOnly);
  registerClientTools(server, client, readOnly);
  registerClientHistoryTools(server, client);
  registerNetworkTools(server, client, readOnly);
  registerWifiTools(server, client, readOnly);
  registerHotspotTools(server, client, readOnly);
  registerFirewallTools(server, client, readOnly);
  registerAclTools(server, client, readOnly);
  registerDnsPolicyTools(server, client, readOnly);
  registerTrafficMatchingTools(server, client, readOnly);
  registerSwitchingTools(server, client);
  registerSupportingTools(server, client);
}

/**
 * A view of server whose tool handlers run with their call's abort signal in
 * scope, so NetworkClient aborts the controller request when the MCP client
 * cancels the call. The SDK passes that signal in `extra`, the handler's last
 * argument; wrapping here saves threading it through every handler.
 */
function withCancellation(server: McpServer): McpServer {
  const registerTool = (name: string, config: object, handler: (...args: unknown[]) => unknown) =>
    server.registerTool(name, config as never, ((...args: unknown[]) => {
      const extra = args.at(-1) as { signal?: unknown } | undefined;
      const signal = extra?.signal instanceof AbortSignal ? extra.signal : undefined;
      return withCallSignal(signal, () => handler(...args));
    }) as never);
  return new Proxy(server, {
    get: (target, prop, receiver) =>
      prop === "registerTool" ? registerTool : Reflect.get(target, prop, receiver),
  });
}
