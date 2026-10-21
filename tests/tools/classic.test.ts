import { describe, expect, it } from "vitest";
import { registerAllTools } from "../../src/tools/index.js";
import { createMockServer, createMockClient, mockFn, parseInputSchema } from "./_helpers.js";

const FAKE = "FAKE-SECRET-DO-NOT-USE";
const envelope = (data: unknown[]) => ({ meta: { rc: "ok" }, data });

const network = {
  _id: "60c0ffee0000000000000001", name: "LAN", purpose: "corporate", vlan: 10, vlan_enabled: true,
  ip_subnet: "192.168.10.1/24", networkgroup: "LAN", enabled: true, dhcpd_enabled: true,
  dhcpd_start: "192.168.10.6", dhcpd_stop: "192.168.10.254", domain_name: "lan", igmp_snooping: false,
  mdns_enabled: true, network_isolation_enabled: false, internet_access_enabled: true,
  firewall_zone_id: "60c0ffee00000000000000aa", is_nat: true, ipv6_interface_type: "none", setting_preference: "manual",
};

// Credential-bearing fields seen on WAN, VPN and RADIUS networkconf records.
const secrets = {
  x_passphrase: FAKE, x_wan_password: FAKE, wan_username: FAKE, x_ipsec_pre_shared_key: FAKE,
  x_ipsec_keyfile: FAKE, x_openvpn_shared_secret_key: FAKE, x_openvpn_password: FAKE, openvpn_username: FAKE,
  x_wireguard_private_key: FAKE, wireguard_client_peer_public_key: FAKE, wireguard_client_preshared_key: FAKE,
  x_radiusprofile_secret: FAKE, radius_secret: FAKE, x_pppoe_password: FAKE, pppoe_username: FAKE,
  x_l2tp_password: FAKE, x_mschapv2_password: FAKE, x_auth_key: FAKE, x_ca_crt: FAKE, x_server_key: FAKE,
  nested: { x_passphrase: FAKE },
};

const group = { _id: "g1", name: "Servers", group_type: "address-group", group_members: ["192.0.2.10"], site_id: "s1", x_secret: FAKE };
const rule = {
  _id: "r1", name: "Drop IoT", enabled: true, ruleset: "LAN_IN", rule_index: 2000, action: "drop", protocol: "all",
  protocol_match_excepted: false, logging: false, state_established: false, state_related: false,
  state_new: false, state_invalid: false, src_firewallgroup_ids: [], src_networkconf_id: "60c0ffee0000000000000001",
  src_networkconf_type: "NETv4", src_address: "", src_mac_address: "", src_port: "", dst_firewallgroup_ids: ["g1"],
  dst_networkconf_id: "", dst_networkconf_type: "NETv4", dst_address: "", dst_port: "", ipsec: "",
  setting_preference: "manual",
};

const TOOLS = [
  ["unifi_list_classic_networks", "networkconf"],
  ["unifi_list_firewall_groups", "firewallgroup"],
  ["unifi_list_legacy_firewall_rules", "firewallrule"],
] as const;

describe("classic API tools", () => {
  function setup(readOnly = true) {
    const server = createMockServer();
    const client = createMockClient();
    registerAllTools(server.server, client, readOnly);
    return { ...server, client };
  }

  it.each(TOOLS)("registers %s read-only, in read-only mode, with an output schema", (name) => {
    const { configs } = setup(true);
    const config = configs.get(name);
    expect(config.annotations.readOnlyHint).toBe(true);
    expect(config.annotations.destructiveHint).toBe(false);
    expect(config.outputSchema).toBeDefined();
    expect(config.description).toContain("classic controller API");
    expect(config.description).toContain("differ from Integration API IDs");
  });

  it("warns that legacy rules may not be enforced on zone-based firewall sites", () => {
    const { configs } = setup();
    expect(configs.get("unifi_list_legacy_firewall_rules").description).toMatch(/zone-based firewall these rules may not be enforced/);
  });

  it.each(TOOLS)("%s reads the %s collection for the site reference", async (name, collection) => {
    const { client, handlers } = setup();
    mockFn(client, "getClassic").mockResolvedValue(envelope([]));
    const result = await handlers.get(name)({ siteReference: "default" });
    expect(result.isError).toBeUndefined();
    expect(mockFn(client, "getClassic")).toHaveBeenCalledWith("default", collection);
    expect(result.structuredContent).toEqual({ data: [], count: 0, siteReference: "default" });
  });

  it("returns the allowlisted network fields", async () => {
    const { client, handlers } = setup();
    mockFn(client, "getClassic").mockResolvedValue(envelope([network]));
    const result = await handlers.get("unifi_list_classic_networks")({ siteReference: "default" });
    expect(result.structuredContent).toEqual({ data: [network], count: 1, siteReference: "default" });
  });

  it("never returns a networkconf credential, in structured or text output", async () => {
    const { client, handlers } = setup();
    const wan = { _id: "w1", name: "Internet 1", purpose: "wan", wan_type: "pppoe", ...secrets };
    const vpn = { _id: "v1", name: "VPN", purpose: "remote-user-vpn", vpn_type: "wireguard", ...secrets };
    mockFn(client, "getClassic").mockResolvedValue(envelope([{ ...network, ...secrets }, wan, vpn]));
    const result = await handlers.get("unifi_list_classic_networks")({ siteReference: "default" });
    expect(result.isError).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain(FAKE);
    expect(result.structuredContent.data).toEqual([
      network,
      { _id: "w1", name: "Internet 1", purpose: "wan" },
      { _id: "v1", name: "VPN", purpose: "remote-user-vpn" },
    ]);
  });

  it("returns only the allowlisted firewall group fields", async () => {
    const { client, handlers } = setup();
    mockFn(client, "getClassic").mockResolvedValue(envelope([group]));
    const result = await handlers.get("unifi_list_firewall_groups")({ siteReference: "default" });
    expect(JSON.stringify(result)).not.toContain(FAKE);
    expect(result.structuredContent.data).toEqual([{ _id: "g1", name: "Servers", group_type: "address-group", group_members: ["192.0.2.10"] }]);
  });

  it("returns only the allowlisted legacy rule fields", async () => {
    const { client, handlers } = setup();
    mockFn(client, "getClassic").mockResolvedValue(envelope([{ ...rule, site_id: "s1", x_passphrase: FAKE }]));
    const result = await handlers.get("unifi_list_legacy_firewall_rules")({ siteReference: "default" });
    expect(JSON.stringify(result)).not.toContain(FAKE);
    expect(result.structuredContent.data).toEqual([rule]);
  });

  it("returns the IPv6 and ICMP legacy rule fields", async () => {
    const { client, handlers } = setup();
    const v6 = {
      protocol_v6: "icmpv6", icmp_typename: "echo-request", icmpv6_typename: "echo-request",
      src_address_ipv6: "2001:db8:1::/64", dst_address_ipv6: "2001:db8:2::10",
    };
    mockFn(client, "getClassic").mockResolvedValue(envelope([{ ...rule, ...v6 }]));
    const result = await handlers.get("unifi_list_legacy_firewall_rules")({ siteReference: "default" });
    expect(result.isError).toBeUndefined();
    expect(result.structuredContent.data).toEqual([{ ...rule, ...v6 }]);
    expect(result.content[0].text).toContain("2001:db8:1::/64");
    expect(result.content[0].text).toContain("2001:db8:2::10");
    expect(result.content[0].text).toContain("icmpv6");
  });

  it.each([
    ["a legacy error envelope", { meta: { rc: "error", msg: "api.err.NoPermission" }, data: [] }],
    ["a bare array", [network]],
    ["a record without an _id", envelope([{ name: "LAN" }])],
  ])("fails on %s instead of reporting no rows", async (_label, response) => {
    const { client, handlers } = setup();
    mockFn(client, "getClassic").mockResolvedValue(response);
    expect((await handlers.get("unifi_list_classic_networks")({ siteReference: "default" })).isError).toBe(true);
  });

  it.each(TOOLS)("%s propagates access failures", async (name) => {
    const { client, handlers } = setup();
    mockFn(client, "getClassic").mockRejectedValue(new Error("Classic controller API returned HTTP 403"));
    const result = await handlers.get(name)({ siteReference: "default" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("HTTP 403");
  });

  it.each(TOOLS)("%s takes the site internalReference, not a path", (name) => {
    const schema = parseInputSchema(setup().configs, name);
    expect(schema.safeParse({ siteReference: "default" }).success).toBe(true);
    expect(schema.safeParse({ siteReference: "../default" }).success).toBe(false);
    expect(schema.safeParse({}).success).toBe(false);
  });
});
