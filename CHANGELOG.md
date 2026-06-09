# Changelog

## [2.7.4](https://github.com/owine/unifi-network-mcp/compare/2.7.3...2.7.4) (2026-06-09)


### Dependencies

* lock file maintenance ([#124](https://github.com/owine/unifi-network-mcp/issues/124)) ([b413cb7](https://github.com/owine/unifi-network-mcp/commit/b413cb7fa23f426aed59951e4ea59f66711eac2b))
* lock file maintenance all non-major dependencies ([#130](https://github.com/owine/unifi-network-mcp/issues/130)) ([3f30c56](https://github.com/owine/unifi-network-mcp/commit/3f30c56296407713f6d847f491bc508448e09fdb))

## [2.7.3](https://github.com/owine/unifi-network-mcp/compare/2.7.2...2.7.3) (2026-06-01)


### Dependencies

* lock file maintenance ([#120](https://github.com/owine/unifi-network-mcp/issues/120)) ([5ef44f6](https://github.com/owine/unifi-network-mcp/commit/5ef44f6d69c919a75763b80f54c2269ce9940d90))

## [2.7.2](https://github.com/owine/unifi-network-mcp/compare/2.7.1...2.7.2) (2026-05-26)


### Dependencies

* lock file maintenance ([#116](https://github.com/owine/unifi-network-mcp/issues/116)) ([33c9c18](https://github.com/owine/unifi-network-mcp/commit/33c9c1833254a10a1c3e0f8ba99c2077c0f3d661))

## [2.7.1](https://github.com/owine/unifi-network-mcp/compare/2.7.0...2.7.1) (2026-05-25)


### Dependencies

* lock file maintenance ([#107](https://github.com/owine/unifi-network-mcp/issues/107)) ([f5ff7d4](https://github.com/owine/unifi-network-mcp/commit/f5ff7d4097abb35a5b96cedd226910534cf12290))

## [2.7.0](https://github.com/owine/unifi-network-mcp/compare/2.6.0...2.7.0) (2026-05-15)


### Features

* add outputSchema to all resource-returning tools, verified against live API 10.4.55 ([4e58e32](https://github.com/owine/unifi-network-mcp/commit/4e58e32a741599bdf374096305a61f796ff1506d))


### Dependencies

* lock file maintenance ([#106](https://github.com/owine/unifi-network-mcp/issues/106)) ([f1319d0](https://github.com/owine/unifi-network-mcp/commit/f1319d0eddec708c23608d640450eb1380452844))

## [2.6.0](https://github.com/owine/unifi-network-mcp/compare/2.5.0...2.6.0) (2026-05-13)


### Features

* add lefthook with eslint + typecheck + ggshield ([5c0fe7c](https://github.com/owine/unifi-network-mcp/commit/5c0fe7ca176807312fdb023b3f8ecb30e5a6a00f))


### Bug Fixes

* **lefthook:** prefix each Node command with 'eval "$(fnm env)"' ([d7ae17d](https://github.com/owine/unifi-network-mcp/commit/d7ae17d53d5fa72281ebc17cf3c5945a49127dfd))
* **lefthook:** wrap each Node command with 'fnm use' for shell-agnostic resolution ([dca45ec](https://github.com/owine/unifi-network-mcp/commit/dca45ec1eb4f5653fe238c185fbc7f6d59797ff8))
* **node:** proper LTS engines range; drop EOL Node 20 from CI matrix ([2c066e7](https://github.com/owine/unifi-network-mcp/commit/2c066e744991193a91f5e27fd03042d1a208510f))

## [2.5.0](https://github.com/owine/unifi-network-mcp/compare/2.4.0...2.5.0) (2026-05-13)


### Features

* pin dependency @modelcontextprotocol/sdk to 1.29.0 ([#84](https://github.com/owine/unifi-network-mcp/issues/84)) ([9c569c6](https://github.com/owine/unifi-network-mcp/commit/9c569c690ac5270bb60c084742d33d5ec6cd3926))


### Bug Fixes

* pin dependency zod to 4.4.3 ([#85](https://github.com/owine/unifi-network-mcp/issues/85)) ([6210813](https://github.com/owine/unifi-network-mcp/commit/62108137c40e57980437f7e9ac5cfd677652e9dc))


### Dependencies

* lock file maintenance ([#89](https://github.com/owine/unifi-network-mcp/issues/89)) ([0a115dd](https://github.com/owine/unifi-network-mcp/commit/0a115dde0e26dba0d9c674964075e93b4d23ff56))
* lock file maintenance ([#94](https://github.com/owine/unifi-network-mcp/issues/94)) ([8acecea](https://github.com/owine/unifi-network-mcp/commit/8acecea7932d1aa408e0c5a57280563ee23bd0b4))

## [2.4.0](https://github.com/owine/unifi-network-mcp/compare/2.3.3...2.4.0) (2026-05-11)


### Features

* **acl:** tighten rule schema enums to match API v10.4.46 ([a08fb66](https://github.com/owine/unifi-network-mcp/commit/a08fb66a5ad24dd70ff0d8b288ad8d64c1e3306b))
* **wifi:** add v10.4.46 broadcast fields ([a8c4ebd](https://github.com/owine/unifi-network-mcp/commit/a8c4ebd1a1ebdee38c600e54bfb99511963f164d))


### Bug Fixes

* **firewall:** require both zone IDs for policy ordering query ([ab00c43](https://github.com/owine/unifi-network-mcp/commit/ab00c4386c0c4c911cb126922a02c95669febe40))


### Dependencies

* lock file maintenance ([#81](https://github.com/owine/unifi-network-mcp/issues/81)) ([13c7172](https://github.com/owine/unifi-network-mcp/commit/13c71724d96d18dd0473f041c113ae204553f1c6))
* npm audit fix for fast-uri CVE-2026-6322 ([44762e6](https://github.com/owine/unifi-network-mcp/commit/44762e6e464907d3a9080e70429909b4076335d6))

## [2.3.3](https://github.com/owine/unifi-network-mcp/compare/2.3.2...2.3.3) (2026-05-04)


### Dependencies

* lock file maintenance ([#74](https://github.com/owine/unifi-network-mcp/issues/74)) ([d9f31fe](https://github.com/owine/unifi-network-mcp/commit/d9f31fe06596fe9e395d599d0d59efd2e066609d))

## [2.3.2](https://github.com/owine/unifi-network-mcp/compare/2.3.1...2.3.2) (2026-04-28)


### Dependencies

* lock file maintenance ([#69](https://github.com/owine/unifi-network-mcp/issues/69)) ([35df5e4](https://github.com/owine/unifi-network-mcp/commit/35df5e4ff26ca64ba09235f196b0bed054c55935))
* lock file maintenance ([#72](https://github.com/owine/unifi-network-mcp/issues/72)) ([962923e](https://github.com/owine/unifi-network-mcp/commit/962923e580c3357a8535cf0748f37036e9c5de80))

## [2.3.1](https://github.com/owine/unifi-network-mcp/compare/v2.3.0...2.3.1) (2026-04-07)


### Dependencies

* lock file maintenance ([#57](https://github.com/owine/unifi-network-mcp/issues/57)) ([ed1d5e5](https://github.com/owine/unifi-network-mcp/commit/ed1d5e5ea4500725ed07db1644c337028b9db920))
* lock file maintenance ([#62](https://github.com/owine/unifi-network-mcp/issues/62)) ([703717c](https://github.com/owine/unifi-network-mcp/commit/703717ce965ef520e2a8085719ece0422eb1fa36))

## [2.3.0](https://github.com/owine/unifi-network-mcp/compare/v2.2.1...v2.3.0) (2026-04-01)


### Features

* upgrade to TypeScript 6 ([7fa66ca](https://github.com/owine/unifi-network-mcp/commit/7fa66ca94ff054e5bff1ace19a40015d9e59eb40))

## [2.2.1](https://github.com/owine/unifi-network-mcp/compare/v2.2.0...v2.2.1) (2026-03-30)


### Miscellaneous Chores

* release 2.2.1 ([bbdf014](https://github.com/owine/unifi-network-mcp/commit/bbdf014ecd822cd8886da6f2d08a3447c42ff589))

## [2.2.0](https://github.com/owine/unifi-network-mcp/compare/v2.1.0...v2.2.0) (2026-03-15)


### Features

* add switching domain tools for API v10.2.93 ([971873b](https://github.com/owine/unifi-network-mcp/commit/971873b3339e6846d17789b642e40fe93feec8d8))


### Bug Fixes

* align tool schemas with API v10.2.93 spec ([c356ff6](https://github.com/owine/unifi-network-mcp/commit/c356ff68b47907e0ce82677fe120761ab6ee6aac))

## [2.1.0](https://github.com/owine/unifi-network-mcp/compare/v2.0.2...v2.1.0) (2026-03-10)


### Features

* **ci:** add dependency security scanning ([#32](https://github.com/owine/unifi-network-mcp/issues/32)) ([0848de0](https://github.com/owine/unifi-network-mcp/commit/0848de0be5cff01c50cb72fa4340232cd9f30c05))

## [2.0.2](https://github.com/owine/unifi-network-mcp/compare/v2.0.1...v2.0.2) (2026-03-10)


### Miscellaneous Chores

* release 2.0.2 ([7df10d8](https://github.com/owine/unifi-network-mcp/commit/7df10d89d99796360e2701b800980b732e806108))

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
