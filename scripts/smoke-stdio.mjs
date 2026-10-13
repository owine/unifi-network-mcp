// Smoke-test an installed server binary over stdio: it must start through its
// shebang, report this package's version, and serve read-only tools in
// read-only mode and more in read-write mode. No tool is called, so nothing
// contacts a controller.
//
// Usage: node scripts/smoke-stdio.mjs <path to the unifi-network-mcp binary>
import { readFile } from "node:fs/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const [bin] = process.argv.slice(2);
if (!bin) {
  console.error("usage: node scripts/smoke-stdio.mjs <server binary>");
  process.exit(2);
}
const { version } = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

async function listTools(readOnly) {
  const client = new Client({ name: "smoke", version: "0.0.0" });
  await client.connect(new StdioClientTransport({
    command: bin,
    stderr: "inherit",
    env: {
      ...process.env,
      UNIFI_NETWORK_HOST: "127.0.0.1",
      UNIFI_NETWORK_API_KEY: "smoke-test",
      UNIFI_NETWORK_READ_ONLY: String(readOnly),
    },
  }));
  try {
    const served = client.getServerVersion()?.version;
    if (served !== version) throw new Error(`server reports version ${served}, package.json says ${version}`);
    if (!client.getInstructions()) throw new Error("server sent no instructions");
    return (await client.listTools()).tools;
  } finally {
    await client.close();
  }
}

const readOnlyTools = await listTools(true);
const allTools = await listTools(false);
if (readOnlyTools.length === 0 || readOnlyTools.some((tool) => tool.annotations?.readOnlyHint !== true)) {
  throw new Error("read-only mode must serve only read-only tools");
}
if (allTools.length <= readOnlyTools.length) {
  throw new Error("read-write mode must add write tools");
}
console.error(`smoke ok: ${version} serves ${readOnlyTools.length} read-only / ${allTools.length} tools over stdio`);
