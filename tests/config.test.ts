import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../src/config.js";

describe("loadConfig", () => {
  const ENV_KEYS = [
    "UNIFI_NETWORK_HOST",
    "UNIFI_NETWORK_CONSOLE_ID",
    "UNIFI_NETWORK_API_KEY",
    "UNIFI_NETWORK_VERIFY_SSL",
    "UNIFI_NETWORK_READ_ONLY",
    "UNIFI_NETWORK_CA_CERT",
  ] as const;

  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    saved = {};
    for (const key of ENV_KEYS) {
      saved[key] = process.env[key];
    }
    // Provide valid defaults so tests only override what they're testing
    process.env.UNIFI_NETWORK_HOST = "192.168.1.1";
    process.env.UNIFI_NETWORK_API_KEY = "test-api-key";
    delete process.env.UNIFI_NETWORK_CONSOLE_ID;
    delete process.env.UNIFI_NETWORK_VERIFY_SSL;
    delete process.env.UNIFI_NETWORK_READ_ONLY;
    delete process.env.UNIFI_NETWORK_CA_CERT;
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      process.env[key] = saved[key] ?? "";
      if (!saved[key]) Reflect.deleteProperty(process.env, key);
    }
    vi.restoreAllMocks();
  });

  // ── Valid config ────────────────────────────────────────────────────

  it("should return a valid config when required env vars are set", () => {
    const config = loadConfig();
    expect(config).toEqual({
      host: "192.168.1.1",
      apiKey: "test-api-key",
      verifySsl: true,
      readOnly: true,
    });
  });

  // ── Required env vars ──────────────────────────────────────────────

  it("should exit when UNIFI_NETWORK_HOST is missing", () => {
    delete process.env.UNIFI_NETWORK_HOST;
    const exitMock = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never);
    vi.spyOn(console, "error").mockImplementation(vi.fn());

    loadConfig();
    expect(exitMock).toHaveBeenCalledWith(1);
  });

  it("should exit when UNIFI_NETWORK_API_KEY is missing", () => {
    delete process.env.UNIFI_NETWORK_API_KEY;
    const exitMock = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never);
    vi.spyOn(console, "error").mockImplementation(vi.fn());

    loadConfig();
    expect(exitMock).toHaveBeenCalledWith(1);
  });

  // ── verifySsl boolean parsing ──────────────────────────────────────

  describe("UNIFI_NETWORK_CA_CERT", () => {
    let dir: string;
    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), "unifi-ca-"));
    });
    afterEach(() => {
      rmSync(dir, { recursive: true, force: true });
    });
    const exitOnError = () => {
      vi.spyOn(console, "error").mockImplementation(vi.fn());
      return vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    };

    it("loads the certificate the variable points at", () => {
      execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-subj", "/CN=unifi.local",
        "-keyout", join(dir, "key.pem"), "-out", join(dir, "cert.pem")], { stdio: "ignore" });
      process.env.UNIFI_NETWORK_CA_CERT = join(dir, "cert.pem");
      expect(loadConfig().caCert).toBe(readFileSync(join(dir, "cert.pem"), "utf8"));
    });

    it("exits when the file cannot be read", () => {
      process.env.UNIFI_NETWORK_CA_CERT = join(dir, "missing.pem");
      const exitMock = exitOnError();
      loadConfig();
      expect(exitMock).toHaveBeenCalledWith(1);
    });

    it("exits when the file holds no certificate", () => {
      writeFileSync(join(dir, "junk.pem"), "not a certificate");
      process.env.UNIFI_NETWORK_CA_CERT = join(dir, "junk.pem");
      const exitMock = exitOnError();
      loadConfig();
      expect(exitMock).toHaveBeenCalledWith(1);
    });

    it("exits when combined with turning verification off", () => {
      writeFileSync(join(dir, "junk.pem"), "irrelevant");
      process.env.UNIFI_NETWORK_CA_CERT = join(dir, "junk.pem");
      process.env.UNIFI_NETWORK_VERIFY_SSL = "false";
      const exitMock = exitOnError();
      loadConfig();
      expect(exitMock).toHaveBeenCalledWith(1);
    });
  });

  it("should exit when TLS verification is disabled for api.ui.com", () => {
    // The Cloud Connector key reaches every console on the account, over the
    // internet: never send it without verifying the certificate.
    process.env.UNIFI_NETWORK_HOST = "api.ui.com";
    process.env.UNIFI_NETWORK_VERIFY_SSL = "false";
    const exitMock = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never);
    const errorMock = vi.spyOn(console, "error").mockImplementation(vi.fn());

    loadConfig();
    expect(exitMock).toHaveBeenCalledWith(1);
    expect(JSON.stringify(errorMock.mock.calls)).toContain("api.ui.com");
  });

  it("should allow disabling TLS verification for a local console", () => {
    process.env.UNIFI_NETWORK_VERIFY_SSL = "false";
    expect(loadConfig().verifySsl).toBe(false);
  });

  it("should default verifySsl to true when env var is missing", () => {
    const config = loadConfig();
    expect(config.verifySsl).toBe(true);
  });

  it('should set verifySsl to false when env var is "false"', () => {
    process.env.UNIFI_NETWORK_VERIFY_SSL = "false";
    const config = loadConfig();
    expect(config.verifySsl).toBe(false);
  });

  it('should set verifySsl to false when env var is "FALSE" (case insensitive)', () => {
    process.env.UNIFI_NETWORK_VERIFY_SSL = "FALSE";
    const config = loadConfig();
    expect(config.verifySsl).toBe(false);
  });

  it('should set verifySsl to true when env var is "true"', () => {
    process.env.UNIFI_NETWORK_VERIFY_SSL = "true";
    const config = loadConfig();
    expect(config.verifySsl).toBe(true);
  });

  it('should treat non-"false" strings as true for verifySsl', () => {
    process.env.UNIFI_NETWORK_VERIFY_SSL = "yes";
    const config = loadConfig();
    expect(config.verifySsl).toBe(true);
  });

  // ── readOnly boolean parsing ───────────────────────────────────────

  it("should default readOnly to true when env var is missing", () => {
    const config = loadConfig();
    expect(config.readOnly).toBe(true);
  });

  it('should set readOnly to false when env var is "false"', () => {
    process.env.UNIFI_NETWORK_READ_ONLY = "false";
    const config = loadConfig();
    expect(config.readOnly).toBe(false);
  });

  it('should set readOnly to false when env var is "False" (case insensitive)', () => {
    process.env.UNIFI_NETWORK_READ_ONLY = "False";
    const config = loadConfig();
    expect(config.readOnly).toBe(false);
  });
});
