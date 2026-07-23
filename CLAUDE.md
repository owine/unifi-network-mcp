# CLAUDE.md

## Project overview

MCP server exposing UniFi Network's Integration API as tool calls. Built with the MCP SDK, TypeScript, and Zod for input validation. Runs on Node.js via stdio transport. Provides 74 tools across 13 domains.

## Local dev setup

- Node version pinned in `.nvmrc` (24.18.0). Use [fnm](https://github.com/Schniz/fnm) — `fnm use` auto-reads `.nvmrc` on `cd`. The published library declares broader `engines.node` (`^22.13.0 || ^24.0.0`) for consumers; the `.nvmrc` only pins *development*.
- Package manager: pnpm via Corepack. `corepack enable`, then `pnpm install`.
- Dev install/build use pnpm; **publishing uses `npm publish --provenance`** (hybrid — npm has the most battle-tested OIDC flow).

### TypeScript 6/7 side-by-side

**Do not "fix" the two aliased `typescript` entries in `devDependencies` — they are deliberate.**

```jsonc
"@typescript/native": "npm:typescript@7.0.2",         // the real TS 7 — provides `tsc`
"typescript": "npm:@typescript/typescript6@6.0.2",    // vendored TS 6.0.3 — provides `tsc6` + the JS API
```

TypeScript 7 is the Go port and ships **no JS API**, so `typescript-estree` crashes at module load with `TypeError: Cannot read properties of undefined (reading 'Cjs')` — meaning `typescript-eslint` cannot run on it at all. The aliases split the *import specifier* from the *bin*:

- Anything resolving the `typescript` **module** (i.e. `typescript-eslint`) gets TS 6.0.3 and its JS API.
- The `tsc` **bin** is TS 7, because the v7 package keeps that bin name — so `build` and `typecheck` run the Go compiler with no script changes.

Consequences worth knowing:

- `tsc6` is available if you ever need the old compiler for comparison.
- Renovate now tracks *two* packages: the `@typescript/native` line is TS 7 proper; the `typescript` line is the separately-versioned `@typescript/typescript6` vendoring (its `6.0.2` reports `--version 6.0.3`).
- Unwind this once typescript-eslint supports TS 7.1's new API ([typescript-eslint#10940](https://github.com/typescript-eslint/typescript-eslint/issues/10940)): drop `@typescript/native` and point `typescript` back at the real package. Nothing else references either alias. See [the TS 7.0 announcement](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/) and #182.

## Commands

```bash
pnpm install         # Install dependencies (frozen-lockfile in CI)
pnpm run build       # Compile TypeScript to dist/
pnpm run typecheck   # Type-check without emitting
pnpm run lint        # ESLint (strict + stylistic)
pnpm run lint:fix    # ESLint with auto-fix
pnpm test            # Run all tests (vitest)
pnpm run test:watch  # Run tests in watch mode
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
    switching.ts      # Switch stacks, MC-LAG, LAGs (6 tools)
    dns-policies.ts   # DNS policies (5 tools)
    traffic-matching.ts # Traffic matching lists (5 tools)
    supporting.ts     # WAN, VPN, RADIUS, DPI, countries (8 tools)
  utils/
    responses.ts      # formatSuccess() / formatError() helpers
    query.ts          # buildQuery() for pagination/filter params
    safety.ts         # Tool annotations, formatDryRun(), requireConfirmation()
    output-schemas.ts # Zod output schemas for tools' structuredContent (58 tools)
```

## Adding a new tool

1. Add a function `registerXTools(server, client, readOnly = false)` in `src/tools/<domain>.ts`. Domains with **only** read tools (`system`, `sites`, `switching`, `supporting`) omit the `readOnly` param entirely — there is nothing to gate
2. Use `server.registerTool(name, { description, inputSchema, outputSchema, annotations }, handler)`
3. Set appropriate annotations from `utils/safety.ts`: `READ_ONLY`, `WRITE`, `WRITE_NOT_IDEMPOTENT`, `DESTRUCTIVE`
4. Add an `outputSchema` from `utils/output-schemas.ts` and return `formatSuccess(data, { structured: true })`. Every read tool has one; write tools get one when the API response returns the affected resource. Follow the loose strategy in that file: non-key fields optional, nested objects `.passthrough()`
5. For write tools: register them after `if (readOnly) return;` at the function level, add optional `dryRun` parameter
6. For dangerous/destructive tools: add `confirm` parameter validated via `requireConfirmation()`, prefix description with `DESTRUCTIVE:`
7. Wire it into `src/tools/index.ts` via `registerAllTools()`
8. Add tests in `tests/tools/<domain>.test.ts` using `createMockServer()` and `createMockClient()` from `tests/tools/_helpers.ts`

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

## API version bumps

For updating tools to match a new UniFi Network API version, follow the skill at `~/.claude/skills/unifi-api-update/SKILL.md`.

## Releases

Versioning and npm publishing are automated via [release-please](https://github.com/googleapis/release-please).

- Use **conventional commits** — release-please reads these to determine semver bumps and generate changelogs
  - `feat: ...` -> minor bump
  - `fix: ...` -> patch bump
  - `deps: ...` -> patch bump (dependency updates)
  - `feat!: ...` or `BREAKING CHANGE:` footer -> major bump
  - `chore:`, `docs:`, `ci:`, `refactor:`, `test:` -> no release
- **Dependency commits**: Only `feat`, `fix`, and `deps` are "releasable units" in release-please. Renovate is configured to use `deps:` for all dependency updates (triggers a patch release)
- On push to `main`, release-please opens/updates a "Release PR" that bumps `package.json` version and updates `CHANGELOG.md`
- Merging the Release PR triggers `npm publish` to `@owine/unifi-network-mcp` with provenance attestation
- To override the version number, add `Release-As: x.x.x` in the **commit body** (not the title):
  ```
  git commit --allow-empty -m "chore: release 2.0.0" -m "Release-As: 2.0.0"
  ```
