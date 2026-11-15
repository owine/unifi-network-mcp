// Smoke-test an installed server binary over stdio: it must start through its
// shebang, report this package's version, and serve read-only tools in
// read-only mode and more in read-write mode, and it must fail to start when
// the console cannot be reached. No tool is called, and the listing runs skip
// the startup check, so nothing contacts a controller.
//
// Usage: node scripts/smoke-stdio.mjs <path to the unifi-network-mcp binary>
import { readFile } from "node:fs/promises";
import { createServer } from "node:net";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const [bin] = process.argv.slice(2);
if (!bin) {
  console.error("usage: node scripts/smoke-stdio.mjs <server binary>");
  process.exit(2);
}
const { version } = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

function transport(env, stderr = "inherit") {
  return new StdioClientTransport({
    command: bin,
    stderr,
    env: { ...process.env, UNIFI_NETWORK_API_KEY: "smoke-test", ...env },
  });
}

async function listTools(readOnly) {
  const client = new Client({ name: "smoke", version: "0.0.0" });
  await client.connect(transport({
    UNIFI_NETWORK_HOST: "127.0.0.1",
    UNIFI_NETWORK_READ_ONLY: String(readOnly),
    UNIFI_NETWORK_STARTUP_CHECK: "false",
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

// A local listener that drops every connection stands in for a console that
// cannot be used: the startup check fails, and the server must exit rather
// than complete the MCP handshake.
async function expectStartupFailure() {
  const dropper = createServer((socket) => socket.destroy());
  await new Promise((resolve) => dropper.listen(0, "127.0.0.1", resolve));
  const client = new Client({ name: "smoke", version: "0.0.0" });
  const failing = transport({ UNIFI_NETWORK_HOST: `127.0.0.1:${dropper.address().port}` }, "pipe");
  let log = "";
  failing.stderr?.on("data", (chunk) => { log += chunk; });
  try {
    await client.connect(failing);
  } catch {
    if (!log.includes("Cannot connect to the UniFi console")) {
      throw new Error(`server exited without the connection error; stderr was: ${log}`);
    }
    return;
  } finally {
    await client.close();
    dropper.close();
  }
  throw new Error("server completed the MCP handshake although the console is unreachable");
}

await expectStartupFailure();
const readOnlyTools = await listTools(true);
const allTools = await listTools(false);
if (readOnlyTools.length === 0 || readOnlyTools.some((tool) => tool.annotations?.readOnlyHint !== true)) {
  throw new Error("read-only mode must serve only read-only tools");
}
if (allTools.length <= readOnlyTools.length) {
  throw new Error("read-write mode must add write tools");
}
console.error(`smoke ok: ${version} refuses to start without a console, and serves ${readOnlyTools.length} read-only / ${allTools.length} tools over stdio`);
