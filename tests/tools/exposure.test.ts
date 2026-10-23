import { describe, expect, it } from "vitest";
import { registerAllTools } from "../../src/tools/index.js";
import { createMockServer, createMockClient, mockFn, parseInputSchema } from "./_helpers.js";

const FAKE = "FAKE-SECRET-DO-NOT-USE";
const envelope = (data: unknown[]) => ({ meta: { rc: "ok" }, data });

const forward = {
  _id: "60c0ffee0000000000000101", name: "Web server", enabled: true, pfwd_interface: "wan",
  destination_ip: "any", destination_ips: [{ destination_ip: "203.0.113.7", interface: "wan" }],
  src: "any", src_limiting_enabled: false, src_limiting_type: "ip", src_firewall_group_id: "",
  dst_port: "443", fwd: "192.0.2.20", fwd_port: "8443", proto: "tcp_udp", log: false,
};

// Fields a settings section really carries next to the ones the tools read.
const mgmt = {
  _id: "s-mgmt", key: "mgmt", site_id: "site1",
  x_ssh_enabled: true, x_ssh_auth_password_enabled: true, x_ssh_bind_wildcard: false,
  x_ssh_username: FAKE, x_ssh_password: FAKE, x_ssh_md5passwd: FAKE, x_mgmt_key: FAKE,
  x_ssh_keys: [{ name: "laptop", key: FAKE, type: "ssh-ed25519" }, { name: "ci", key: FAKE, type: "ssh-rsa" }],
};
const usg = {
  _id: "s-usg", key: "usg", upnp_enabled: true, upnp_nat_pmp_enabled: true, upnp_secure_mode: true,
  upnp_wan_interface: "WAN", radius_secret: FAKE, x_dhcp_relay_secret: FAKE,
};
const cloud = { _id: "s-cloud", key: "super_cloudaccess", enabled: true, device_id: FAKE, x_private_key: FAKE, x_certificate_pem: FAKE };

const TOOLS = ["unifi_list_port_forwards", "unifi_get_upnp_status", "unifi_get_remote_access_status", "unifi_get_management_access"];

describe("internet exposure tools", () => {
  function setup({ readOnly = true, viaCloudConnector = false } = {}) {
    const server = createMockServer();
    const client = createMockClient();
    (client as { viaCloudConnector: boolean }).viaCloudConnector = viaCloudConnector;
    registerAllTools(server.server, client, readOnly);
    return { ...server, client };
  }
  const settings = (client: ReturnType<typeof setup>["client"], ...sections: unknown[]) =>
    mockFn(client, "getClassicSettings").mockResolvedValue(envelope(sections));

  it.each(TOOLS)("registers %s read-only, in read-only and read-write mode, with an output schema", (name) => {
    for (const readOnly of [true, false]) {
      const config = setup({ readOnly }).configs.get(name);
      expect(config.annotations.readOnlyHint).toBe(true);
      expect(config.annotations.destructiveHint).toBe(false);
      expect(config.outputSchema).toBeDefined();
      expect("dryRun" in config.schema).toBe(false);
    }
  });

  it.each(TOOLS)("%s takes a site internalReference and refuses a path in it", (name) => {
    const schema = parseInputSchema(setup().configs, name);
    expect(schema.safeParse({ siteReference: "default" }).success).toBe(true);
    expect(schema.safeParse({ siteReference: "../default" }).success).toBe(false);
    expect(schema.safeParse({}).success).toBe(false);
  });

  describe("unifi_list_port_forwards", () => {
    it("returns the allowlisted fields of every rule, with enabledCount", async () => {
      const { client, handlers } = setup();
      const disabled = { _id: "f2", name: "Old game server", enabled: false, dst_port: "27015", fwd: "192.0.2.30" };
      mockFn(client, "getClassic").mockResolvedValue(envelope([{ ...forward, site_id: "site1", x_secret: FAKE }, disabled]));
      const result = await handlers.get("unifi_list_port_forwards")({ siteReference: "default" });
      expect(result.isError).toBeUndefined();
      expect(mockFn(client, "getClassic")).toHaveBeenCalledWith("default", "portforward");
      expect(result.structuredContent).toEqual({ data: [forward, disabled], count: 2, enabledCount: 1, siteReference: "default" });
      expect(JSON.stringify(result)).not.toContain(FAKE);
    });

    it("drops unlisted fields inside destination_ips too", async () => {
      const { client, handlers } = setup();
      mockFn(client, "getClassic").mockResolvedValue(envelope([{ _id: "f1", destination_ips: [{ destination_ip: "198.51.100.1", interface: "wan2", x_key: FAKE }] }]));
      const result = await handlers.get("unifi_list_port_forwards")({ siteReference: "default" });
      expect(result.structuredContent.data).toEqual([{ _id: "f1", destination_ips: [{ destination_ip: "198.51.100.1", interface: "wan2" }] }]);
      expect(JSON.stringify(result)).not.toContain(FAKE);
    });

    it("counts a rule with no enabled field as enabled", async () => {
      const { client, handlers } = setup();
      mockFn(client, "getClassic").mockResolvedValue(envelope([{ _id: "f1" }]));
      expect((await handlers.get("unifi_list_port_forwards")({ siteReference: "default" })).structuredContent.enabledCount).toBe(1);
    });

    it("returns an empty list as such", async () => {
      const { client, handlers } = setup();
      mockFn(client, "getClassic").mockResolvedValue(envelope([]));
      const result = await handlers.get("unifi_list_port_forwards")({ siteReference: "default" });
      expect(result.structuredContent).toEqual({ data: [], count: 0, enabledCount: 0, siteReference: "default" });
    });

    it("returns an error, not an empty list, when the read fails", async () => {
      const { client, handlers } = setup();
      mockFn(client, "getClassic").mockRejectedValue(new Error("Classic controller API returned HTTP 403"));
      const result = await handlers.get("unifi_list_port_forwards")({ siteReference: "default" });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("HTTP 403");
    });

    it("returns an error for a record without an _id", async () => {
      const { client, handlers } = setup();
      mockFn(client, "getClassic").mockResolvedValue(envelope([{ name: "No ID" }]));
      expect((await handlers.get("unifi_list_port_forwards")({ siteReference: "default" })).isError).toBe(true);
    });
  });

  describe("unifi_get_upnp_status", () => {
    it("reads the usg section's upnp fields", async () => {
      const { client, handlers } = setup();
      settings(client, mgmt, usg);
      const result = await handlers.get("unifi_get_upnp_status")({ siteReference: "default" });
      expect(mockFn(client, "getClassicSettings")).toHaveBeenCalledWith("default");
      expect(result.structuredContent).toEqual({
        siteReference: "default", status: "available", source: "usg",
        upnp_enabled: true, upnp_nat_pmp_enabled: true, upnp_secure_mode: true, upnp_wan_interface: "WAN",
        detail: expect.stringMatching(/UPnP is on.*NAT-PMP is on too/),
      });
      expect(JSON.stringify(result)).not.toContain(FAKE);
    });

    it("reports UPnP off", async () => {
      const { client, handlers } = setup();
      settings(client, { key: "usg", upnp_enabled: false, upnp_nat_pmp_enabled: true });
      const result = await handlers.get("unifi_get_upnp_status")({ siteReference: "default" });
      expect(result.structuredContent).toMatchObject({ status: "available", upnp_enabled: false, upnp_nat_pmp_enabled: true, upnp_secure_mode: null });
      expect(result.structuredContent.detail).toMatch(/UPnP is off/);
    });

    it("prefers a dedicated upnp section, with or without the upnp_ prefix", async () => {
      const { client, handlers } = setup();
      settings(client, { key: "usg", upnp_enabled: false }, { key: "upnp", enabled: true, nat_pmp_enabled: false, wan_interface: "WAN2" });
      const result = await handlers.get("unifi_get_upnp_status")({ siteReference: "default" });
      expect(result.structuredContent).toMatchObject({
        source: "upnp", upnp_enabled: true, upnp_nat_pmp_enabled: false, upnp_wan_interface: "WAN2",
      });
    });

    it("falls back to usg when the upnp section has no enabled flag", async () => {
      const { client, handlers } = setup();
      settings(client, { key: "upnp" }, usg);
      expect((await handlers.get("unifi_get_upnp_status")({ siteReference: "default" })).structuredContent.source).toBe("usg");
    });

    it.each([
      ["no usg section", [mgmt]],
      ["a usg section without upnp fields", [{ key: "usg", mss_clamp: "auto" }]],
      ["a non-boolean flag", [{ key: "usg", upnp_enabled: "yes" }]],
    ])("is unavailable, not off, with %s", async (_label, sections) => {
      const { client, handlers } = setup();
      settings(client, ...sections);
      const result = await handlers.get("unifi_get_upnp_status")({ siteReference: "default" });
      expect(result.isError).toBeUndefined();
      expect(result.structuredContent).toMatchObject({ status: "unavailable", source: null, upnp_enabled: null });
      expect(result.structuredContent.detail).toContain("not a result that UPnP is off");
    });

    it("returns an error when the settings cannot be read", async () => {
      const { client, handlers } = setup();
      mockFn(client, "getClassicSettings").mockRejectedValue(new Error("Classic controller API returned HTTP 401"));
      expect((await handlers.get("unifi_get_upnp_status")({ siteReference: "default" })).isError).toBe(true);
    });
  });

  describe("unifi_get_remote_access_status", () => {
    it("is unavailable against a local console, with the Network application's flag and no keys", async () => {
      const { client, handlers } = setup();
      settings(client, cloud, mgmt);
      const result = await handlers.get("unifi_get_remote_access_status")({ siteReference: "default" });
      expect(result.structuredContent).toEqual({
        siteReference: "default", remoteAccess: "unavailable", connection: "local", networkCloudAccessEnabled: true,
        detail: expect.stringContaining("cannot see UniFi OS Remote Access"),
      });
      expect(mockFn(client, "get")).not.toHaveBeenCalled();
      expect(JSON.stringify(result)).not.toContain(FAKE);
    });

    it("degrades to unavailable, not an error, when a local console's settings cannot be read", async () => {
      const { client, handlers } = setup();
      mockFn(client, "getClassicSettings").mockRejectedValue(new Error("Classic controller API returned HTTP 403"));
      const result = await handlers.get("unifi_get_remote_access_status")({ siteReference: "default" });
      expect(result.isError).toBeUndefined();
      expect(result.structuredContent).toMatchObject({ remoteAccess: "unavailable", networkCloudAccessEnabled: null });
      expect(result.structuredContent.detail).toContain("HTTP 403");
    });

    it("is enabled through the Cloud Connector once the settings read succeeds", async () => {
      const { client, handlers } = setup({ viaCloudConnector: true });
      settings(client, mgmt);
      const result = await handlers.get("unifi_get_remote_access_status")({ siteReference: "default" });
      expect(result.structuredContent).toMatchObject({ remoteAccess: "enabled", connection: "cloud-connector", networkCloudAccessEnabled: null });
      expect(mockFn(client, "get")).not.toHaveBeenCalled();
    });

    it("confirms the connector with an Integration API read when the classic one fails", async () => {
      const { client, handlers } = setup({ viaCloudConnector: true });
      mockFn(client, "getClassicSettings").mockRejectedValue(new Error("Classic controller API returned HTTP 403"));
      mockFn(client, "get").mockResolvedValue({ applicationVersion: "10.6.106" });
      const result = await handlers.get("unifi_get_remote_access_status")({ siteReference: "default" });
      expect(mockFn(client, "get")).toHaveBeenCalledWith("/info");
      expect(result.structuredContent.remoteAccess).toBe("enabled");
    });

    it("is unavailable, not an error, when the console cannot be reached through the connector", async () => {
      const { client, handlers } = setup({ viaCloudConnector: true });
      mockFn(client, "getClassicSettings").mockRejectedValue(new Error("HTTP 502"));
      mockFn(client, "get").mockRejectedValue(new Error("HTTP 502: console offline"));
      const result = await handlers.get("unifi_get_remote_access_status")({ siteReference: "default" });
      expect(result.isError).toBeUndefined();
      expect(result.structuredContent).toMatchObject({ remoteAccess: "unavailable", connection: "cloud-connector" });
      expect(result.structuredContent.detail).toContain("console offline");
    });
  });

  describe("unifi_get_management_access", () => {
    it("reports device SSH and counts its keys without returning credentials", async () => {
      const { client, handlers } = setup();
      settings(client, usg, mgmt);
      const result = await handlers.get("unifi_get_management_access")({ siteReference: "default" });
      expect(result.structuredContent).toEqual({
        siteReference: "default", status: "available",
        x_ssh_enabled: true, x_ssh_auth_password_enabled: true, x_ssh_bind_wildcard: false, sshKeyCount: 2,
        detail: expect.stringContaining("accepts passwords"),
      });
      expect(JSON.stringify(result)).not.toContain(FAKE);
      expect(JSON.stringify(result)).not.toContain("laptop");
    });

    it("reports key-only and disabled SSH", async () => {
      const { client, handlers } = setup();
      settings(client, { key: "mgmt", x_ssh_enabled: true, x_ssh_auth_password_enabled: false });
      const keyOnly = await handlers.get("unifi_get_management_access")({ siteReference: "default" });
      expect(keyOnly.structuredContent).toMatchObject({ x_ssh_auth_password_enabled: false, sshKeyCount: null });
      expect(keyOnly.structuredContent.detail).toContain("key authentication only");

      settings(client, { key: "mgmt", x_ssh_enabled: false });
      const off = await handlers.get("unifi_get_management_access")({ siteReference: "default" });
      expect(off.structuredContent).toMatchObject({ status: "available", x_ssh_enabled: false, detail: "Device SSH is off." });
    });

    it("is unavailable, not off, without a mgmt section", async () => {
      const { client, handlers } = setup();
      settings(client, usg);
      const result = await handlers.get("unifi_get_management_access")({ siteReference: "default" });
      expect(result.structuredContent).toMatchObject({ status: "unavailable", x_ssh_enabled: null, sshKeyCount: null });
      expect(result.structuredContent.detail).toContain("not a result that SSH is off");
    });

    it("returns an error when the settings envelope is not ok", async () => {
      const { client, handlers } = setup();
      mockFn(client, "getClassicSettings").mockResolvedValue({ meta: { rc: "error" }, data: [] });
      expect((await handlers.get("unifi_get_management_access")({ siteReference: "default" })).isError).toBe(true);
    });
  });
});
