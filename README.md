# UniFi Network MCP Server

An MCP (Model Context Protocol) server that exposes the UniFi Network Integration API as tools for Claude Code and other MCP clients. Provides 67 tools for managing sites, devices, clients, networks, WiFi, firewalls, ACLs, DNS policies, hotspot vouchers, VPNs, and more.

## Prerequisites

- Node.js 20+
- A UniFi Network console with the Integration API enabled
- An API key generated from your UniFi Network console

## Setup

### Quick start (npx)

Add to Claude Code with a single command — no clone or build needed:

```bash
claude mcp add-json unifi-network '{"command":"npx","args":["-y","@owine/unifi-network-mcp@latest"],"env":{"UNIFI_NETWORK_HOST":"192.168.1.1","UNIFI_NETWORK_API_KEY":"your-api-key","UNIFI_NETWORK_VERIFY_SSL":"false"}}' -s user
```

Use `-s user` for global availability across all projects, or `-s project` for the current project only.

### From source

If you prefer to build locally:

```bash
git clone https://github.com/owine/unifi-network-mcp.git
cd unifi-network-mcp
npm install
npm run build
```

Then add to Claude Code:

```bash
claude mcp add-json unifi-network '{"command":"node","args":["/path/to/unifi-network-mcp/dist/index.js"],"env":{"UNIFI_NETWORK_HOST":"192.168.1.1","UNIFI_NETWORK_API_KEY":"your-api-key","UNIFI_NETWORK_VERIFY_SSL":"false"}}' -s user
```

### Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `UNIFI_NETWORK_HOST` | Yes | — | IP or hostname of your UniFi Network console |
| `UNIFI_NETWORK_API_KEY` | Yes | — | API key from Network integration settings |
| `UNIFI_NETWORK_VERIFY_SSL` | No | `true` | Set to `false` to skip TLS certificate verification (needed for self-signed certs) |
| `UNIFI_NETWORK_READ_ONLY` | No | `false` | Set to `true` to disable all write/mutating tools (monitoring-only mode) |

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
        "UNIFI_NETWORK_API_KEY": "your-api-key",
        "UNIFI_NETWORK_VERIFY_SSL": "false"
      }
    }
  }
}
```

## Safety Features

This server provides layered safety controls for responsible operation:

- **Tool annotations** — Every tool declares `readOnlyHint`, `destructiveHint`, and `idempotentHint` so MCP clients (like Claude Code) can make informed confirmation decisions
- **Read-only mode** — Set `UNIFI_NETWORK_READ_ONLY=true` to completely hide all write/mutating tools. Only read operations (list, get) are registered. Ideal for monitoring-only deployments
- **Destructive tool warnings** — Tools that delete or irreversibly modify resources have descriptions prefixed with `DESTRUCTIVE:` to clearly signal risk
- **Confirmation parameter** — The most dangerous tools (e.g., `unifi_remove_device`, `unifi_bulk_delete_vouchers`) require an explicit `confirm: true` parameter that must be present for the call to succeed
- **Dry-run support** — All write tools accept an optional `dryRun: true` parameter that returns a preview of the HTTP request (method, path, body) without making any changes

## Tools (67 total)

### System (1)
| Tool | Description |
|---|---|
| `unifi_get_info` | Get application information including version and whether it's a UniFi OS Console |

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

### Networks (6)
| Tool | Description |
|---|---|
| `unifi_list_networks` | List all networks at a site |
| `unifi_get_network` | Get a specific network by ID |
| `unifi_get_network_references` | Get references to a network (WiFi, firewall zones, etc.) |
| `unifi_create_network` | Create a new network |
| `unifi_update_network` | Update an existing network |
| `unifi_delete_network` | **DESTRUCTIVE:** Delete a network — disconnects all clients |

### WiFi (5)
| Tool | Description |
|---|---|
| `unifi_list_wifi` | List all WiFi broadcasts (SSIDs) at a site |
| `unifi_get_wifi` | Get a specific WiFi network by ID |
| `unifi_create_wifi` | Create a new WiFi network (SSID) |
| `unifi_update_wifi` | Update an existing WiFi network |
| `unifi_delete_wifi` | **DESTRUCTIVE:** Delete a WiFi network — disconnects all clients |

### Hotspot Vouchers (5)
| Tool | Description |
|---|---|
| `unifi_list_vouchers` | List all hotspot vouchers at a site |
| `unifi_get_voucher` | Get a specific hotspot voucher by ID |
| `unifi_create_voucher` | Create hotspot vouchers |
| `unifi_delete_voucher` | **DESTRUCTIVE:** Delete a hotspot voucher |
| `unifi_bulk_delete_vouchers` | **DESTRUCTIVE:** Bulk delete vouchers matching a filter |

### Firewall Zones & Policies (12)
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
| `unifi_update_firewall_policy` | Update a firewall policy |
| `unifi_delete_firewall_policy` | **DESTRUCTIVE:** Delete a firewall policy |
| `unifi_get_firewall_policy_ordering` | Get user-defined firewall policy ordering for a zone pair |
| `unifi_reorder_firewall_policies` | Reorder user-defined firewall policies for a zone pair |

### ACL Rules (7)
| Tool | Description |
|---|---|
| `unifi_list_acl_rules` | List all ACL (firewall) rules at a site |
| `unifi_get_acl_rule` | Get a specific ACL rule by ID |
| `unifi_get_acl_rule_ordering` | Get user-defined ACL rule ordering |
| `unifi_create_acl_rule` | Create a new ACL rule |
| `unifi_update_acl_rule` | Update an ACL rule |
| `unifi_delete_acl_rule` | **DESTRUCTIVE:** Delete an ACL rule |
| `unifi_reorder_acl_rules` | Reorder user-defined ACL rules |

### DNS Policies (5)
| Tool | Description |
|---|---|
| `unifi_list_dns_policies` | List all DNS policies at a site |
| `unifi_get_dns_policy` | Get a specific DNS policy by ID |
| `unifi_create_dns_policy` | Create a new DNS policy |
| `unifi_update_dns_policy` | Update a DNS policy |
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
npm run build        # Compile TypeScript
npm start            # Run the server
npm run typecheck    # Type-check without emitting
npm run lint         # ESLint
npm test             # Run all tests (vitest)
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
