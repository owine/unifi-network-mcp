# CLAUDE.md

## Project overview

MCP server exposing UniFi Network's Integration API as tool calls. Built with the MCP SDK, TypeScript, and Zod for input validation. Runs on Node.js via stdio transport. Tools are grouped into one module per API domain under `src/tools/`.

## Local dev setup

- Node version pinned in `.nvmrc`. Use [fnm](https://github.com/Schniz/fnm) — `fnm use` auto-reads `.nvmrc` on `cd`. The published package declares a broader `engines.node` range in `package.json` for consumers; `.nvmrc` only pins *development*.
- Package manager: pnpm via Corepack. `corepack enable`, then `pnpm install`.
- Dev install/build use pnpm; **publishing uses `npm publish --provenance`** (hybrid — npm has the most battle-tested OIDC flow).

### TypeScript 6/7 side-by-side

**Do not "fix" the two aliased `typescript` entries in `devDependencies` — they are deliberate.**

```jsonc
"@typescript/native": "npm:typescript@7.x",         // the real TS 7 — provides `tsc`
"typescript": "npm:@typescript/typescript6@6.x",    // vendored TS 6 — provides `tsc6` + the JS API
```

TypeScript 7 is the Go port and ships **no JS API**, so `typescript-estree` crashes at module load with `TypeError: Cannot read properties of undefined (reading 'Cjs')` — meaning `typescript-eslint` cannot run on it at all. The aliases split the *import specifier* from the *bin*:

- Anything resolving the `typescript` **module** (i.e. `typescript-eslint`) gets TS 6 and its JS API.
- The `tsc` **bin** is TS 7, because the v7 package keeps that bin name — so `build` and `typecheck` run the Go compiler with no script changes.

Consequences worth knowing:

- `tsc6` is available if you ever need the old compiler for comparison.
- Renovate now tracks *two* packages: the `@typescript/native` line is TS 7 proper; the `typescript` line is the separately-versioned `@typescript/typescript6` vendoring (its package version need not match `tsc6 --version`).
- Unwind this once typescript-eslint supports TS 7.1's new API ([typescript-eslint#10940](https://github.com/typescript-eslint/typescript-eslint/issues/10940)): drop `@typescript/native` and point `typescript` back at the real package. Nothing else references either alias. See [the TS 7.0 announcement](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/) and #182.

## Commands

```bash
pnpm install         # Install dependencies (frozen-lockfile in CI)
pnpm run build       # Compile TypeScript to dist/
pnpm run typecheck   # Type-check src/ and tests without emitting
pnpm run lint        # ESLint (type-checked strict + stylistic)
pnpm run lint:fix    # ESLint with auto-fix
pnpm test            # Run all tests (vitest)
pnpm run test:watch  # Run tests in watch mode
pnpm run test:coverage # Tests with v8 coverage
pnpm run test:package  # Build, pack and smoke-test the package over stdio (writes dist/)
```

## Architecture

```
src/
  index.ts            # Entry point — creates server, connects stdio transport
  config.ts           # Loads and validates env vars with Zod
  tls.ts              # consoleDispatcher() — per-client TLS (CA pinning, verify off) and keep-alive
  client.ts           # NetworkClient — HTTP wrapper for the Network API
  instructions.ts     # serverInstructions() — cross-tool guidance sent to MCP hosts
  tools/              # Tool handlers, one file per API domain
    index.ts          # registerAllTools() — wires all tool modules
    system.ts         # System info
    sites.ts          # Site listing
    devices.ts        # Device management
    clients.ts        # Client management
    client-history.ts # Retained sessions & offline client history
    networks.ts       # Network configuration
    wifi.ts           # WiFi/SSID configuration
    hotspot.ts        # Hotspot vouchers
    firewall.ts       # Firewall zones & policies
    acl.ts            # ACL rules
    switching.ts      # Switch stacks, MC-LAG, LAGs
    dns-policies.ts   # DNS policies
    traffic-matching.ts # Traffic matching lists
    supporting.ts     # WAN, VPN, RADIUS, DPI, countries
  utils/
    responses.ts      # formatSuccess() / formatError() helpers
    query.ts          # buildQuery() for pagination/filter params
    safety.ts         # Tool annotations, formatDryRun(), requireConfirmation()
    full-put.ts       # mergeForPut() read-merge-write for full-replacement PUTs
    secrets.ts        # redactSecrets() / restoreRedacted() for WiFi passphrases
    params.ts         # resourceId() — allowlisted schema for IDs interpolated into paths
    output-schemas.ts # Zod output schemas for tools' structuredContent
```

## Adding a new tool

1. Add a function `registerXTools(server, client, readOnly = false)` in `src/tools/<domain>.ts`. Domains with **only** read tools (`system`, `sites`, `switching`, `supporting`, `client-history`) omit the `readOnly` param entirely — there is nothing to gate
2. Use `server.registerTool(name, { description, inputSchema, outputSchema, annotations }, handler)`. Titles are derived from the name by `toolTitle()` in `src/tools/index.ts`; add an acronym to `TITLE_WORDS` if it reads wrongly
3. Set appropriate annotations from `utils/safety.ts`: `READ_ONLY`, `WRITE`, `WRITE_NOT_IDEMPOTENT`, `DESTRUCTIVE`
4. Add an `outputSchema` from `utils/output-schemas.ts` and return `formatSuccess(data, { structured: true })`. Every read tool has one; write tools get one when the API response returns the affected resource, wrapped in `writeResult()` so the dry-run preview also validates (`tests/sdk-contract.test.ts` enforces this through the real SDK). Follow the loose strategy in that file: non-key fields optional, nested objects `.loose()`. Pass the raw shape; `registerAllTools()` publishes it as a loose object so fields the schema does not list pass SDK client validation
5. For write tools: register them after `if (readOnly) return;` at the function level, add optional `dryRun` parameter
6. If the endpoint is a full-replacement PUT, GET the current resource and build the body with `mergeForPut()` from `utils/full-put.ts`, using the field allowlist from the docs' request schema (per variant, if the body is discriminated). Never send a sparse body to a full PUT. Wrap the GET-merge-PUT in `withResourceLock(path, …)`, and any PATCH of the same resource under the same `path`, so parallel calls cannot revert each other; add a case to `tests/tools/merge-concurrency.test.ts`
7. For dangerous/destructive tools: add `confirm: confirmDestructive()` validated via `const guard = dryRun ? null : requireConfirmation(...)`, prefix description with `DESTRUCTIVE:`. A non-destructive write whose particular inputs open access (an ALLOW rule, an open SSID, a large voucher batch) takes an optional `confirm` checked with `requireConfirmationIf(reason, confirm, dryRun)` instead, and gets a case in `tests/tools/security-confirm.test.ts`
8. Wire it into `src/tools/index.ts` via `registerAllTools()`
9. Add tests in `tests/tools/<domain>.test.ts` using `createMockServer()` and `createMockClient()` from `tests/tools/_helpers.ts`

## Tool safety

All tool files follow a consistent pattern:

1. Read-only tools are registered first
2. `if (readOnly) return;` exits before write tools are registered
3. Write tools include `dryRun` parameter for preview mode
4. Destructive tools include `confirm` parameter and `DESTRUCTIVE:` description prefix
   - Writes that open access require `confirm` only for those changes (`requireConfirmationIf`); a dry run never needs `confirm`
5. Every tool has MCP annotations from `utils/safety.ts` (`readOnlyHint`, `destructiveHint`, `openWorldHint: false`; write tools also `idempotentHint`)

## Testing patterns

Tests mock `NetworkClient` methods and capture tool handlers via `createMockServer()`, which returns `handlers` (name -> handler) and `configs` (name -> { description, annotations, schema, outputSchema }); `get()` on either throws for an unknown tool. Use `mockFn(client, "get")` for type-safe access to mock functions. Each tool gets a success and error test at minimum, plus annotation checks, read-only mode tests, and dry-run/confirm tests where applicable.

Cross-cutting suites check every tool at once: `tests/tools/safety-compliance.test.ts` (annotations, dryRun/confirm, `DESTRUCTIVE:` prefix, read-only behaviour), `tests/tools/validation.test.ts` (input rejection, ID charset), `tests/tools/security-confirm.test.ts` (conditional confirm), `tests/tools/merge-concurrency.test.ts` (read-merge-write locking), `tests/sdk-contract.test.ts` (results through the real SDK) and `tests/docs-drift.test.ts` (README and CLAUDE.md against the code, with no stale-prone counts), plus `tests/tls.test.ts`, `tests/instructions.test.ts` and `tests/client-history-transport.test.ts`. When one fails, fix the tool or the docs, not the check.

## Code style

- ESLint with `typescript-eslint` type-checked strict + stylistic rulesets (`strictTypeChecked`, `stylisticTypeChecked`), using `tsconfig.test.json` so tests are linted with types too
- All imports use `.js` extensions (Node16 module resolution)
- Use `z.string().describe()` for tool parameter descriptions; any ID that ends up in a request path uses `resourceId().describe()` instead (`NetworkClient` also refuses paths that are not plain word segments)
- `no-explicit-any`, `no-non-null-assertion` and the `no-unsafe-*` rules are relaxed in test files only, where mocks are deliberately loosely typed
- `pnpm run typecheck` checks `src/` and, via `tsconfig.test.json`, the tests
- Guidance that applies across tools (siteId, paging, dryRun/confirm workflow) belongs in `src/instructions.ts`, not repeated in tool descriptions
- Docs state no counts or versions that drift (tool counts, `.nvmrc`); describe the behaviour or point at the source of truth

## API version bumps

Aligned with UniFi Network API **11.0.83**. Tool descriptions and `src/utils/output-schemas.ts` are verified against that version; a few notes still cite an older version where that endpoint has not been re-verified live since.

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
