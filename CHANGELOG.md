# Changelog

## [2.0.1](https://github.com/owine/unifi-network-mcp/compare/v2.0.0...v2.0.1) (2026-02-17)


### Miscellaneous Chores

* release 2.0.1 ([8e2384d](https://github.com/owine/unifi-network-mcp/commit/8e2384d094f12132dd6a22480aa03e33bc681d3d))

## [2.0.0](https://github.com/owine/unifi-network-mcp/compare/v1.0.0...v2.0.0) (2026-02-12)


### ⚠ BREAKING CHANGES

* readOnly now defaults to true instead of false. Users must explicitly set UNIFI_NETWORK_READ_ONLY=false to enable write tools, preventing accidental mutations on first run.

### Features

* add unifi_patch_firewall_policy tool ([368b103](https://github.com/owine/unifi-network-mcp/commit/368b1037b42559728dfa5c233b17145b57362bcc))
* default readOnly to true for safer out-of-the-box config ([1c4b8bf](https://github.com/owine/unifi-network-mcp/commit/1c4b8bf060a5e2f500e60ce5cec717a0b79fbc18))


### Bug Fixes

* correct API endpoint paths to match UniFi Integration API spec ([d9c29e7](https://github.com/owine/unifi-network-mcp/commit/d9c29e773dd72b383573a92d515024b6399ad188))
* resolve merge conflict in package-lock.json ([eb87f48](https://github.com/owine/unifi-network-mcp/commit/eb87f486ad8cab9c5c9fb74fa931826d707b5176))

## 1.0.0 (2026-02-12)


### Features

* add all 67 tool handlers across 12 API domains ([d0d153e](https://github.com/owine/unifi-network-mcp/commit/d0d153ea3b2cc9522452af666b42e8c33dff550e))
* add core infrastructure — config, HTTP client, and utilities ([30b9dc8](https://github.com/owine/unifi-network-mcp/commit/30b9dc832dd30bb35cdebb00c8291c897b571c9a))
* add MCP server entry point with stdio transport ([a7fd629](https://github.com/owine/unifi-network-mcp/commit/a7fd629225d2040a10d58ef041e2525be669b79b))
