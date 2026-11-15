import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { openWriteLog } from "../src/write-log.js";

/**
 * Startup in src/index.ts, run without stdio: the transport is a stub and
 * connect does nothing, so main() returns once the server is set up.
 */

vi.mock("@modelcontextprotocol/sdk/server/stdio.js", () => ({ StdioServerTransport: vi.fn() }));
// Spied on, not replaced, to see whether startup opens the log.
vi.mock("../src/write-log.js", async (importOriginal) => {
  const writeLog = await importOriginal<typeof import("../src/write-log.js")>();
  return { ...writeLog, openWriteLog: vi.fn(writeLog.openWriteLog) };
});

const ENV_KEYS = ["UNIFI_NETWORK_HOST", "UNIFI_NETWORK_API_KEY", "UNIFI_NETWORK_READ_ONLY", "UNIFI_NETWORK_WRITE_LOG", "UNIFI_NETWORK_STARTUP_CHECK"] as const;

describe("startup", () => {
  let saved: Partial<Record<string, string>>;
  let dir: string;
  let logPath: string;
  let errorMock: ReturnType<typeof vi.spyOn>;
  let connect: ReturnType<typeof vi.spyOn>;
  let checkConnection: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    saved = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
    dir = mkdtempSync(join(tmpdir(), "unifi-start-"));
    logPath = join(dir, "state", "writes.jsonl");
    process.env.UNIFI_NETWORK_HOST = "192.0.2.1";
    process.env.UNIFI_NETWORK_API_KEY = "test-api-key-fixture";
    process.env.UNIFI_NETWORK_WRITE_LOG = logPath;
    errorMock = vi.spyOn(console, "error").mockImplementation(vi.fn());
    connect = vi.spyOn(McpServer.prototype, "connect").mockResolvedValue(undefined);
    vi.mocked(openWriteLog).mockClear();
    vi.resetModules();
    // Spied on the instance index.js is about to import, after the reset.
    const { NetworkClient } = await import("../src/client.js");
    checkConnection = vi.spyOn(NetworkClient.prototype, "checkConnection").mockResolvedValue(undefined);
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) Reflect.deleteProperty(process.env, key);
      else process.env[key] = saved[key];
    }
    rmSync(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  async function start() {
    await import("../src/index.js");
    await vi.waitFor(() => { expect(connect).toHaveBeenCalled(); });
  }

  it("ignores UNIFI_NETWORK_WRITE_LOG when read-only, creating neither the file nor its directory", async () => {
    process.env.UNIFI_NETWORK_READ_ONLY = "true";
    await start();
    expect(openWriteLog).not.toHaveBeenCalled();
    expect(existsSync(join(dir, "state"))).toBe(false);
    expect(errorMock).toHaveBeenCalledWith(expect.stringContaining("Ignoring UNIFI_NETWORK_WRITE_LOG"));
  });

  it("opens the write log when writes are on", async () => {
    process.env.UNIFI_NETWORK_READ_ONLY = "false";
    await start();
    expect(openWriteLog).toHaveBeenCalledWith(logPath, "test-api-key-fixture");
    expect(existsSync(logPath)).toBe(true);
  });

  describe("console check", () => {
    it("checks the console before the transport connects", async () => {
      await start();
      expect(checkConnection).toHaveBeenCalledOnce();
      expect(checkConnection.mock.invocationCallOrder[0]).toBeLessThan(connect.mock.invocationCallOrder[0]);
    });

    it("exits with the reason, never connecting, when the console cannot be used", async () => {
      const exit = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
      checkConnection.mockRejectedValue(
        new TypeError("fetch failed", { cause: Object.assign(new Error("self-signed certificate"), { code: "DEPTH_ZERO_SELF_SIGNED_CERT" }) })
      );
      await import("../src/index.js");
      await vi.waitFor(() => { expect(exit).toHaveBeenCalledWith(1); });
      const message = String(errorMock.mock.calls.find(([line]: unknown[]) => String(line).startsWith("Cannot connect"))?.[0]);
      expect(message).toContain("Cannot connect to the UniFi console at 192.0.2.1: fetch failed (DEPTH_ZERO_SELF_SIGNED_CERT)");
      expect(message).toContain("UNIFI_NETWORK_CA_CERT");
      expect(message).toContain("UNIFI_NETWORK_STARTUP_CHECK=false");
      expect(connect).not.toHaveBeenCalled();
    });

    it("skips the check when UNIFI_NETWORK_STARTUP_CHECK is false", async () => {
      process.env.UNIFI_NETWORK_STARTUP_CHECK = "false";
      await start();
      expect(checkConnection).not.toHaveBeenCalled();
    });
  });
});
