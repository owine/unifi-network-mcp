/**
 * The request guard: every request NetworkClient makes is checked here before
 * fetch is called, against a fixed allowlist of the endpoints the tools in
 * src/tools/ use. Anything else is refused and nothing is sent, so a tool bug,
 * a smuggled ID or a misled model cannot reach the rest of the console with
 * this API key (the rest of the legacy controller API, Protect, another
 * console behind the Cloud Connector).
 *
 * Paths are canonical and relative to the Network application: they start
 * /integration/v1, /v2/api or /api/s, never with the Cloud Connector prefix,
 * which NetworkClient adds only after the guard has passed.
 */

export type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

const METHODS: readonly string[] = ["GET", "POST", "PUT", "PATCH", "DELETE"];

export type GuardReason = "malformed" | "method" | "not_allowlisted" | "query" | "read_only" | "tool_disabled";

export class GuardError extends Error {
  constructor(readonly reason: GuardReason, message: string) {
    super(`Request refused by the request guard: ${message}`);
    this.name = "GuardError";
  }
}

export interface Route {
  method: Method;
  /** Canonical path; each {id} is one ID segment. */
  template: string;
  /** Query parameters the endpoint may be sent; any other is refused. */
  query?: readonly string[];
  /** Query parameters that must be present. */
  requiredQuery?: readonly string[];
  /**
   * The write tools that send this request. A route without tools is a read,
   * allowed whatever write tools are enabled — including stat/session's POST,
   * which only queries statistics.
   */
  tools?: readonly string[];
}

export interface GuardPolicy {
  readOnly: boolean;
  /** Enabled write tools; undefined enables every write tool. */
  writeTools?: readonly string[];
}

// The charset resourceId() and the site-reference check allow. "ordering" is
// never an ID, in any case: excluding it keeps /policies/{id} and /acl-rules/{id} from also
// matching the ordering endpoints, which belong to other tools.
const ID = "(?![Oo][Rr][Dd][Ee][Rr][Ii][Nn][Gg](?:/|$))[A-Za-z0-9_-]{1,64}";

const PAGE = ["offset", "limit", "filter"] as const;
const ZONE_PAIR = ["sourceFirewallZoneId", "destinationFirewallZoneId"] as const;

const v1 = (template: string) => `/integration/v1${template}`;

/** Every request the tools make. Keep in step with src/tools/; tests/guard.test.ts sweeps every tool against it. */
export const ROUTES: readonly Route[] = [
  // System, sites, supporting
  { method: "GET", template: v1("/info") },
  { method: "GET", template: v1("/sites"), query: PAGE },
  { method: "GET", template: v1("/sites/{id}/wans"), query: PAGE },
  { method: "GET", template: v1("/sites/{id}/vpn/site-to-site-tunnels"), query: PAGE },
  { method: "GET", template: v1("/sites/{id}/vpn/servers"), query: PAGE },
  { method: "GET", template: v1("/sites/{id}/radius/profiles"), query: PAGE },
  { method: "GET", template: v1("/sites/{id}/device-tags"), query: PAGE },
  { method: "GET", template: v1("/dpi/categories"), query: PAGE },
  { method: "GET", template: v1("/dpi/applications"), query: PAGE },
  { method: "GET", template: v1("/countries"), query: PAGE },

  // Devices
  { method: "GET", template: v1("/sites/{id}/devices"), query: PAGE },
  { method: "GET", template: v1("/sites/{id}/devices/{id}") },
  { method: "GET", template: v1("/sites/{id}/devices/{id}/statistics/latest") },
  { method: "GET", template: v1("/pending-devices"), query: PAGE },
  { method: "POST", template: v1("/sites/{id}/devices"), tools: ["unifi_adopt_device"] },
  { method: "DELETE", template: v1("/sites/{id}/devices/{id}"), tools: ["unifi_remove_device"] },
  { method: "POST", template: v1("/sites/{id}/devices/{id}/actions"), tools: ["unifi_restart_device"] },
  { method: "POST", template: v1("/sites/{id}/devices/{id}/interfaces/ports/{id}/actions"), tools: ["unifi_power_cycle_port"] },

  // Clients
  { method: "GET", template: v1("/sites/{id}/clients"), query: PAGE },
  { method: "GET", template: v1("/sites/{id}/clients/{id}") },
  { method: "POST", template: v1("/sites/{id}/clients/{id}/actions"), tools: ["unifi_authorize_guest", "unifi_unauthorize_guest"] },

  // Client history: controller routes outside the Integration API
  { method: "GET", template: "/v2/api/site/{id}/clients/history", query: ["withinHours"], requiredQuery: ["withinHours"] },
  { method: "POST", template: "/api/s/{id}/stat/session" },

  // Classic controller API: whole collections, read only
  { method: "GET", template: "/api/s/{id}/rest/networkconf" }, // unifi_list_classic_networks
  { method: "GET", template: "/api/s/{id}/rest/firewallgroup" }, // unifi_list_firewall_groups
  { method: "GET", template: "/api/s/{id}/rest/firewallrule" }, // unifi_list_legacy_firewall_rules

  // Networks
  { method: "GET", template: v1("/sites/{id}/networks"), query: PAGE },
  { method: "GET", template: v1("/sites/{id}/networks/{id}") },
  { method: "GET", template: v1("/sites/{id}/networks/{id}/references") },
  { method: "POST", template: v1("/sites/{id}/networks"), tools: ["unifi_create_network"] },
  { method: "PUT", template: v1("/sites/{id}/networks/{id}"), tools: ["unifi_update_network"] },
  { method: "DELETE", template: v1("/sites/{id}/networks/{id}"), query: ["force"], tools: ["unifi_delete_network"] },

  // WiFi
  { method: "GET", template: v1("/sites/{id}/wifi/broadcasts"), query: PAGE },
  { method: "GET", template: v1("/sites/{id}/wifi/broadcasts/{id}") },
  { method: "POST", template: v1("/sites/{id}/wifi/broadcasts"), tools: ["unifi_create_wifi"] },
  { method: "PUT", template: v1("/sites/{id}/wifi/broadcasts/{id}"), tools: ["unifi_update_wifi"] },
  { method: "DELETE", template: v1("/sites/{id}/wifi/broadcasts/{id}"), query: ["force"], tools: ["unifi_delete_wifi"] },

  // Hotspot vouchers
  { method: "GET", template: v1("/sites/{id}/hotspot/vouchers"), query: PAGE },
  { method: "GET", template: v1("/sites/{id}/hotspot/vouchers/{id}") },
  { method: "POST", template: v1("/sites/{id}/hotspot/vouchers"), tools: ["unifi_create_voucher"] },
  { method: "DELETE", template: v1("/sites/{id}/hotspot/vouchers/{id}"), tools: ["unifi_delete_voucher"] },
  { method: "DELETE", template: v1("/sites/{id}/hotspot/vouchers"), query: ["filter"], requiredQuery: ["filter"], tools: ["unifi_bulk_delete_vouchers"] },

  // Firewall zones and policies
  { method: "GET", template: v1("/sites/{id}/firewall/zones"), query: PAGE },
  { method: "GET", template: v1("/sites/{id}/firewall/zones/{id}") },
  { method: "POST", template: v1("/sites/{id}/firewall/zones"), tools: ["unifi_create_firewall_zone"] },
  { method: "PUT", template: v1("/sites/{id}/firewall/zones/{id}"), tools: ["unifi_update_firewall_zone"] },
  { method: "DELETE", template: v1("/sites/{id}/firewall/zones/{id}"), tools: ["unifi_delete_firewall_zone"] },
  { method: "GET", template: v1("/sites/{id}/firewall/policies"), query: PAGE },
  { method: "GET", template: v1("/sites/{id}/firewall/policies/{id}") },
  { method: "GET", template: v1("/sites/{id}/firewall/policies/ordering"), query: ZONE_PAIR, requiredQuery: ZONE_PAIR },
  { method: "POST", template: v1("/sites/{id}/firewall/policies"), tools: ["unifi_create_firewall_policy"] },
  { method: "PUT", template: v1("/sites/{id}/firewall/policies/{id}"), tools: ["unifi_update_firewall_policy"] },
  { method: "PATCH", template: v1("/sites/{id}/firewall/policies/{id}"), tools: ["unifi_patch_firewall_policy"] },
  { method: "DELETE", template: v1("/sites/{id}/firewall/policies/{id}"), tools: ["unifi_delete_firewall_policy"] },
  { method: "PUT", template: v1("/sites/{id}/firewall/policies/ordering"), query: ZONE_PAIR, requiredQuery: ZONE_PAIR, tools: ["unifi_reorder_firewall_policies"] },

  // ACL rules
  { method: "GET", template: v1("/sites/{id}/acl-rules"), query: PAGE },
  { method: "GET", template: v1("/sites/{id}/acl-rules/{id}") },
  { method: "GET", template: v1("/sites/{id}/acl-rules/ordering") },
  { method: "POST", template: v1("/sites/{id}/acl-rules"), tools: ["unifi_create_acl_rule"] },
  { method: "PUT", template: v1("/sites/{id}/acl-rules/{id}"), tools: ["unifi_update_acl_rule"] },
  { method: "DELETE", template: v1("/sites/{id}/acl-rules/{id}"), tools: ["unifi_delete_acl_rule"] },
  { method: "PUT", template: v1("/sites/{id}/acl-rules/ordering"), tools: ["unifi_reorder_acl_rules"] },

  // Switching
  { method: "GET", template: v1("/sites/{id}/switching/switch-stacks"), query: PAGE },
  { method: "GET", template: v1("/sites/{id}/switching/switch-stacks/{id}") },
  { method: "GET", template: v1("/sites/{id}/switching/mc-lag-domains"), query: PAGE },
  { method: "GET", template: v1("/sites/{id}/switching/mc-lag-domains/{id}") },
  { method: "GET", template: v1("/sites/{id}/switching/lags"), query: PAGE },
  { method: "GET", template: v1("/sites/{id}/switching/lags/{id}") },

  // DNS policies
  { method: "GET", template: v1("/sites/{id}/dns/policies"), query: PAGE },
  { method: "GET", template: v1("/sites/{id}/dns/policies/{id}") },
  { method: "POST", template: v1("/sites/{id}/dns/policies"), tools: ["unifi_create_dns_policy"] },
  { method: "PUT", template: v1("/sites/{id}/dns/policies/{id}"), tools: ["unifi_update_dns_policy"] },
  { method: "DELETE", template: v1("/sites/{id}/dns/policies/{id}"), tools: ["unifi_delete_dns_policy"] },

  // Traffic matching lists
  { method: "GET", template: v1("/sites/{id}/traffic-matching-lists"), query: PAGE },
  { method: "GET", template: v1("/sites/{id}/traffic-matching-lists/{id}") },
  { method: "POST", template: v1("/sites/{id}/traffic-matching-lists"), tools: ["unifi_create_traffic_matching_list"] },
  { method: "PUT", template: v1("/sites/{id}/traffic-matching-lists/{id}"), tools: ["unifi_update_traffic_matching_list"] },
  { method: "DELETE", template: v1("/sites/{id}/traffic-matching-lists/{id}"), tools: ["unifi_delete_traffic_matching_list"] },
];

const COMPILED = ROUTES.map((route) => ({
  route,
  pattern: new RegExp(`^${route.template.replaceAll("{id}", ID)}$`),
}));

/**
 * Check one request and return the route it matched. Throws GuardError,
 * before anything is sent, for a malformed path, an unknown endpoint, an
 * unexpected query parameter, or a write the policy does not allow.
 */
export function guardRequest(method: string, path: string, policy: GuardPolicy): Route {
  if (!METHODS.includes(method)) {
    throw new GuardError("method", `method ${JSON.stringify(method)} is not used by any tool`);
  }
  const queryStart = path.indexOf("?");
  const pathname = queryStart === -1 ? path : path.slice(0, queryStart);
  const query = queryStart === -1 ? "" : path.slice(queryStart + 1);
  // URL parsing would fold `..`, `\` and encoded segments out of the path, and
  // `#` truncates it; `;` carries path parameters some servers honour. The
  // tools never need any of these in a path, so refuse rather than normalise.
  // eslint-disable-next-line no-control-regex
  if (/\.\.|\/\/|%|\\|;|#|[\u0000-\u001f\u007f]/.test(pathname) || /#|[\u0000-\u001f\u007f]/.test(query)) {
    throw new GuardError("malformed", `path ${JSON.stringify(pathname)} contains a sequence no tool sends`);
  }
  const match = COMPILED.find(({ route, pattern }) => route.method === method && pattern.test(pathname));
  if (!match) {
    throw new GuardError("not_allowlisted", `${method} ${pathname} is not an endpoint any tool uses`);
  }
  const { route } = match;
  const keys = [...new URLSearchParams(query).keys()];
  const unexpected = keys.filter((key) => !(route.query ?? []).includes(key));
  if (unexpected.length > 0) {
    throw new GuardError("query", `${method} ${pathname} does not take ${unexpected.join(", ")}`);
  }
  const missing = (route.requiredQuery ?? []).filter((key) => !keys.includes(key));
  if (missing.length > 0) {
    throw new GuardError("query", `${method} ${pathname} needs ${missing.join(", ")}`);
  }
  if (route.tools !== undefined) {
    if (policy.readOnly) {
      throw new GuardError("read_only", `${method} ${pathname} is a write, and the server is read-only`);
    }
    const enabled = policy.writeTools;
    if (enabled !== undefined && !route.tools.some((tool) => enabled.includes(tool))) {
      throw new GuardError("tool_disabled", `${method} ${pathname} belongs to ${route.tools.join(", ")}, which UNIFI_NETWORK_WRITE_TOOLS does not enable`);
    }
  }
  return route;
}
