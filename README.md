# UniFi Network MCP Server

An MCP (Model Context Protocol) server that exposes the UniFi Network Integration API as tools for Claude and other MCP clients: sites, devices, clients, networks, WiFi, firewalls, ACLs, switching, DNS policies, hotspot vouchers, VPNs, and more.

## Prerequisites

- Node.js in the range `engines.node` in `package.json` allows
- A UniFi Network console with the Integration API enabled
- An API key generated from your UniFi Network console (see [Choosing an API key](#choosing-an-api-key))

## Setup

### Quick start (Claude Code)

Add to Claude Code with a single command — no clone or build needed:

```bash
claude mcp add-json unifi-network '{"command":"npx","args":["-y","@owine/unifi-network-mcp@latest"],"env":{"UNIFI_NETWORK_HOST":"192.168.1.1","UNIFI_NETWORK_API_KEY":"your-api-key"}}' -s user
```

Use `-s user` for global availability across all projects, or `-s project` for the current project only.

`@latest` runs the newest release every time the server starts, including a new major version. To take fixes but choose when to make breaking upgrades, pin the major version instead (for example `@owine/unifi-network-mcp@3`).

### Claude Desktop

Add the server to `claude_desktop_config.json` (Settings → Developer → Edit Config), then restart Claude Desktop:

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

### Manual configuration (Claude Code)

Alternatively, add the same `"unifi-network"` entry to your `~/.claude.json` under the top-level `"mcpServers"` key.

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

### Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `UNIFI_NETWORK_HOST` | Yes | — | IP or hostname of your UniFi Network console, without `https://` |
| `UNIFI_NETWORK_API_KEY` | Yes | — | API key from Network integration settings |
| `UNIFI_NETWORK_CA_CERT` | No | — | Absolute path to a PEM file with the console's certificate, to verify a self-signed console without turning verification off (see below) |
| `UNIFI_NETWORK_VERIFY_SSL` | No | `true` | Set to `false` to skip TLS certificate verification. Not allowed with `api.ui.com` or together with `UNIFI_NETWORK_CA_CERT` |
| `UNIFI_NETWORK_READ_ONLY` | No | `true` | Set to `false` to enable write/mutating tools (read-only by default) |
| `UNIFI_NETWORK_CONSOLE_ID` | No | — | Cloud Connector console ID; used only when `UNIFI_NETWORK_HOST` is `api.ui.com` (see [Cloud Connector](#cloud-connector)) |

UniFi consoles ship with a self-signed certificate, so against a local console the first call usually fails with a certificate error. The safe fix is to trust that one certificate: save it and point `UNIFI_NETWORK_CA_CERT` at the file.

```bash
openssl s_client -connect 192.168.1.1:443 </dev/null 2>/dev/null | openssl x509 > ~/.config/unifi-console.pem
```

Set `UNIFI_NETWORK_CA_CERT` to the file's absolute path (for example `/home/you/.config/unifi-console.pem`); MCP hosts do not expand `~` in `env`. The server then accepts that exact certificate even though it is issued to a name like `unifi.local` rather than the IP you connect to; any other certificate must chain to the file and match the hostname. Check the fingerprint (`openssl x509 -in ~/.config/unifi-console.pem -noout -fingerprint -sha256`) against the console's if the network between you is not trusted. If the console later generates a new certificate, save it again.

Setting `UNIFI_NETWORK_VERIFY_SSL=false` instead turns off certificate checks for this server's connections to the console: anyone who can intercept that traffic can then read the API key. Only do this on a network you trust.

### Choosing an API key

The key carries the rights of the admin who created it, and this server is driven by a model that reads data other people control (client hostnames, device names). Create the key as a dedicated admin with the least role that covers your use: for the default read-only mode, a **View Only** admin, so nothing can be changed even if a tool were misused. Use a full-access admin only when you set `UNIFI_NETWORK_READ_ONLY=false`.

### Cloud Connector

To use a Site Manager API key with a console, set `UNIFI_NETWORK_HOST=api.ui.com` and `UNIFI_NETWORK_CONSOLE_ID` to its console ID. The existing `UNIFI_NETWORK_API_KEY` supplies the key. This works for current Integration API tools and the controller history routes when permitted by the console/key. Cloud Connector requires eligible console ownership/access and firmware 5.0.3 or later. TLS verification stays on: the server refuses to start with `UNIFI_NETWORK_VERIFY_SSL=false` and `api.ui.com`.

References: [official Cloud Connector API](https://developer.ui.com/site-manager/v1.0.0) and the [Art-of-WiFi controller client](https://github.com/Art-of-WiFi/UniFi-API-client/blob/master/src/Client.php), whose session queries use epoch seconds.

## Upgrading from 2.x

3.0 tightens several defaults. Most setups need no change; check these:

- **Cloud Connector with `UNIFI_NETWORK_VERIFY_SSL=false`**: the server now refuses to start with `UNIFI_NETWORK_HOST=api.ui.com` and verification off. Unset `UNIFI_NETWORK_VERIFY_SSL`.
- **Writes that open access need `confirm: true`**: creating or switching a firewall policy or ACL rule to ALLOW, disabling a blocking policy or rule, creating an open SSID or changing an SSID's security type, and creating a large batch of vouchers. Without it the tool returns an error naming the change, and the agent can ask you before re-invoking.
- **IDs must be IDs**: ID inputs accept only letters, digits, `-` and `_` (pass the IDs that list and get tools return).
- **Smaller default results**: `unifi_list_client_sessions` and `unifi_list_vouchers` return fewer rows by default, and `unifi_list_client_history` now returns at most `limit` clients, most recently seen first, with `totalCount` and `truncated`; pass `limit` for more. Rows from both history tools carry only the fields their tool descriptions list.
- **Compact text output**: tool results are compact JSON rather than indented; `structuredContent` is unchanged.

One rule is relaxed: a `dryRun: true` preview of a destructive tool no longer needs `confirm`.

## Safety Features

This server provides layered safety controls for responsible operation:

- **Tool annotations** — Every tool declares `readOnlyHint`, `destructiveHint` and `openWorldHint`, and every write tool `idempotentHint`, so MCP clients (like Claude Code) can make informed confirmation decisions
- **Server instructions** — On connect the server gives the MCP host a short usage guide for the model (get a `siteId` first, page with `offset`/`limit`, preview writes with `dryRun`, ask before passing `confirm`), matched to read-only or read-write mode
- **Read-only mode** — Enabled by default. Only read operations (list, get) are registered. Set `UNIFI_NETWORK_READ_ONLY=false` to enable write/mutating tools
- **Destructive tool warnings** — Tools that delete or irreversibly modify resources have descriptions prefixed with `DESTRUCTIVE:` to clearly signal risk
- **Confirmation parameter** — Every tool marked `DESTRUCTIVE:` (including `unifi_remove_device` and `unifi_bulk_delete_vouchers`) requires an explicit `confirm: true` parameter for the call to succeed. A `dryRun: true` preview does not need it, since it changes nothing
- **Confirmation for changes that open access** — Some routine write tools ask for `confirm: true` only when a particular change lets traffic or guests in: a firewall policy or ACL rule that ALLOWs traffic (created, or switched to ALLOW), disabling a policy or rule that blocks, creating an open SSID or changing an SSID's security type, and creating a large batch of vouchers (`unifi_create_voucher`'s `confirm` parameter states the threshold). Without it the call returns an error naming the change; a dry run never needs it
- **Dry-run support** — Every write tool accepts an optional `dryRun: true` parameter that returns a preview of the HTTP request (method, path, body) without making any changes
- **Safe partial updates** — The UniFi PUT endpoints for WiFi broadcasts, networks, firewall policies, ACL rules and DNS policies replace the whole resource, and some fields reset when omitted (a missing `dhcpGuarding` disables DHCP guarding). Their update tools read the current resource, keep every documented body field, and overlay only the top-level fields you pass, so omitted fields keep their current values. A field you pass replaces the current one whole — nested objects such as `ipv4Configuration`, `securityConfiguration` or a policy's `source` are not deep-merged, so start from what the get tool returns. Pass `null` to clear an optional field. Parallel updates to one resource run one at a time. The dry-run preview shows the merged body (the read still happens)
- **Secret redaction** — WiFi passphrases (including per-VLAN PPSK keys) are returned as `[REDACTED]` unless the caller passes `includeSecrets: true` to `unifi_list_wifi` / `unifi_get_wifi`. Write-tool echoes and dry-run previews are always redacted, and an update that echoes back `[REDACTED]` keeps the stored passphrase

## Structured Output

Every read tool, and every write tool whose API response returns the affected resource, declares an MCP `outputSchema` and returns `structuredContent` alongside the usual text content. Clients that understand structured output get typed, machine-readable results instead of parsing JSON out of a text blob. A `dryRun: true` call returns its preview, `{"dryRun": true, "wouldExecute": {"method", "path", "body"}}`, the same way. Other write tools (deletes, device and guest actions, reorders) return the API response as text only.

The schemas live in `src/utils/output-schemas.ts`. They deliberately use a **loose strategy**: every non-key field is optional and objects accept fields the schema does not list, so firmware- and hardware-specific fields flow through unchanged rather than being stripped or triggering a validation error. This keeps the contract stable across console versions and hardware models.

## Tools

### System
| Tool | Description |
|---|---|
| `unifi_get_info` | Get UniFi Network application info — returns `applicationVersion` only |

### Sites
| Tool | Description |
|---|---|
| `unifi_list_sites` | List all sites available to the API key |

### Devices
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

### Clients
| Tool | Description |
|---|---|
| `unifi_list_clients` | List all connected clients (wired, wireless, VPN) at a site |
| `unifi_get_client` | Get a specific client by ID |
| `unifi_authorize_guest` | Authorize a guest client on a hotspot network |
| `unifi_unauthorize_guest` | Unauthorize a guest client |

### Client history
| Tool | Description |
|---|---|
| `unifi_list_client_history` | Historical/offline client inventory and first/last seen times |
| `unifi_list_client_sessions` | Retained connection sessions, duration, byte counters and roaming records |

### Networks
| Tool | Description |
|---|---|
| `unifi_list_networks` | List all networks at a site |
| `unifi_get_network` | Get a specific network by ID |
| `unifi_get_network_references` | Get references to a network (WiFi, firewall zones, etc.) |
| `unifi_create_network` | Create a new network (UNMANAGED, GATEWAY or SWITCH body) |
| `unifi_update_network` | Update an existing network — partial changes are merged into the full PUT body |
| `unifi_delete_network` | **DESTRUCTIVE:** Delete a network — disconnects all clients |

### WiFi
| Tool | Description |
|---|---|
| `unifi_list_wifi` | List all WiFi broadcasts (SSIDs) at a site (passphrases redacted by default) |
| `unifi_get_wifi` | Get a specific WiFi network by ID (passphrases redacted unless `includeSecrets: true`) |
| `unifi_create_wifi` | Create a new WiFi network (SSID) |
| `unifi_update_wifi` | Update an existing WiFi network — partial changes are merged into the full PUT body |
| `unifi_delete_wifi` | **DESTRUCTIVE:** Delete a WiFi network — disconnects all clients |

### Hotspot Vouchers
| Tool | Description |
|---|---|
| `unifi_list_vouchers` | List all hotspot vouchers at a site |
| `unifi_get_voucher` | Get a specific hotspot voucher by ID |
| `unifi_create_voucher` | Create hotspot vouchers |
| `unifi_delete_voucher` | **DESTRUCTIVE:** Delete a hotspot voucher |
| `unifi_bulk_delete_vouchers` | **DESTRUCTIVE:** Bulk delete vouchers matching a filter |

### Firewall Zones & Policies
| Tool | Description |
|---|---|
| `unifi_list_firewall_zones` | List all firewall zones at a site |
| `unifi_get_firewall_zone` | Get a specific firewall zone by ID |
| `unifi_create_firewall_zone` | Create a new custom firewall zone |
| `unifi_update_firewall_zone` | Replace a firewall zone's name and network list (send every network ID to keep) |
| `unifi_delete_firewall_zone` | **DESTRUCTIVE:** Delete a custom firewall zone |
| `unifi_list_firewall_policies` | List all firewall policies at a site |
| `unifi_get_firewall_policy` | Get a specific firewall policy by ID |
| `unifi_create_firewall_policy` | Create a new firewall policy |
| `unifi_update_firewall_policy` | Update a firewall policy — partial changes are merged into the full PUT body |
| `unifi_patch_firewall_policy` | Partially update a firewall policy (toggle logging or Insights flow reporting) |
| `unifi_delete_firewall_policy` | **DESTRUCTIVE:** Delete a firewall policy |
| `unifi_get_firewall_policy_ordering` | Get user-defined firewall policy ordering for a zone pair |
| `unifi_reorder_firewall_policies` | Reorder user-defined firewall policies for a zone pair |

### ACL Rules
| Tool | Description |
|---|---|
| `unifi_list_acl_rules` | List all ACL rules at a site |
| `unifi_get_acl_rule` | Get a specific ACL rule by ID |
| `unifi_get_acl_rule_ordering` | Get user-defined ACL rule ordering |
| `unifi_create_acl_rule` | Create a new ACL rule |
| `unifi_update_acl_rule` | Update an ACL rule — partial changes are merged into the full PUT body |
| `unifi_delete_acl_rule` | **DESTRUCTIVE:** Delete an ACL rule |
| `unifi_reorder_acl_rules` | Reorder user-defined ACL rules |

### Switching
| Tool | Description |
|---|---|
| `unifi_list_switch_stacks` | List all Switch Stacks at a site |
| `unifi_get_switch_stack` | Get details of a specific Switch Stack |
| `unifi_list_mc_lag_domains` | List all MC-LAG (Multi-Chassis LAG) Domains at a site |
| `unifi_get_mc_lag_domain` | Get details of a specific MC-LAG Domain |
| `unifi_list_lags` | List all LAGs (Link Aggregation Groups) at a site |
| `unifi_get_lag` | Get details of a specific LAG |

### DNS Policies
| Tool | Description |
|---|---|
| `unifi_list_dns_policies` | List all DNS policies at a site |
| `unifi_get_dns_policy` | Get a specific DNS policy by ID |
| `unifi_create_dns_policy` | Create a DNS policy of any type (A, AAAA, CNAME, MX, TXT, SRV, FORWARD_DOMAIN) |
| `unifi_update_dns_policy` | Update a DNS policy — partial changes are merged into the full PUT body |
| `unifi_delete_dns_policy` | **DESTRUCTIVE:** Delete a DNS policy |

### Traffic Matching
| Tool | Description |
|---|---|
| `unifi_list_traffic_matching_lists` | List all traffic matching lists (port groups, IP groups) |
| `unifi_get_traffic_matching_list` | Get a specific traffic matching list by ID |
| `unifi_create_traffic_matching_list` | Create a new traffic matching list |
| `unifi_update_traffic_matching_list` | Replace a traffic matching list (send the full items array) |
| `unifi_delete_traffic_matching_list` | **DESTRUCTIVE:** Delete a traffic matching list |

### Supporting
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

## Retained client connections

The Integration API only lists connected clients. The two history tools use the controller APIs instead: GET `/proxy/network/v2/api/site/{siteReference}/clients/history` and POST `/proxy/network/api/s/{siteReference}/stat/session`. The POST is a statistics query and does not change the network. Both tools remain available in read-only mode.

Use `internalReference` from `unifi_list_sites` (often `default`), not its UUID. Session queries require `start` and `end` in Unix **seconds**, with a maximum 31-day window. The controller ignores `_start`/offset on this endpoint. A full result sets `mayBeTruncated=true`; split the time window or filter by MAC and query again. Overlap split boundaries and deduplicate session IDs. A result below the requested limit means the query was not capped, not that all dates were retained.

```json
{"siteReference":"default","start":1789272000,"end":1789876800}
```

`unifi_list_client_history` lists offline clients only, most recently seen first, up to `limit`, with `totalCount`. `truncated: true` means less recently seen clients were left out; raise `limit` (narrowing `withinHours` drops those same clients).

Rows keep the controller's field names (`assoc_time`, `duration`, `rx_bytes`, `tx_bytes`, `roaming_sessions`, …) but carry only the fields each tool's description lists. RX/TX are the controller's counters, not relabeled client download/upload. Inventory is separate from session history. Retention varies; a non-truncated result does not prove all requested dates were retained, and ongoing sessions may not be present. Neither association nor traffic counters establish end-to-end Internet success.

These controller routes are not part of the published Integration API contract. Their availability and API-key permissions vary by controller version. Unsupported, unauthorized, HTML login, legacy `meta.rc` error and malformed responses fail explicitly instead of becoming an empty history. History requests are time-limited, reject redirects, and refuse oversized responses. No browser cookies are required where API-key access is supported.

## Troubleshooting

Configuration errors go to the MCP host's server log and the server exits. Tool errors reach the agent as results starting with `Error:`.

| Message | Cause and fix |
|---|---|
| `Configuration error:` naming `host` or `apiKey` | `UNIFI_NETWORK_HOST` or `UNIFI_NETWORK_API_KEY` is missing from the server's `env`. |
| `cannot read UNIFI_NETWORK_CA_CERT (…)` | The path does not exist for the server. Use an absolute path; `~` and `$HOME` are not expanded in an MCP config. |
| `UNIFI_NETWORK_CA_CERT must name a PEM file containing a certificate` | The file has no `BEGIN CERTIFICATE` block; re-run the `openssl` command above. |
| `…cannot be combined with UNIFI_NETWORK_VERIFY_SSL=false` or `TLS verification cannot be disabled for api.ui.com` | Unset `UNIFI_NETWORK_VERIFY_SSL`. |
| `Ignoring UNIFI_NETWORK_CONSOLE_ID` (log line) | The console ID only applies with `UNIFI_NETWORK_HOST=api.ui.com`. |
| `fetch failed (DEPTH_ZERO_SELF_SIGNED_CERT)` or another certificate code | The console's certificate did not verify. Save it to `UNIFI_NETWORK_CA_CERT`; if you already did, the console has a new certificate, so save it again. |
| `fetch failed (ECONNREFUSED)`, `(ENOTFOUND)` or a connect timeout | Wrong or unreachable host. `UNIFI_NETWORK_HOST` is a bare IP or hostname, without `https://`. |
| `HTTP 401` / `HTTP 403` | The key is wrong or revoked, or its admin lacks the rights (a View Only key cannot write). |
| `HTTP 404` | A wrong `siteId` or resource ID, or an endpoint this Network version lacks (check `unifi_get_info`). |
| `UniFi controller did not respond within …` | The console is slow. For a write, check whether it was applied before retrying. |
| `This action requires explicit confirmation: …` | Expected: the change needs `confirm: true`, and the agent should ask you first. |
| `Use an ID returned by a list or get tool` | The agent passed a name or malformed ID. |
| No write tools listed | Read-only is the default. Set `UNIFI_NETWORK_READ_ONLY=false` (only `false` counts; any other value stays read-only) and restart the host. |
| `Controller history returned HTTP …`, `non-JSON data` or `an empty body` | This console or key cannot use the history routes (see [Retained client connections](#retained-client-connections)). It is not an empty history. |
| `Use the site's internalReference …` | History tools take `internalReference` (often `default`) from `unifi_list_sites`, not the UUID. |

## Development

```bash
pnpm install            # Install dependencies
pnpm run build          # Compile TypeScript
pnpm start              # Run the server
pnpm run typecheck      # Type-check src/ and tests
pnpm run lint           # ESLint
pnpm run lint:fix       # ESLint with auto-fix
pnpm test               # Run all tests (vitest)
pnpm run test:watch     # Run tests in watch mode
pnpm run test:coverage  # Run tests with coverage
pnpm run test:package   # Build, pack and smoke-test the published package
```

### Commit conventions

This project uses [conventional commits](https://www.conventionalcommits.org/) and [release-please](https://github.com/googleapis/release-please) for automated releases:

- `feat: ...` — new feature (minor version bump)
- `fix: ...` — bug fix (patch version bump)
- `deps: ...` — dependency update (patch version bump)
- `feat!: ...` or `BREAKING CHANGE:` footer — breaking change (major version bump)
- `chore:`, `docs:`, `ci:`, etc. — no version bump

On push to `main`, release-please opens a Release PR that bumps the version and updates `CHANGELOG.md`. Merging that PR publishes to npm automatically.

To override the version number, add `Release-As: x.y.z` in the commit body:

```bash
git commit --allow-empty -m "chore: release x.y.z" -m "Release-As: x.y.z"
```

## License

MIT — see [LICENSE](LICENSE).
