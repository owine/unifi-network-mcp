# UniFi Network MCP Server

An MCP (Model Context Protocol) server that exposes the UniFi Network Integration API as tools for Claude Code and other MCP clients. Provides 76 tools for managing sites, devices, clients, networks, WiFi, firewalls, ACLs, switching, DNS policies, hotspot vouchers, VPNs, and more.

## Prerequisites

- Node.js 22.13+ or 24 (see `engines` in `package.json`)
- A UniFi Network console with the Integration API enabled
- An API key generated from your UniFi Network console (see [Choosing an API key](#choosing-an-api-key))

## Setup

### Quick start (npx)

Add to Claude Code with a single command — no clone or build needed:

```bash
claude mcp add-json unifi-network '{"command":"npx","args":["-y","@owine/unifi-network-mcp@latest"],"env":{"UNIFI_NETWORK_HOST":"192.168.1.1","UNIFI_NETWORK_API_KEY":"your-api-key"}}' -s user
```

Use `-s user` for global availability across all projects, or `-s project` for the current project only.

`@latest` runs the newest release every time the server starts, including a new major version. To take fixes but choose when to make breaking upgrades, pin the major version instead (for example `@owine/unifi-network-mcp@3`).

### From source

If you prefer to build locally, this project uses pnpm via Corepack — use `pnpm install`, not `npm install`, which ignores `pnpm-lock.yaml` and resolves different dependency versions:

```bash
git clone https://github.com/owine/unifi-network-mcp.git
cd unifi-network-mcp
corepack enable
pnpm install
pnpm run build
```

Then add to Claude Code:

```bash
claude mcp add-json unifi-network '{"command":"node","args":["/path/to/unifi-network-mcp/dist/index.js"],"env":{"UNIFI_NETWORK_HOST":"192.168.1.1","UNIFI_NETWORK_API_KEY":"your-api-key"}}' -s user
```

### Upgrading from 2.x

3.0 tightens several defaults. Most setups need no change; check these:

- **Cloud Connector with `UNIFI_NETWORK_VERIFY_SSL=false`**: the server now refuses to start with `UNIFI_NETWORK_HOST=api.ui.com` and verification off. Unset `UNIFI_NETWORK_VERIFY_SSL`.
- **Writes that open access need `confirm: true`**: creating or switching a firewall policy or ACL rule to ALLOW, disabling a blocking policy or rule, creating an open SSID or changing an SSID's security type, and creating more than 10 vouchers at once. Without it the tool returns an error naming the change, and the agent can ask you before re-invoking.
- **IDs must be IDs**: ID inputs accept only letters, digits, `-` and `_` (pass the IDs that list and get tools return).
- **Smaller default results**: `unifi_list_client_sessions` defaults to 100 rows (was 1000), `unifi_list_vouchers` to 25 (was 100), and `unifi_list_client_history` now returns at most `limit` clients (default 100, max 500), most recently seen first, with `totalCount` and `truncated`. Rows from both history tools carry only the fields their tool descriptions list.
- **Compact text output**: tool results are compact JSON rather than indented; `structuredContent` is unchanged.

One rule is relaxed: a `dryRun: true` preview of a destructive tool no longer needs `confirm`.

### Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `UNIFI_NETWORK_HOST` | Yes | — | IP or hostname of your UniFi Network console |
| `UNIFI_NETWORK_API_KEY` | Yes | — | API key from Network integration settings |
| `UNIFI_NETWORK_VERIFY_SSL` | No | `true` | Set to `false` to skip TLS certificate verification for a console with a self-signed certificate. Not allowed with `api.ui.com` |
| `UNIFI_NETWORK_READ_ONLY` | No | `true` | Set to `false` to enable write/mutating tools (read-only by default) |
| `UNIFI_NETWORK_CONSOLE_ID` | No | — | Cloud Connector console ID; used only when `UNIFI_NETWORK_HOST` is `api.ui.com` (see [Cloud Connector](#cloud-connector)) |

UniFi consoles ship with a self-signed certificate, so against a local console the first call usually fails with a certificate error that names `UNIFI_NETWORK_VERIFY_SSL`. Setting it to `false` turns off certificate checks for the whole server process: anyone who can intercept traffic between this machine and the console can then read the API key. Only do this on a network you trust.

### Choosing an API key

The key carries the rights of the admin who created it, and this server is driven by a model that reads data other people control (client hostnames, device names). Create the key as a dedicated admin with the least role that covers your use: for the default read-only mode, a **View Only** admin, so nothing can be changed even if a tool were misused. Use a full-access admin only when you set `UNIFI_NETWORK_READ_ONLY=false`.

### Manual Configuration

Alternatively, add to your `~/.claude.json` under the top-level `"mcpServers"` key:

```json
{
  "mcpServers": {
    "unifi-network": {
      "command": "npx",
      "args": ["-y", "@owine/unifi-network-mcp@latest"],
      "env": {
        "UNIFI_NETWORK_HOST": "192.168.1.1",
        "UNIFI_NETWORK_API_KEY": "your-api-key"
      }
    }
  }
}
```

## Safety Features

This server provides layered safety controls for responsible operation:

- **Tool annotations** — Every tool declares `readOnlyHint`, `destructiveHint`, and `idempotentHint` so MCP clients (like Claude Code) can make informed confirmation decisions
- **Read-only mode** — Enabled by default. Only read operations (list, get) are registered. Set `UNIFI_NETWORK_READ_ONLY=false` to enable write/mutating tools
- **Destructive tool warnings** — Tools that delete or irreversibly modify resources have descriptions prefixed with `DESTRUCTIVE:` to clearly signal risk
- **Confirmation parameter** — Every tool marked `DESTRUCTIVE:` (all 10 of them, including `unifi_remove_device` and `unifi_bulk_delete_vouchers`) requires an explicit `confirm: true` parameter for the call to succeed. A `dryRun: true` preview does not need it, since it changes nothing
- **Confirmation for changes that open access** — Some routine write tools ask for `confirm: true` only when a particular change lets traffic or guests in: a firewall policy or ACL rule that ALLOWs traffic (created, or switched to ALLOW), disabling a policy or rule that blocks, creating an open SSID or changing an SSID's security type, and creating more than 10 vouchers at once. Without it the call returns an error naming the change; a dry run never needs it
- **Dry-run support** — All 33 write tools accept an optional `dryRun: true` parameter that returns a preview of the HTTP request (method, path, body) without making any changes
- **Safe partial updates** — The UniFi PUT endpoints for WiFi broadcasts, networks, firewall policies, ACL rules and DNS policies replace the whole resource, and some fields reset when omitted (a missing `dhcpGuarding` disables DHCP guarding). Their update tools read the current resource, keep every documented body field, and overlay only what you pass, so a one-field change never resets the rest. Pass `null` to clear an optional field. The dry-run preview shows the merged body (the read still happens)
- **Secret redaction** — WiFi passphrases (including per-VLAN PPSK keys) are returned as `[REDACTED]` unless the caller passes `includeSecrets: true` to `unifi_list_wifi` / `unifi_get_wifi`. Write-tool echoes and dry-run previews are always redacted, and an update that echoes back `[REDACTED]` keeps the stored passphrase

## Structured Output

60 of the 76 tools (all 43 read tools, plus the 17 write tools whose API responses return the affected resource) declare an MCP `outputSchema` and return `structuredContent` alongside the usual text content. Clients that understand structured output get typed, machine-readable results instead of parsing JSON out of a text blob.

The schemas live in `src/utils/output-schemas.ts` and are verified against UniFi Network API 11.0.83. They deliberately use a **loose strategy**: every non-key field is optional and nested objects use `.passthrough()`, so firmware- and hardware-specific fields flow through unchanged rather than being stripped or triggering a validation error. This keeps the contract stable across console versions and hardware models.

## Tools (76 total)

### System (1)
| Tool | Description |
|---|---|
| `unifi_get_info` | Get UniFi Network application info — returns `applicationVersion` only |

### Sites (1)
| Tool | Description |
|---|---|
| `unifi_list_sites` | List all sites available to the API key |

### Devices (8)
| Tool | Description |
|---|---|
| `unifi_list_devices` | List all adopted devices at a site |
| `unifi_get_device` | Get a specific device by ID |
| `unifi_get_device_statistics` | Get latest statistics for a device |
| `unifi_list_pending_devices` | List devices pending adoption (global) |
| `unifi_adopt_device` | Adopt a pending device |
| `unifi_remove_device` | **DESTRUCTIVE:** Remove (unadopt) a device — may factory reset |
| `unifi_restart_device` | Restart a device |
| `unifi_power_cycle_port` | Power cycle a specific port (PoE restart) |

### Clients (4)
| Tool | Description |
|---|---|
| `unifi_list_clients` | List all connected clients (wired, wireless, VPN) at a site |
| `unifi_get_client` | Get a specific client by ID |
| `unifi_authorize_guest` | Authorize a guest client on a hotspot network |
| `unifi_unauthorize_guest` | Unauthorize a guest client |

### Client history (2)
| Tool | Description |
|---|---|
| `unifi_list_client_history` | Historical/offline client inventory and first/last seen times |
| `unifi_list_client_sessions` | Retained connection sessions, duration, byte counters and roaming records |

### Networks (6)
| Tool | Description |
|---|---|
| `unifi_list_networks` | List all networks at a site |
| `unifi_get_network` | Get a specific network by ID |
| `unifi_get_network_references` | Get references to a network (WiFi, firewall zones, etc.) |
| `unifi_create_network` | Create a new network (UNMANAGED, GATEWAY or SWITCH body) |
| `unifi_update_network` | Update an existing network — partial changes are merged into the full PUT body |
| `unifi_delete_network` | **DESTRUCTIVE:** Delete a network — disconnects all clients |

### WiFi (5)
| Tool | Description |
|---|---|
| `unifi_list_wifi` | List all WiFi broadcasts (SSIDs) at a site (passphrases redacted by default) |
| `unifi_get_wifi` | Get a specific WiFi network by ID (passphrases redacted unless `includeSecrets: true`) |
| `unifi_create_wifi` | Create a new WiFi network (SSID) |
| `unifi_update_wifi` | Update an existing WiFi network — partial changes are merged into the full PUT body |
| `unifi_delete_wifi` | **DESTRUCTIVE:** Delete a WiFi network — disconnects all clients |

### Hotspot Vouchers (5)
| Tool | Description |
|---|---|
| `unifi_list_vouchers` | List all hotspot vouchers at a site |
| `unifi_get_voucher` | Get a specific hotspot voucher by ID |
| `unifi_create_voucher` | Create hotspot vouchers |
| `unifi_delete_voucher` | **DESTRUCTIVE:** Delete a hotspot voucher |
| `unifi_bulk_delete_vouchers` | **DESTRUCTIVE:** Bulk delete vouchers matching a filter |

### Firewall Zones & Policies (13)
| Tool | Description |
|---|---|
| `unifi_list_firewall_zones` | List all firewall zones at a site |
| `unifi_get_firewall_zone` | Get a specific firewall zone by ID |
| `unifi_create_firewall_zone` | Create a new custom firewall zone |
| `unifi_update_firewall_zone` | Update a firewall zone |
| `unifi_delete_firewall_zone` | **DESTRUCTIVE:** Delete a custom firewall zone |
| `unifi_list_firewall_policies` | List all firewall policies at a site |
| `unifi_get_firewall_policy` | Get a specific firewall policy by ID |
| `unifi_create_firewall_policy` | Create a new firewall policy |
| `unifi_update_firewall_policy` | Update a firewall policy — partial changes are merged into the full PUT body |
| `unifi_patch_firewall_policy` | Partially update a firewall policy (toggle logging or Insights flow reporting) |
| `unifi_delete_firewall_policy` | **DESTRUCTIVE:** Delete a firewall policy |
| `unifi_get_firewall_policy_ordering` | Get user-defined firewall policy ordering for a zone pair |
| `unifi_reorder_firewall_policies` | Reorder user-defined firewall policies for a zone pair |

### ACL Rules (7)
| Tool | Description |
|---|---|
| `unifi_list_acl_rules` | List all ACL rules at a site |
| `unifi_get_acl_rule` | Get a specific ACL rule by ID |
| `unifi_get_acl_rule_ordering` | Get user-defined ACL rule ordering |
| `unifi_create_acl_rule` | Create a new ACL rule |
| `unifi_update_acl_rule` | Update an ACL rule — partial changes are merged into the full PUT body |
| `unifi_delete_acl_rule` | **DESTRUCTIVE:** Delete an ACL rule |
| `unifi_reorder_acl_rules` | Reorder user-defined ACL rules |

### Switching (6)
| Tool | Description |
|---|---|
| `unifi_list_switch_stacks` | List all Switch Stacks at a site |
| `unifi_get_switch_stack` | Get details of a specific Switch Stack |
| `unifi_list_mc_lag_domains` | List all MC-LAG (Multi-Chassis LAG) Domains at a site |
| `unifi_get_mc_lag_domain` | Get details of a specific MC-LAG Domain |
| `unifi_list_lags` | List all LAGs (Link Aggregation Groups) at a site |
| `unifi_get_lag` | Get details of a specific LAG |

### DNS Policies (5)
| Tool | Description |
|---|---|
| `unifi_list_dns_policies` | List all DNS policies at a site |
| `unifi_get_dns_policy` | Get a specific DNS policy by ID |
| `unifi_create_dns_policy` | Create a DNS policy of any type (A, AAAA, CNAME, MX, TXT, SRV, FORWARD_DOMAIN) |
| `unifi_update_dns_policy` | Update a DNS policy — partial changes are merged into the full PUT body |
| `unifi_delete_dns_policy` | **DESTRUCTIVE:** Delete a DNS policy |

### Traffic Matching (5)
| Tool | Description |
|---|---|
| `unifi_list_traffic_matching_lists` | List all traffic matching lists (port groups, IP groups) |
| `unifi_get_traffic_matching_list` | Get a specific traffic matching list by ID |
| `unifi_create_traffic_matching_list` | Create a new traffic matching list |
| `unifi_update_traffic_matching_list` | Update a traffic matching list |
| `unifi_delete_traffic_matching_list` | **DESTRUCTIVE:** Delete a traffic matching list |

### Supporting (8)
| Tool | Description |
|---|---|
| `unifi_list_wans` | List all WAN interfaces at a site |
| `unifi_list_vpn_tunnels` | List all site-to-site VPN tunnels at a site |
| `unifi_list_vpn_servers` | List all VPN servers at a site |
| `unifi_list_radius_profiles` | List all RADIUS profiles at a site |
| `unifi_list_device_tags` | List all device tags at a site |
| `unifi_list_dpi_categories` | List all DPI categories for traffic identification |
| `unifi_list_dpi_applications` | List all DPI applications for traffic identification |
| `unifi_list_countries` | List all countries/regions for geo-based rules |

## Development

```bash
pnpm install           # Install dependencies
pnpm run build         # Compile TypeScript
pnpm start             # Run the server
pnpm run typecheck     # Type-check without emitting
pnpm run lint          # ESLint
pnpm run lint:fix      # ESLint with auto-fix
pnpm test              # Run all tests (vitest)
pnpm run test:watch    # Run tests in watch mode
pnpm run test:coverage # Run tests with coverage
```

### Commit conventions

This project uses [conventional commits](https://www.conventionalcommits.org/) and [release-please](https://github.com/googleapis/release-please) for automated releases:

- `feat: ...` — new feature (minor version bump)
- `fix: ...` — bug fix (patch version bump)
- `feat!: ...` or `BREAKING CHANGE:` footer — breaking change (major version bump)
- `chore:`, `docs:`, `ci:`, etc. — no version bump

On push to `main`, release-please opens a Release PR that bumps the version and updates `CHANGELOG.md`. Merging that PR publishes to npm automatically.

To override the version number, add `Release-As: x.x.x` in the commit body:

```bash
git commit --allow-empty -m "chore: release 2.0.0" -m "Release-As: 2.0.0"
```

## License

MIT

## Retained client connections

The Integration API only lists connected clients. The two history tools use the controller APIs instead: GET `/proxy/network/v2/api/site/{siteReference}/clients/history` and POST `/proxy/network/api/s/{siteReference}/stat/session`. The POST is a statistics query and does not change the network. Both tools remain available in read-only mode.

Use `internalReference` from `unifi_list_sites` (often `default`), not its UUID. Session queries require `start` and `end` in Unix **seconds**, with a maximum 31-day window. The controller ignores `_start`/offset on this endpoint. A full result sets `mayBeTruncated=true`; split the time window or filter by MAC and query again. Overlap split boundaries and deduplicate session IDs. A result below the requested limit means the query was not capped, not that all dates were retained.

```json
{"siteReference":"default","start":1789272000,"end":1789876800,"limit":1000}
```

Results preserve controller field names, including `assoc_time`, `duration`, `rx_bytes`, `tx_bytes` and `roaming_sessions`. RX/TX are the controller's counters, not relabeled client download/upload. Inventory is separate from session history. Retention varies; a non-truncated result does not prove all requested dates were retained, and ongoing sessions may not be present. Neither association nor traffic counters establish end-to-end Internet success. The `is_guest` flag does not establish device ownership.

These controller routes are not part of the published Integration API contract. Their availability and API-key permissions vary by controller version. Unsupported, unauthorized, HTML login, legacy `meta.rc` error and malformed responses fail explicitly instead of becoming an empty history. History requests have a 25-second timeout, reject redirects, and cap responses at 10 MB. No browser cookies are required where API-key access is supported.

### Cloud Connector

To use a Site Manager API key with a console, set `UNIFI_NETWORK_HOST=api.ui.com` and `UNIFI_NETWORK_CONSOLE_ID` to its console ID. The existing `UNIFI_NETWORK_API_KEY` supplies the key. This works for current Integration API tools and the controller history routes when permitted by the console/key. Cloud Connector requires eligible console ownership/access and firmware 5.0.3 or later. TLS verification stays on: the server refuses to start with `UNIFI_NETWORK_VERIFY_SSL=false` and `api.ui.com`.

References: [official Cloud Connector API](https://developer.ui.com/site-manager/v1.0.0) and the [Art-of-WiFi controller client](https://github.com/Art-of-WiFi/UniFi-API-client/blob/master/src/Client.php), whose session queries use epoch seconds.
