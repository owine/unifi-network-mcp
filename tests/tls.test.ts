import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer as createHttpServer, type Server as HttpServer } from "node:http";
import { createServer, type Server } from "node:https";
import { connect, type AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NetworkClient } from "../src/client.js";
import type { Config } from "../src/config.js";

/**
 * TLS against a real HTTPS server with a console-style self-signed
 * certificate: issued to unifi.local, reached by IP. The certificates are
 * generated per run, so no private key lives in the repository.
 */

let dir: string;
let consoleCert: string;
let otherCert: string;
let server: Server;
let host: string;
let issuedLeaf: string;
let issuedServer: Server;
let issuedHost: string;

function selfSigned(name: string): { cert: string; key: string } {
  execFileSync("openssl", [
    "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-subj", "/CN=unifi.local",
    "-keyout", join(dir, `${name}.key`), "-out", join(dir, `${name}.pem`),
  ], { stdio: "ignore" });
  return { cert: readFileSync(join(dir, `${name}.pem`), "utf8"), key: readFileSync(join(dir, `${name}.key`), "utf8") };
}

/** A leaf for unifi.local signed by a throwaway private CA, as some consoles are set up. */
function caIssued(): { cert: string; key: string } {
  const run = (args: string[]) => execFileSync("openssl", args, { stdio: "ignore", cwd: dir });
  run(["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-subj", "/CN=Private CA", "-keyout", "ca.key", "-out", "ca.pem"]);
  run(["req", "-newkey", "rsa:2048", "-nodes", "-subj", "/CN=unifi.local", "-keyout", "leaf.key", "-out", "leaf.csr"]);
  run(["x509", "-req", "-in", "leaf.csr", "-CA", "ca.pem", "-CAkey", "ca.key", "-CAcreateserial", "-days", "1", "-out", "leaf.pem"]);
  return { cert: readFileSync(join(dir, "leaf.pem"), "utf8"), key: readFileSync(join(dir, "leaf.key"), "utf8") };
}

async function listen(httpsServer: Server): Promise<string> {
  await new Promise<void>((resolve) => httpsServer.listen(0, "127.0.0.1", resolve));
  return `127.0.0.1:${(httpsServer.address() as AddressInfo).port}`;
}

const answer = (_req: unknown, res: { setHeader: (k: string, v: string) => void; end: (b: string) => void }) => {
  res.setHeader("content-type", "application/json");
  res.end('{"ok":true}');
};

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "unifi-tls-"));
  const console = selfSigned("console");
  consoleCert = console.cert;
  otherCert = selfSigned("other").cert;
  server = createServer({ cert: console.cert, key: console.key }, answer);
  host = await listen(server);
  const issued = caIssued();
  issuedLeaf = issued.cert;
  issuedServer = createServer({ cert: issued.cert, key: issued.key }, answer);
  issuedHost = await listen(issuedServer);
});

afterAll(() => {
  delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  server.close();
  issuedServer.close();
  rmSync(dir, { recursive: true, force: true });
});

const client = (overrides: Partial<Config>) =>
  new NetworkClient({ host, apiKey: "k", verifySsl: true, readOnly: true, ...overrides });

describe("TLS", () => {
  it("rejects a self-signed console by default", async () => {
    await expect(client({}).get("/info")).rejects.toThrow("fetch failed");
  });

  it("accepts the console with verification off", async () => {
    await expect(client({ verifySsl: false }).get("/info")).resolves.toEqual({ ok: true });
  });

  it("accepts the console's own pinned certificate, though its name does not match the IP", async () => {
    await expect(client({ caCert: consoleCert }).get("/info")).resolves.toEqual({ ok: true });
  });

  it("rejects the console when a different certificate is pinned", async () => {
    await expect(client({ caCert: otherCert }).get("/info")).rejects.toThrow("fetch failed");
  });

  it("accepts a pinned console certificate that a private CA issued", async () => {
    // The README's openssl command saves the leaf the console presents, which
    // need not be self-signed; it has to anchor the chain on its own.
    await expect(client({ host: issuedHost, caCert: issuedLeaf }).get("/info")).resolves.toEqual({ ok: true });
  });

  it("leaves TLS verification for the rest of the process alone", () => {
    delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    client({ verifySsl: false });
    expect(process.env.NODE_TLS_REJECT_UNAUTHORIZED).toBeUndefined();
  });
});

describe("TLS through an HTTP proxy", () => {
  let proxy: HttpServer;
  let tunnels: string[];
  const saved = { ...process.env };

  beforeAll(async () => {
    tunnels = [];
    // A CONNECT proxy, as a mandatory egress proxy would be.
    proxy = createHttpServer();
    proxy.on("connect", (req: { url?: string }, socket: import("node:net").Socket, head: Buffer) => {
      tunnels.push(req.url ?? "");
      const [targetHost, targetPort] = (req.url ?? "").split(":");
      const upstream = connect(Number(targetPort), targetHost, () => {
        socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
        upstream.write(head);
        upstream.pipe(socket);
        socket.pipe(upstream);
      });
      upstream.on("error", () => socket.destroy());
    });
    await new Promise<void>((resolve) => proxy.listen(0, "127.0.0.1", resolve));
    process.env.HTTPS_PROXY = `http://127.0.0.1:${(proxy.address() as AddressInfo).port}`;
    delete process.env.NO_PROXY;
    delete process.env.no_proxy;
  });

  afterAll(() => {
    process.env = saved;
    proxy.close();
  });

  it("goes through HTTPS_PROXY when Node's env-proxy support is on, keeping the pin", async () => {
    process.env.NODE_USE_ENV_PROXY = "1";
    await expect(client({ caCert: consoleCert }).get("/info")).resolves.toEqual({ ok: true });
    expect(tunnels).toContain(host);
  });

  it("still verifies the console's certificate through the proxy", async () => {
    process.env.NODE_USE_ENV_PROXY = "1";
    await expect(client({ caCert: otherCert }).get("/info")).rejects.toThrow("fetch failed");
  });

  it("ignores HTTPS_PROXY unless env-proxy support is on, as Node's fetch does", async () => {
    delete process.env.NODE_USE_ENV_PROXY;
    tunnels.length = 0;
    await expect(client({ caCert: consoleCert }).get("/info")).resolves.toEqual({ ok: true });
    expect(tunnels).toEqual([]);
  });
});
