import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { NetworkClient, withCallSignal } from "../client.js";
import { looseOutput } from "../utils/output-schemas.js";
import { WRITE_TOOLS } from "../write-tools.js";
import { DEFAULT_WAN_POLICY, type WanPolicy } from "../utils/wan-exposure.js";
import type { WriteLog } from "../write-log.js";
import { registerSystemTools } from "./system.js";
import { registerSiteTools } from "./sites.js";
import { registerDeviceTools } from "./devices.js";
import { registerClientTools } from "./clients.js";
import { registerClientHistoryTools } from "./client-history.js";
import { registerClassicTools } from "./classic.js";
import { registerNetworkTools } from "./networks.js";
import { registerWifiTools } from "./wifi.js";
import { registerHotspotTools } from "./hotspot.js";
import { registerFirewallTools } from "./firewall.js";
import { registerAclTools } from "./acl.js";
import { registerDnsPolicyTools } from "./dns-policies.js";
import { registerTrafficMatchingTools } from "./traffic-matching.js";
import { registerSwitchingTools } from "./switching.js";
import { registerSupportingTools } from "./supporting.js";

export interface ToolOptions {
  /** The write tools to register (UNIFI_NETWORK_WRITE_TOOLS); undefined registers them all. */
  writeTools?: readonly string[];
  /** WAN-exposure refusals (UNIFI_NETWORK_ALLOW_WAN_EXPOSURE, UNIFI_NETWORK_WAN_ZONE_IDS); on by default. */
  wan?: WanPolicy;
  /** UNIFI_NETWORK_WRITE_LOG; every write tool call appends a line. */
  writeLog?: WriteLog;
}

export function registerAllTools(
  server: McpServer,
  client: NetworkClient,
  readOnly = false,
  options: ToolOptions = {}
) {
  server = instrumentTools(server, options);
  const wan = options.wan ?? DEFAULT_WAN_POLICY;
  registerSystemTools(server, client);
  registerSiteTools(server, client);
  registerDeviceTools(server, client, readOnly);
  registerClientTools(server, client, readOnly);
  registerClientHistoryTools(server, client);
  registerClassicTools(server, client);
  registerNetworkTools(server, client, readOnly, wan);
  registerWifiTools(server, client, readOnly);
  registerHotspotTools(server, client, readOnly);
  registerFirewallTools(server, client, readOnly, wan);
  registerAclTools(server, client, readOnly);
  registerDnsPolicyTools(server, client, readOnly);
  registerTrafficMatchingTools(server, client, readOnly, wan);
  registerSwitchingTools(server, client);
  registerSupportingTools(server, client);
}

/**
 * A view of server that applies these rules to every tool it registers, so no
 * tool module can forget them:
 *
 * - Handlers run with their call's abort signal in scope, so NetworkClient
 *   aborts the controller request when the MCP client cancels the call. The
 *   SDK passes that signal in `extra`, the handler's last argument.
 * - Each tool gets a human-readable title derived from its name.
 * - A write tool the operator did not enable (UNIFI_NETWORK_WRITE_TOOLS) is
 *   not registered at all. A write tool missing from WRITE_TOOL_GROUPS, or a
 *   read tool listed there, is a bug: registration throws.
 * - With a write log, every write tool call is recorded in it.
 * - The outputSchema is published as a loose object. The SDK client validates
 *   structuredContent against the published JSON Schema, and tools pass the
 *   controller's response through; a raw shape publishes
 *   additionalProperties: false, so the first field a firmware update added
 *   would make the tool fail for every client that validates.
 */
function instrumentTools(server: McpServer, { writeTools, writeLog }: ToolOptions): McpServer {
  const registerTool = (
    name: string,
    config: { title?: string; outputSchema?: z.ZodRawShape | z.ZodObject; annotations?: { readOnlyHint?: boolean } },
    handler: (...args: unknown[]) => unknown
  ) => {
    const write = config.annotations?.readOnlyHint === false;
    if (write !== WRITE_TOOLS.includes(name)) {
      throw new Error(`${name} is ${write ? "a write tool missing from" : "a read tool listed in"} WRITE_TOOL_GROUPS (src/write-tools.ts)`);
    }
    if (write && writeTools !== undefined && !writeTools.includes(name)) return undefined;
    return server.registerTool(name, {
      ...config,
      title: config.title ?? toolTitle(name),
      ...(config.outputSchema ? { outputSchema: looseOutput(config.outputSchema) } : {}),
    }, ((...args: unknown[]) => {
      const extra = args.at(-1) as { signal?: unknown } | undefined;
      const signal = extra?.signal instanceof AbortSignal ? extra.signal : undefined;
      const run = () => withCallSignal(signal, () => handler(...args));
      return write && writeLog ? writeLog.record(name, args[0], run) : run();
    }) as never);
  };
  return new Proxy(server, {
    get: (target, prop, receiver) =>
      prop === "registerTool" ? registerTool : (Reflect.get(target, prop, receiver) as unknown),
  });
}

// Words in tool names that read wrongly in plain sentence case.
const TITLE_WORDS: Record<string, string> = {
  acl: "ACL", dns: "DNS", dpi: "DPI", vpn: "VPN", radius: "RADIUS",
  wifi: "WiFi", wan: "WAN", wans: "WANs", lag: "LAG", lags: "LAGs", mc: "MC",
};

/** "unifi_list_mc_lag_domains" → "List MC-LAG domains". */
export function toolTitle(name: string): string {
  const words = name.replace(/^unifi_/, "").split("_").map((word) => TITLE_WORDS[word] ?? word);
  const title = words.join(" ").replace("MC LAG", "MC-LAG");
  return title.charAt(0).toUpperCase() + title.slice(1);
}
