# Security Policy

## Supported versions

Only the latest release line receives fixes. Upgrade to the newest version before reporting.

## Reporting a vulnerability

Please report privately through GitHub: open the repository's **Security** tab and choose **Report a vulnerability**. Do not open a public issue for a security problem.

Include what you can of:

- the affected version (the npm package version, or the `serverInfo.version` the server reports)
- your Node.js version and UniFi Network / console firmware version
- the `UNIFI_NETWORK_READ_ONLY` and `UNIFI_NETWORK_VERIFY_SSL` settings
- steps to reproduce, and what an attacker could achieve

Please do not include API keys, passphrases or other secrets.

## What to expect

You should get an acknowledgement within a week. Confirmed issues are fixed in a new release and disclosed through a GitHub security advisory, crediting the reporter unless they prefer otherwise.

## Scope

This server runs locally and holds a UniFi API key, driven by a language model that reads data other people can influence (client hostnames, device names). In scope, for example:

- a tool reaching a controller endpoint or action other than the one it describes
- a write that bypasses read-only mode, `dryRun` or a required `confirm`
- secrets (the API key, WiFi passphrases) leaking into tool output, errors or logs

Vulnerabilities in the UniFi controller itself should go to Ubiquiti.

## Handling a bad release

For maintainers. Publishing runs in CI through npm trusted publishing, which cannot change dist-tags or deprecate versions; these need a maintainer's own npm login.

```bash
# 1. Point @latest back at the last good version, so new npx runs stop pulling the bad one
npm dist-tag add @owine/unifi-network-mcp@<last-good> latest

# 2. Warn anyone who has the bad version
npm deprecate @owine/unifi-network-mcp@<bad> "Broken: <reason>. Use <last-good>, or upgrade once a fix is out."

# 3. Fix forward with a fix: PR; publishing the next release moves @latest again
```
