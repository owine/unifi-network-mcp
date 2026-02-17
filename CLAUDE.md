# CLAUDE.md

## Project overview

MCP server exposing UniFi Network's Integration API as tool calls. Built with the MCP SDK, TypeScript, and Zod for input validation. Runs on Node.js via stdio transport. Provides 68 tools across 12 domains.

## Commands

```bash
npm run build        # Compile TypeScript to dist/
npm run typecheck    # Type-check without emitting
npm run lint         # ESLint (strict + stylistic)
npm run lint:fix     # ESLint with auto-fix
npm test             # Run all tests (vitest)
npm run test:watch   # Run tests in watch mode
```

## Architecture

```
src/
  index.ts            # Entry point — creates server, connects stdio transport
  config.ts           # Loads and validates env vars with Zod
  client.ts           # NetworkClient — HTTP wrapper for the Network API
  tools/              # Tool handlers, one file per API domain
    index.ts          # registerAllTools() — wires all tool modules
    system.ts         # System info (1 tool)
    sites.ts          # Site listing (1 tool)
    devices.ts        # Device management (8 tools)
    clients.ts        # Client management (4 tools)
    networks.ts       # Network configuration (6 tools)
    wifi.ts           # WiFi/SSID configuration (5 tools)
    hotspot.ts        # Hotspot vouchers (5 tools)
    firewall.ts       # Firewall zones & policies (13 tools)
    acl.ts            # ACL rules (7 tools)
    dns-policies.ts   # DNS policies (5 tools)
    traffic-matching.ts # Traffic matching lists (5 tools)
    supporting.ts     # WAN, VPN, RADIUS, DPI, countries (8 tools)
  utils/
    responses.ts      # formatSuccess() / formatError() helpers
    query.ts          # buildQuery() for pagination/filter params
    safety.ts         # Tool annotations, formatDryRun(), requireConfirmation()
```

## Adding a new tool

1. Add a function `registerXTools(server, client, readOnly)` in `src/tools/<domain>.ts`
2. Use `server.tool(name, description, zodSchema, annotations, handler)` — annotations is the 4th arg before the callback
3. Set appropriate annotations from `utils/safety.ts`: `READ_ONLY`, `WRITE`, `WRITE_NOT_IDEMPOTENT`, `DESTRUCTIVE`
4. For write tools: register them after `if (readOnly) return;` at the function level, add optional `dryRun` parameter
5. For dangerous/destructive tools: add `confirm` parameter validated via `requireConfirmation()`, prefix description with `DESTRUCTIVE:`
6. Wire it into `src/tools/index.ts` via `registerAllTools()`
7. Add tests in `tests/tools/<domain>.test.ts` using `createMockServer()` and `createMockClient()` from `tests/tools/_helpers.ts`

## Tool safety

All tool files follow a consistent pattern:

1. Read-only tools are registered first
2. `if (readOnly) return;` exits before write tools are registered
3. Write tools include `dryRun` parameter for preview mode
4. Destructive tools include `confirm` parameter and `DESTRUCTIVE:` description prefix
5. Every tool has MCP annotations (`readOnlyHint`, `destructiveHint`, `idempotentHint`)

## Testing patterns

Tests mock `NetworkClient` methods and capture tool handlers via `createMockServer()`, which returns `handlers` (name -> handler) and `configs` (name -> config with annotations). Use `mockFn(client, "get")` for type-safe access to mock functions. Each tool gets a success and error test at minimum, plus annotation checks, read-only mode tests, and dry-run/confirm tests where applicable.

## Code style

- ESLint with `typescript-eslint` strict + stylistic rulesets
- All imports use `.js` extensions (Node16 module resolution)
- Use `z.string().describe()` for tool parameter descriptions
- `no-explicit-any` and `no-non-null-assertion` are relaxed in test files only

## Releases

Versioning and npm publishing are automated via [release-please](https://github.com/googleapis/release-please).

- Use **conventional commits** — release-please reads these to determine semver bumps and generate changelogs
  - `feat: ...` -> minor bump
  - `fix: ...` -> patch bump
  - `feat!: ...` or `BREAKING CHANGE:` footer -> major bump
  - `chore:`, `docs:`, `ci:`, `refactor:`, `test:` -> no release
- On push to `main`, release-please opens/updates a "Release PR" that bumps `package.json` version and updates `CHANGELOG.md`
- Merging the Release PR triggers `npm publish` to `@owine/unifi-network-mcp` with provenance attestation
- To override the version number, add `Release-As: x.x.x` in the **commit body** (not the title):
  ```
  git commit --allow-empty -m "chore: release 2.0.0" -m "Release-As: 2.0.0"
  ```
