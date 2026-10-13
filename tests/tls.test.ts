import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:https";
import type { AddressInfo } from "node:net";
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

function selfSigned(name: string): { cert: string; key: string } {
  execFileSync("openssl", [
    "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-subj", "/CN=unifi.local",
    "-keyout", join(dir, `${name}.key`), "-out", join(dir, `${name}.pem`),
  ], { stdio: "ignore" });
  return { cert: readFileSync(join(dir, `${name}.pem`), "utf8"), key: readFileSync(join(dir, `${name}.key`), "utf8") };
}

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "unifi-tls-"));
  const console = selfSigned("console");
  consoleCert = console.cert;
  otherCert = selfSigned("other").cert;
  server = createServer({ cert: console.cert, key: console.key }, (_req, res) => {
    res.setHeader("content-type", "application/json");
    res.end('{"ok":true}');
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  host = `127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  server.close();
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

  it("leaves TLS verification for the rest of the process alone", () => {
    delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    client({ verifySsl: false });
    expect(process.env.NODE_TLS_REJECT_UNAUTHORIZED).toBeUndefined();
  });
});
