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
    "UNIFI_NETWORK_WRITE_TOOLS",
    "UNIFI_NETWORK_ALLOW_WAN_EXPOSURE",
    "UNIFI_NETWORK_WAN_ZONE_IDS",
    "UNIFI_NETWORK_WRITE_LOG",
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
    delete process.env.UNIFI_NETWORK_WRITE_TOOLS;
    delete process.env.UNIFI_NETWORK_ALLOW_WAN_EXPOSURE;
    delete process.env.UNIFI_NETWORK_WAN_ZONE_IDS;
    delete process.env.UNIFI_NETWORK_WRITE_LOG;
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

  it.each(["API.UI.COM", "api.ui.com.", "api.ui.com:443", "Api.Ui.Com.:443"])(
    "should exit when TLS verification is disabled for api.ui.com written as %s",
    (host) => {
      // URL parsing sends each of these to api.ui.com, so each must be refused.
      process.env.UNIFI_NETWORK_HOST = host;
      process.env.UNIFI_NETWORK_VERIFY_SSL = "false";
      const exitMock = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
      vi.spyOn(console, "error").mockImplementation(vi.fn());
      loadConfig();
      expect(exitMock).toHaveBeenCalledWith(1);
    }
  );

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

  // ── UNIFI_NETWORK_WRITE_TOOLS ──────────────────────────────────────

  describe("UNIFI_NETWORK_WRITE_TOOLS", () => {
    beforeEach(() => {
      process.env.UNIFI_NETWORK_READ_ONLY = "false";
    });
    const exitOnError = () => {
      const errorMock = vi.spyOn(console, "error").mockImplementation(vi.fn());
      const exitMock = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
      return { errorMock, exitMock };
    };

    it("leaves every write tool enabled when unset", () => {
      expect(loadConfig().writeTools).toBeUndefined();
    });

    it("expands a group to its tools", () => {
      process.env.UNIFI_NETWORK_WRITE_TOOLS = "wifi";
      expect(loadConfig().writeTools).toEqual(["unifi_create_wifi", "unifi_update_wifi", "unifi_delete_wifi"]);
    });

    it("combines tools and groups, ignoring spaces, empty entries and repeats", () => {
      process.env.UNIFI_NETWORK_WRITE_TOOLS = " unifi_update_wifi, ,dns-policies,unifi_update_wifi ";
      expect(loadConfig().writeTools).toEqual([
        "unifi_update_wifi", "unifi_create_dns_policy", "unifi_update_dns_policy", "unifi_delete_dns_policy",
      ]);
    });

    it.each(["", "none", "NONE", " none ", " , "])("enables no write tools for %j", (value) => {
      process.env.UNIFI_NETWORK_WRITE_TOOLS = value;
      expect(loadConfig().writeTools).toEqual([]);
    });

    it.each([
      ["a misspelt tool", "unifi_update_wfi", "unifi_update_wfi"],
      ["a read tool", "unifi_list_wifi", "unifi_list_wifi"],
      ["a module with no write tools", "system", "system"],
      ["a group in the wrong case", "WiFi", "WiFi"],
      ["none alongside other names", "none,wifi", "none"],
    ])("exits for %s, listing the valid names", (_label, value, unknown) => {
      process.env.UNIFI_NETWORK_WRITE_TOOLS = value;
      const { errorMock, exitMock } = exitOnError();
      loadConfig();
      expect(exitMock).toHaveBeenCalledWith(1);
      const message = String(errorMock.mock.calls[0][0]);
      expect(message).toContain(`unknown write tools or groups: ${unknown}`);
      expect(message).toContain("traffic-matching");
      expect(message).toContain("unifi_power_cycle_port");
    });

    it("is ignored with a warning when the server is read-only", () => {
      process.env.UNIFI_NETWORK_READ_ONLY = "true";
      process.env.UNIFI_NETWORK_WRITE_TOOLS = "wifi";
      const errorMock = vi.spyOn(console, "error").mockImplementation(vi.fn());
      const config = loadConfig();
      expect(config.readOnly).toBe(true);
      expect(config.writeTools).toBeUndefined();
      expect(errorMock).toHaveBeenCalledWith(expect.stringContaining("Ignoring UNIFI_NETWORK_WRITE_TOOLS"));
    });

    it("still rejects an unknown name when the server is read-only", () => {
      delete process.env.UNIFI_NETWORK_READ_ONLY;
      process.env.UNIFI_NETWORK_WRITE_TOOLS = "wifii";
      const { exitMock } = exitOnError();
      loadConfig();
      expect(exitMock).toHaveBeenCalledWith(1);
    });
  });

  // ── WAN exposure ───────────────────────────────────────────────────

  describe("UNIFI_NETWORK_ALLOW_WAN_EXPOSURE", () => {
    it("keeps the refusals on when unset", () => {
      expect(loadConfig().allowWanExposure).toBeUndefined();
    });

    it.each(["true", "TRUE", "True"])("turns them off for %j", (value) => {
      process.env.UNIFI_NETWORK_ALLOW_WAN_EXPOSURE = value;
      expect(loadConfig().allowWanExposure).toBe(true);
    });

    it.each(["false", "yes", "1", ""])("keeps them on for %j: only true counts", (value) => {
      process.env.UNIFI_NETWORK_ALLOW_WAN_EXPOSURE = value;
      expect(loadConfig().allowWanExposure).toBeUndefined();
    });
  });

  describe("UNIFI_NETWORK_WAN_ZONE_IDS", () => {
    const external = "6F1C2A52-3B6D-4A8E-9A0B-2D5E8F7C1A90";
    const other = "0b6d9c1e-58a4-4f43-8e0f-1c2d3e4f5a6b";

    it("is undefined when unset or empty", () => {
      expect(loadConfig().wanZoneIds).toBeUndefined();
      process.env.UNIFI_NETWORK_WAN_ZONE_IDS = "";
      expect(loadConfig().wanZoneIds).toBeUndefined();
    });

    it("parses a comma-separated list, lower-cased, ignoring spaces and empty entries", () => {
      process.env.UNIFI_NETWORK_WAN_ZONE_IDS = ` ${external}, ,${other} `;
      expect(loadConfig().wanZoneIds).toEqual([external.toLowerCase(), other]);
    });

    it.each(["external", "zone1", `${external}x`, `${external};${other}`])("exits for %j, which is not a zone UUID", (value) => {
      process.env.UNIFI_NETWORK_WAN_ZONE_IDS = value;
      vi.spyOn(console, "error").mockImplementation(vi.fn());
      const exitMock = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
      loadConfig();
      expect(exitMock).toHaveBeenCalledWith(1);
    });
  });

  // ── UNIFI_NETWORK_WRITE_LOG ────────────────────────────────────────

  describe("UNIFI_NETWORK_WRITE_LOG", () => {
    it("is off when unset or empty", () => {
      expect(loadConfig().writeLog).toBeUndefined();
      process.env.UNIFI_NETWORK_WRITE_LOG = "";
      expect(loadConfig().writeLog).toBeUndefined();
    });

    it("takes an absolute path", () => {
      process.env.UNIFI_NETWORK_READ_ONLY = "false";
      process.env.UNIFI_NETWORK_WRITE_LOG = "/var/log/unifi-mcp/writes.jsonl";
      expect(loadConfig().writeLog).toBe("/var/log/unifi-mcp/writes.jsonl");
    });

    it.each(["writes.jsonl", "~/writes.jsonl", "./logs/writes.jsonl"])("exits for the relative path %j", (value) => {
      process.env.UNIFI_NETWORK_WRITE_LOG = value;
      const errorMock = vi.spyOn(console, "error").mockImplementation(vi.fn());
      const exitMock = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
      loadConfig();
      expect(exitMock).toHaveBeenCalledWith(1);
      expect(String(errorMock.mock.calls[0][0])).toContain("absolute path");
    });

    it("is ignored with a warning when the server is read-only", () => {
      process.env.UNIFI_NETWORK_WRITE_LOG = "/tmp/writes.jsonl";
      const errorMock = vi.spyOn(console, "error").mockImplementation(vi.fn());
      const config = loadConfig();
      expect(config.readOnly).toBe(true);
      expect(config.writeLog).toBeUndefined();
      expect(errorMock).toHaveBeenCalledWith(expect.stringContaining("Ignoring UNIFI_NETWORK_WRITE_LOG"));
    });

    it("still rejects a relative path when the server is read-only", () => {
      process.env.UNIFI_NETWORK_WRITE_LOG = "writes.jsonl";
      vi.spyOn(console, "error").mockImplementation(vi.fn());
      const exitMock = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
      loadConfig();
      expect(exitMock).toHaveBeenCalledWith(1);
    });

    it("is kept, without a warning, when writes are on", () => {
      process.env.UNIFI_NETWORK_READ_ONLY = "false";
      process.env.UNIFI_NETWORK_WRITE_LOG = "/tmp/writes.jsonl";
      const errorMock = vi.spyOn(console, "error").mockImplementation(vi.fn());
      expect(loadConfig()).toMatchObject({ readOnly: false, writeLog: "/tmp/writes.jsonl" });
      expect(errorMock).not.toHaveBeenCalled();
    });
  });
});
