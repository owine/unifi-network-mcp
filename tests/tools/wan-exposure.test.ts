import { describe, it, expect, beforeEach } from "vitest";
import { createMockServer, createMockClient, mockFn, ZONES } from "./_helpers.js";
import { registerAllTools } from "../../src/tools/index.js";
import type { NetworkClient } from "../../src/client.js";
import type { WanPolicy } from "../../src/utils/wan-exposure.js";

/**
 * Writes that could let traffic in from the WAN are refused outright —
 * confirm does not override it — unless the operator sets
 * UNIFI_NETWORK_ALLOW_WAN_EXPOSURE=true, which restores the confirm flow.
 */

const page = (data: unknown[], totalCount = data.length) => ({ offset: 0, limit: 200, count: data.length, totalCount, data });

const policy = (action: string | undefined, sourceZoneId: string | undefined, extra: Record<string, unknown> = {}) => ({
  enabled: true,
  name: "Rule",
  ...(action === undefined ? {} : { action: { type: action } }),
  ...(sourceZoneId === undefined ? {} : { source: { zoneId: sourceZoneId } }),
  destination: { zoneId: "zone-internal" },
  ipProtocolScope: { ipVersion: "IPV4" },
  loggingEnabled: false,
  ...extra,
});

const gatewayNetwork = {
  id: "n1", management: "GATEWAY", name: "Servers", enabled: true, vlanId: 30, zoneId: "zone-internal",
  isolationEnabled: false, cellularBackupEnabled: false, internetAccessEnabled: true,
  ipv4Configuration: { hostIpAddress: "192.0.2.1", prefixLength: 24 },
};

interface Controller {
  zones?: unknown[] | Error;
  policies?: unknown[] | Error;
  /** GET responses for single resources, by path. */
  resources?: Record<string, unknown>;
}

function answer(client: NetworkClient, { zones = ZONES, policies = [], resources = {} }: Controller = {}) {
  mockFn(client, "get").mockImplementation((path: string) => {
    if (path.includes("/firewall/zones?offset=")) return zones instanceof Error ? Promise.reject(zones) : Promise.resolve(page(zones));
    if (path.includes("/firewall/policies?offset=")) return policies instanceof Error ? Promise.reject(policies) : Promise.resolve(page(policies));
    return path in resources ? Promise.resolve(resources[path]) : Promise.reject(new Error(`HTTP 404: no ${path}`));
  });
  for (const method of ["post", "put", "patch"] as const) mockFn(client, method).mockResolvedValue({ id: "new" });
}

function setup(wan?: WanPolicy) {
  const { server, handlers } = createMockServer();
  const client = createMockClient();
  registerAllTools(server, client, false, wan ? { wan } : {});
  const call = (tool: string, input: Record<string, unknown>) => handlers.get(tool)(input) as Promise<{
    isError?: boolean; content: { text: string }[]; structuredContent?: Record<string, unknown>;
  }>;
  return { client, call };
}

const writes = (client: NetworkClient) =>
  (["post", "put", "patch", "delete"] as const).flatMap((method) => mockFn(client, method).mock.calls);

function expectRefused(result: { isError?: boolean; content: { text: string }[] }, reason: RegExp) {
  expect(result.isError).toBe(true);
  expect(result.content[0].text).toMatch(/^Refused: /);
  expect(result.content[0].text).toMatch(reason);
  expect(result.content[0].text).toContain("confirm does not override this");
}

describe("WAN-exposure refusals", () => {
  let client: NetworkClient;
  let call: ReturnType<typeof setup>["call"];

  beforeEach(() => {
    ({ client, call } = setup());
    answer(client);
  });

  describe("firewall policies", () => {
    it("refuses creating an ALLOW from the External zone, even with confirm", async () => {
      const result = await call("unifi_create_firewall_policy", { siteId: "s1", policy: policy("ALLOW", "zone-external"), confirm: true });
      expectRefused(result, /ALLOW traffic from the External zone, which is the WAN/);
      expect(writes(client)).toEqual([]);
    });

    it.each(["BLOCK", "REJECT"])("allows a %s from the External zone without reading the zones", async (action) => {
      const result = await call("unifi_create_firewall_policy", { siteId: "s1", policy: policy(action, "zone-external") });
      expect(result.isError).toBeUndefined();
      expect(mockFn(client, "post")).toHaveBeenCalledTimes(1);
      expect(mockFn(client, "get")).not.toHaveBeenCalled();
    });

    it("allows an ALLOW from an internal zone to the External zone, with the usual confirm", async () => {
      const outbound = policy("ALLOW", "zone-internal", { destination: { zoneId: "zone-external" } });
      const unconfirmed = await call("unifi_create_firewall_policy", { siteId: "s1", policy: outbound });
      expect(unconfirmed.content[0].text).toContain("requires explicit confirmation");
      const result = await call("unifi_create_firewall_policy", { siteId: "s1", policy: outbound, confirm: true });
      expect(result.isError).toBeUndefined();
      expect(mockFn(client, "post")).toHaveBeenCalledTimes(1);
    });

    it("treats a policy without an action as allowing traffic", async () => {
      expectRefused(await call("unifi_create_firewall_policy", { siteId: "s1", policy: policy(undefined, "zone-external") }), /WAN/);
    });

    it("refuses an ALLOW with no source zone, which cannot be checked", async () => {
      expectRefused(await call("unifi_create_firewall_policy", { siteId: "s1", policy: policy("ALLOW", undefined), confirm: true }), /no source\.zoneId/);
    });

    it("refuses an ALLOW whose source zone is not in the zone list", async () => {
      const result = await call("unifi_create_firewall_policy", { siteId: "s1", policy: policy("ALLOW", "zone-gone"), confirm: true });
      expectRefused(result, /zone-gone\) is not one of this site's firewall zones/);
      expect(writes(client)).toEqual([]);
    });

    it("refuses when the zone lookup fails", async () => {
      answer(client, { zones: new Error("HTTP 403: Forbidden") });
      const result = await call("unifi_create_firewall_policy", { siteId: "s1", policy: policy("ALLOW", "zone-internal"), confirm: true });
      expectRefused(result, /firewall zones could not be read to find the WAN zone \(HTTP 403: Forbidden\)/);
      expect(writes(client)).toEqual([]);
    });

    it("refuses when the zone lookup returns something that is not a zone list", async () => {
      mockFn(client, "get").mockResolvedValue("<html>Login</html>");
      expectRefused(await call("unifi_create_firewall_policy", { siteId: "s1", policy: policy("ALLOW", "zone-internal"), confirm: true }), /could not be read/);
    });

    it("pages through the zones to find the WAN zone", async () => {
      mockFn(client, "get").mockImplementation((path: string) =>
        Promise.resolve(path.includes("offset=0") ? page([ZONES[0]], 2) : page([ZONES[1]], 2)));
      expectRefused(await call("unifi_create_firewall_policy", { siteId: "s1", policy: policy("ALLOW", "zone-external"), confirm: true }), /WAN/);
      expect(mockFn(client, "get").mock.calls.map(([path]) => path)).toEqual([
        "/sites/s1/firewall/zones?offset=0&limit=200",
        "/sites/s1/firewall/zones?offset=1&limit=200",
      ]);
    });

    it("reports the refusal on a dry run", async () => {
      const result = await call("unifi_create_firewall_policy", { siteId: "s1", policy: policy("ALLOW", "zone-external"), dryRun: true });
      expectRefused(result, /WAN/);
      expect(result.structuredContent).toBeUndefined();
    });

    describe("connection states", () => {
      it.each([
        [["ESTABLISHED"]],
        [["RELATED"]],
        [["ESTABLISHED", "RELATED"]],
      ])("allows an ALLOW from the External zone that matches only %j", async (states) => {
        const result = await call("unifi_create_firewall_policy", {
          siteId: "s1", policy: policy("ALLOW", "zone-external", { connectionStateFilter: states }), confirm: true,
        });
        expect(result.isError).toBeUndefined();
        expect(mockFn(client, "post")).toHaveBeenCalledTimes(1);
      });

      it.each([
        ["no filter", {}],
        ["an empty filter", { connectionStateFilter: [] }],
        ["a null filter", { connectionStateFilter: null }],
        ["NEW", { connectionStateFilter: ["NEW"] }],
        ["ESTABLISHED and NEW", { connectionStateFilter: ["ESTABLISHED", "NEW"] }],
        ["INVALID", { connectionStateFilter: ["INVALID"] }],
      ])("refuses an ALLOW from the External zone with %s", async (_label, extra) => {
        const result = await call("unifi_create_firewall_policy", { siteId: "s1", policy: policy("ALLOW", "zone-external", extra), confirm: true });
        expectRefused(result, /External zone, which is the WAN/);
        expect(writes(client)).toEqual([]);
      });

      const path = "/sites/s1/firewall/policies/p1";
      const returnOnly = { id: "p1", ...policy("ALLOW", "zone-external", { connectionStateFilter: ["ESTABLISHED", "RELATED"] }) };

      it("allows renaming an ESTABLISHED/RELATED-only ALLOW from the External zone", async () => {
        answer(client, { resources: { [path]: returnOnly } });
        const result = await call("unifi_update_firewall_policy", { siteId: "s1", firewallPolicyId: "p1", policy: { name: "Renamed" }, confirm: true });
        expect(result.isError).toBeUndefined();
        expect(mockFn(client, "put")).toHaveBeenCalledWith(path, expect.objectContaining({ name: "Renamed", connectionStateFilter: ["ESTABLISHED", "RELATED"] }));
      });

      it("refuses an update that clears the filter of an ESTABLISHED/RELATED-only ALLOW, judged on the merged body", async () => {
        answer(client, { resources: { [path]: returnOnly } });
        const result = await call("unifi_update_firewall_policy", { siteId: "s1", firewallPolicyId: "p1", policy: { connectionStateFilter: null }, confirm: true });
        expectRefused(result, /External zone, which is the WAN/);
        expect(writes(client)).toEqual([]);
      });

      it("refuses an update that adds NEW to an ESTABLISHED/RELATED-only ALLOW", async () => {
        answer(client, { resources: { [path]: returnOnly } });
        const result = await call("unifi_update_firewall_policy", {
          siteId: "s1", firewallPolicyId: "p1", policy: { connectionStateFilter: ["ESTABLISHED", "RELATED", "NEW"] }, confirm: true,
        });
        expectRefused(result, /WAN/);
        expect(writes(client)).toEqual([]);
      });
    });

    describe("update", () => {
      const path = "/sites/s1/firewall/policies/p1";

      it("refuses switching a BLOCK from the External zone to ALLOW, judged on the merged body", async () => {
        answer(client, { resources: { [path]: { id: "p1", ...policy("BLOCK", "zone-external") } } });
        const result = await call("unifi_update_firewall_policy", { siteId: "s1", firewallPolicyId: "p1", policy: { action: { type: "ALLOW" } }, confirm: true });
        expectRefused(result, /External zone, which is the WAN/);
        expect(writes(client)).toEqual([]);
      });

      it("refuses moving an ALLOW's source to the External zone", async () => {
        answer(client, { resources: { [path]: { id: "p1", ...policy("ALLOW", "zone-internal") } } });
        const result = await call("unifi_update_firewall_policy", { siteId: "s1", firewallPolicyId: "p1", policy: { source: { zoneId: "zone-external" } }, confirm: true });
        expectRefused(result, /WAN/);
      });

      it("allows editing a BLOCK from the External zone", async () => {
        answer(client, { resources: { [path]: { id: "p1", ...policy("BLOCK", "zone-external") } } });
        const result = await call("unifi_update_firewall_policy", { siteId: "s1", firewallPolicyId: "p1", policy: { name: "Renamed" } });
        expect(result.isError).toBeUndefined();
        expect(mockFn(client, "put")).toHaveBeenCalledTimes(1);
      });

      it("reports the refusal on a dry run", async () => {
        answer(client, { resources: { [path]: { id: "p1", ...policy("BLOCK", "zone-external") } } });
        const result = await call("unifi_update_firewall_policy", { siteId: "s1", firewallPolicyId: "p1", policy: { action: { type: "ALLOW" } }, dryRun: true });
        expectRefused(result, /WAN/);
      });
    });

    describe("patch", () => {
      const path = "/sites/s1/firewall/policies/p1";

      it("refuses patching a BLOCK from the External zone to ALLOW, judged on the policy it would leave", async () => {
        answer(client, { resources: { [path]: { id: "p1", ...policy("BLOCK", "zone-external") } } });
        const result = await call("unifi_patch_firewall_policy", { siteId: "s1", firewallPolicyId: "p1", policy: { action: { type: "ALLOW" } }, confirm: true });
        expectRefused(result, /WAN/);
        expect(writes(client)).toEqual([]);
      });

      it("refuses re-enabling a disabled ALLOW from the External zone", async () => {
        answer(client, { resources: { [path]: { id: "p1", ...policy("ALLOW", "zone-external", { enabled: false }) } } });
        expectRefused(await call("unifi_patch_firewall_policy", { siteId: "s1", firewallPolicyId: "p1", policy: { enabled: true } }), /WAN/);
      });

      it("refuses patching an ALLOW's source to the External zone", async () => {
        answer(client, { resources: { [path]: { id: "p1", ...policy("ALLOW", "zone-internal") } } });
        expectRefused(await call("unifi_patch_firewall_policy", { siteId: "s1", firewallPolicyId: "p1", policy: { source: { zoneId: "zone-external" } } }), /WAN/);
      });

      it.each([
        ["its destination", { destination: { zoneId: "zone-gateway" } }],
        ["its protocol scope", { ipProtocolScope: { ipVersion: "IPV4_AND_IPV6" } }],
        ["its connection states", { connectionStateFilter: null }],
        ["enabled as a string", { enabled: "true" }],
      ])("refuses widening an existing ALLOW from the External zone through %s", async (_label, patch) => {
        answer(client, { resources: { [path]: { id: "p1", ...policy("ALLOW", "zone-external") } } });
        expectRefused(await call("unifi_patch_firewall_policy", { siteId: "s1", firewallPolicyId: "p1", policy: patch, confirm: true }), /WAN/);
        expect(writes(client)).toEqual([]);
      });

      it("disables a policy without checking the zones", async () => {
        // The confirm gate reads the policy; disabling cannot expose anything to the WAN.
        answer(client, { resources: { [path]: { id: "p1", ...policy("ALLOW", "zone-external") } } });
        const result = await call("unifi_patch_firewall_policy", { siteId: "s1", firewallPolicyId: "p1", policy: { enabled: false, loggingEnabled: true }, confirm: true });
        expect(result.isError).toBeUndefined();
        expect(mockFn(client, "get").mock.calls.map(([requested]) => requested)).toEqual([path]);
      });

      it("patches logging without reading anything", async () => {
        const result = await call("unifi_patch_firewall_policy", { siteId: "s1", firewallPolicyId: "p1", policy: { loggingEnabled: true } });
        expect(result.isError).toBeUndefined();
        expect(mockFn(client, "get")).not.toHaveBeenCalled();
        expect(mockFn(client, "patch")).toHaveBeenCalledWith(path, { loggingEnabled: true });
      });

      it("refuses when the current policy cannot be read", async () => {
        const result = await call("unifi_patch_firewall_policy", { siteId: "s1", firewallPolicyId: "p1", policy: { action: { type: "ALLOW" } }, confirm: true });
        expect(result.isError).toBe(true);
        expect(writes(client)).toEqual([]);
      });
    });

    it("refuses reordering the policies for traffic from the External zone", async () => {
      const result = await call("unifi_reorder_firewall_policies", {
        siteId: "s1", sourceFirewallZoneId: "zone-external", destinationFirewallZoneId: "zone-internal",
        orderedFirewallPolicyIds: { beforeSystemDefined: ["p1"], afterSystemDefined: [] },
      });
      expectRefused(result, /reorder the policies for traffic from the External zone/);
      expect(writes(client)).toEqual([]);
    });

    it("allows reordering the policies for traffic from an internal zone", async () => {
      answer(client, { resources: {
        "/sites/s1/firewall/policies/ordering?sourceFirewallZoneId=zone-internal&destinationFirewallZoneId=zone-external":
          { orderedFirewallPolicyIds: { beforeSystemDefined: ["p1"], afterSystemDefined: [] } },
      } });
      const result = await call("unifi_reorder_firewall_policies", {
        siteId: "s1", sourceFirewallZoneId: "zone-internal", destinationFirewallZoneId: "zone-external",
        orderedFirewallPolicyIds: { beforeSystemDefined: ["p1"], afterSystemDefined: [] },
      });
      expect(result.isError).toBeUndefined();
    });
  });

  describe("identifying the WAN zone", () => {
    const renamed = [
      { id: "6f1c2a52-3b6d-4a8e-9a0b-2d5e8f7c1a90", name: "Internet", networkIds: [], metadata: { origin: "SYSTEM_DEFINED" } },
      { id: "zone-internal", name: "Internal", networkIds: [], metadata: { origin: "SYSTEM_DEFINED" } },
      { id: "zone-custom", name: "External", networkIds: [], metadata: { origin: "USER_DEFINED" } },
    ];
    const fromRenamed = policy("ALLOW", "6f1c2a52-3b6d-4a8e-9a0b-2d5e8f7c1a90");

    it("catches a renamed External zone listed in UNIFI_NETWORK_WAN_ZONE_IDS", async () => {
      ({ client, call } = setup({ allowExposure: false, zoneIds: ["6f1c2a52-3b6d-4a8e-9a0b-2d5e8f7c1a90"] }));
      answer(client, { zones: renamed });
      expectRefused(await call("unifi_create_firewall_policy", { siteId: "s1", policy: fromRenamed, confirm: true }), /Internet zone, which is the WAN/);
    });

    it("misses a renamed External zone that is not listed, which is why the ID list is recommended", async () => {
      answer(client, { zones: renamed });
      const result = await call("unifi_create_firewall_policy", { siteId: "s1", policy: fromRenamed, confirm: true });
      expect(result.isError).toBeUndefined();
    });

    it("matches the name External case-insensitively on a system-defined zone", async () => {
      answer(client, { zones: [{ id: "z-ext", name: "EXTERNAL", metadata: { origin: "SYSTEM_DEFINED" } }] });
      expectRefused(await call("unifi_create_firewall_policy", { siteId: "s1", policy: policy("ALLOW", "z-ext"), confirm: true }), /WAN/);
    });

    it("does not treat a user-defined zone named External as the WAN", async () => {
      answer(client, { zones: renamed });
      const result = await call("unifi_create_firewall_policy", { siteId: "s1", policy: policy("ALLOW", "zone-custom"), confirm: true });
      expect(result.isError).toBeUndefined();
    });

    it("treats a zone listed in UNIFI_NETWORK_WAN_ZONE_IDS as the WAN whatever its origin", async () => {
      ({ client, call } = setup({ allowExposure: false, zoneIds: ["zone-custom"] }));
      answer(client, { zones: renamed });
      expectRefused(await call("unifi_create_firewall_policy", { siteId: "s1", policy: policy("ALLOW", "zone-custom"), confirm: true }), /WAN/);
    });
  });

  describe("zone IDs in another case", () => {
    const wanId = "00000000-0000-4000-8000-0000000000aa";
    const lanId = "00000000-0000-4000-8000-0000000000bb";
    const zones = [
      { id: wanId, name: "External", networkIds: [], metadata: { origin: "SYSTEM_DEFINED" } },
      { id: lanId.toUpperCase(), name: "Internal", networkIds: [], metadata: { origin: "SYSTEM_DEFINED" } },
    ];

    it("finds the WAN zone from an upper-case source zoneId", async () => {
      answer(client, { zones });
      const result = await call("unifi_create_firewall_policy", { siteId: "s1", policy: policy("ALLOW", wanId.toUpperCase()), confirm: true });
      expectRefused(result, /ALLOW traffic from the External zone, which is the WAN/);
    });

    it("finds a zone the controller lists in upper case", async () => {
      answer(client, { zones });
      const result = await call("unifi_create_firewall_policy", { siteId: "s1", policy: policy("ALLOW", lanId), confirm: true });
      expect(result.isError).toBeUndefined();
    });

    it("refuses an upper-case zone ID listed in UNIFI_NETWORK_WAN_ZONE_IDS", async () => {
      ({ client, call } = setup({ allowExposure: false, zoneIds: [lanId] }));
      answer(client, { zones });
      expectRefused(await call("unifi_update_firewall_zone", { siteId: "s1", firewallZoneId: lanId.toUpperCase(), name: "Internal", networkIds: [] }), /WAN/);
    });

    it("refuses moving a network into, or out of, the WAN zone named in another case", async () => {
      const network = { ...gatewayNetwork, zoneId: lanId };
      answer(client, { zones, resources: { "/sites/s1/networks/n1": network } });
      expectRefused(await call("unifi_update_network", { siteId: "s1", networkId: "n1", zoneId: wanId.toUpperCase() }), /put the network in the External zone/);
      answer(client, { zones, resources: { "/sites/s1/networks/n1": { ...network, zoneId: wanId.toUpperCase() } } });
      expectRefused(await call("unifi_update_network", { siteId: "s1", networkId: "n1", zoneId: lanId }), /out of the External zone/);
      expect(writes(client)).toEqual([]);
    });

    it("does not read the zones for a network update that only changes the zoneId's case", async () => {
      answer(client, { zones, resources: { "/sites/s1/networks/n1": { ...gatewayNetwork, zoneId: wanId } } });
      expect((await call("unifi_update_network", { siteId: "s1", networkId: "n1", zoneId: wanId.toUpperCase() })).isError).toBeUndefined();
      expect(mockFn(client, "get")).toHaveBeenCalledTimes(1);
    });

    it("matches an upper-case source zone of a policy that uses a traffic matching list", async () => {
      const using = (source: string) => policy("ALLOW", source, { name: "Web in", destination: { zoneId: lanId, trafficFilter: { trafficMatchingListId: "list1" } } });
      const update = { siteId: "s1", trafficMatchingListId: "list1", type: "PORTS", name: "Web", items: [{ type: "PORT_NUMBER", value: 22 }] };
      answer(client, { zones, policies: [using(lanId)] });
      expect((await call("unifi_update_traffic_matching_list", update)).isError).toBeUndefined();
      answer(client, { zones, policies: [using(wanId.toUpperCase())] });
      expectRefused(await call("unifi_update_traffic_matching_list", update), /Web in/);
    });
  });

  describe("firewall zones", () => {
    it("refuses changing the External zone", async () => {
      const result = await call("unifi_update_firewall_zone", { siteId: "s1", firewallZoneId: "zone-external", name: "External", networkIds: ["net-wan", "net-lan"] });
      expectRefused(result, /modify the External zone, which is the WAN/);
      expect(writes(client)).toEqual([]);
    });

    it("refuses renaming the External zone", async () => {
      expectRefused(await call("unifi_update_firewall_zone", { siteId: "s1", firewallZoneId: "zone-external", name: "Internet", networkIds: ["net-wan"] }), /WAN/);
    });

    it("refuses a zone update that takes a network from the External zone", async () => {
      const result = await call("unifi_update_firewall_zone", { siteId: "s1", firewallZoneId: "zone-iot", name: "IoT", networkIds: ["net-iot", "net-wan"] });
      expectRefused(result, /move networks out of the WAN zone: net-wan/);
    });

    it("compares network IDs without regard to case", async () => {
      expectRefused(await call("unifi_update_firewall_zone", { siteId: "s1", firewallZoneId: "zone-iot", name: "IoT", networkIds: ["NET-WAN"] }), /NET-WAN/);
    });

    it("refuses a zone create that takes a network from the External zone", async () => {
      expectRefused(await call("unifi_create_firewall_zone", { siteId: "s1", name: "DMZ", networkIds: ["net-wan"], dryRun: true }), /net-wan/);
    });

    it("refuses an update of a zone that is not in the zone list", async () => {
      expectRefused(await call("unifi_update_firewall_zone", { siteId: "s1", firewallZoneId: "zone-gone", name: "X", networkIds: [] }), /not one of this site's firewall zones/);
    });

    it("allows changing an internal zone's networks", async () => {
      const result = await call("unifi_update_firewall_zone", { siteId: "s1", firewallZoneId: "zone-iot", name: "IoT", networkIds: ["net-iot", "net-lan"] });
      expect(result.isError).toBeUndefined();
      expect(mockFn(client, "put")).toHaveBeenCalledTimes(1);
    });

    describe("delete", () => {
      const del = (firewallZoneId: string, extra: Record<string, unknown> = {}) =>
        call("unifi_delete_firewall_zone", { siteId: "s1", firewallZoneId, confirm: true, ...extra });

      it("refuses deleting the External zone, even with confirm", async () => {
        expectRefused(await del("zone-external"), /delete the External zone, which is the WAN/);
        expect(writes(client)).toEqual([]);
      });

      it("refuses deleting a zone listed in UNIFI_NETWORK_WAN_ZONE_IDS", async () => {
        const custom = "00000000-0000-4000-8000-0000000000aa";
        ({ client, call } = setup({ allowExposure: false, zoneIds: [custom] }));
        answer(client, { zones: [...ZONES, { id: custom, name: "Uplink", networkIds: [], metadata: { origin: "USER_DEFINED" } }] });
        expectRefused(await del(custom.toUpperCase()), /delete the Uplink zone, which is the WAN/);
        expect(writes(client)).toEqual([]);
      });

      it("reports the refusal on a dry run, before asking for confirm", async () => {
        const result = await call("unifi_delete_firewall_zone", { siteId: "s1", firewallZoneId: "zone-external", dryRun: true });
        expectRefused(result, /WAN/);
        expect(result.structuredContent).toBeUndefined();
        expectRefused(await call("unifi_delete_firewall_zone", { siteId: "s1", firewallZoneId: "zone-external" }), /WAN/);
      });

      it("refuses when the zone lookup fails", async () => {
        answer(client, { zones: new Error("HTTP 403: Forbidden") });
        expectRefused(await del("zone-iot"), /firewall zones could not be read/);
        expect(writes(client)).toEqual([]);
      });

      it("refuses deleting a zone that is not in the zone list", async () => {
        expectRefused(await del("zone-gone"), /zone-gone\) is not one of this site's firewall zones/);
        expect(writes(client)).toEqual([]);
      });

      it("deletes a custom zone, with the usual confirm", async () => {
        const unconfirmed = await call("unifi_delete_firewall_zone", { siteId: "s1", firewallZoneId: "zone-iot" });
        expect(unconfirmed.content[0].text).toContain("requires explicit confirmation");
        mockFn(client, "delete").mockResolvedValue({});
        expect((await del("zone-iot")).isError).toBeUndefined();
        expect(mockFn(client, "delete")).toHaveBeenCalledWith("/sites/s1/firewall/zones/zone-iot");
      });
    });

    it("creates an empty zone without reading the zones", async () => {
      const result = await call("unifi_create_firewall_zone", { siteId: "s1", name: "Empty", networkIds: [] });
      expect(result.isError).toBeUndefined();
      expect(mockFn(client, "get")).not.toHaveBeenCalled();
    });
  });

  describe("networks", () => {
    it("refuses creating a network in the External zone", async () => {
      const body = Object.fromEntries(Object.entries(gatewayNetwork).filter(([field]) => field !== "id"));
      const result = await call("unifi_create_network", { siteId: "s1", ...body, zoneId: "zone-external" });
      expectRefused(result, /put the network in the External zone/);
      expect(writes(client)).toEqual([]);
    });

    it("refuses moving a network into the External zone", async () => {
      answer(client, { resources: { "/sites/s1/networks/n1": gatewayNetwork } });
      expectRefused(await call("unifi_update_network", { siteId: "s1", networkId: "n1", zoneId: "zone-external" }), /External zone/);
    });

    it("refuses moving a network out of the External zone, even with a dry run", async () => {
      answer(client, { resources: { "/sites/s1/networks/n1": { ...gatewayNetwork, zoneId: "zone-external" } } });
      const result = await call("unifi_update_network", { siteId: "s1", networkId: "n1", zoneId: "zone-iot" });
      expectRefused(result, /move the network out of the External zone, which is the WAN/);
      expectRefused(await call("unifi_update_network", { siteId: "s1", networkId: "n1", zoneId: "zone-iot", dryRun: true }), /out of the External zone/);
      expect(writes(client)).toEqual([]);
    });

    it("refuses moving a network out of a zone that is not in the zone list", async () => {
      answer(client, { resources: { "/sites/s1/networks/n1": { ...gatewayNetwork, zoneId: "zone-gone" } } });
      expectRefused(await call("unifi_update_network", { siteId: "s1", networkId: "n1", zoneId: "zone-iot" }), /current zoneId \(zone-gone\) is not one of this site's firewall zones/);
    });

    it("allows editing a network in the External zone that keeps its zone", async () => {
      answer(client, { resources: { "/sites/s1/networks/n1": { ...gatewayNetwork, zoneId: "zone-external" } } });
      expect((await call("unifi_update_network", { siteId: "s1", networkId: "n1", name: "Renamed" })).isError).toBeUndefined();
      expect(mockFn(client, "put")).toHaveBeenCalledTimes(1);
    });

    it("allows moving a network to an internal zone", async () => {
      answer(client, { resources: { "/sites/s1/networks/n1": gatewayNetwork } });
      expect((await call("unifi_update_network", { siteId: "s1", networkId: "n1", zoneId: "zone-iot" })).isError).toBeUndefined();
    });

    it("does not read the zones for an update that keeps the network's zone", async () => {
      answer(client, { resources: { "/sites/s1/networks/n1": gatewayNetwork } });
      expect((await call("unifi_update_network", { siteId: "s1", networkId: "n1", name: "Renamed" })).isError).toBeUndefined();
      expect(mockFn(client, "get")).toHaveBeenCalledTimes(1);
    });
  });

  describe("networks put in a zone that the WAN can reach", () => {
    // gatewayNetwork sits in zone-internal; these move it to zone-iot or add it to zone-iot.
    const intoIot = (extra: Record<string, unknown> = {}) =>
      policy("ALLOW", "zone-external", { id: "p7", name: "Web to IoT", destination: { zoneId: "zone-iot" }, ...extra });
    const createBody = Object.fromEntries(Object.entries(gatewayNetwork).filter(([field]) => field !== "id"));
    const moves = {
      "creating a network in it": () => call("unifi_create_network", { siteId: "s1", ...createBody, zoneId: "zone-iot" }),
      "moving a network into it": () => call("unifi_update_network", { siteId: "s1", networkId: "n1", zoneId: "zone-iot" }),
      "adding a network to it": () => call("unifi_update_firewall_zone", { siteId: "s1", firewallZoneId: "zone-iot", name: "zone-iot", networkIds: ["net-servers"] }),
    };
    const resources = { "/sites/s1/networks/n1": gatewayNetwork };

    for (const [label, move] of Object.entries(moves)) {
      it(`refuses ${label} when an ALLOW from the External zone targets it`, async () => {
        answer(client, { policies: [intoIot()], resources });
        expectRefused(await move(), /zone-iot zone, which firewall policy "Web to IoT" ALLOWs traffic into from the WAN/);
        expect(writes(client)).toEqual([]);
      });
    }

    it("refuses when the policy's destination is narrowed by a trafficFilter, which cannot be judged", async () => {
      answer(client, { policies: [intoIot({ destination: { zoneId: "zone-iot", trafficFilter: { type: "IP_ADDRESS", ipAddressFilter: { type: "IP_ADDRESSES", items: [{ type: "IP_ADDRESS", value: "192.0.2.10" }] } } } })], resources });
      expectRefused(await moves["moving a network into it"](), /Web to IoT/);
    });

    it("refuses when the targeting policy's source zone is not in the zone list", async () => {
      answer(client, { policies: [policy("ALLOW", "zone-gone", { name: "Unknown in", destination: { zoneId: "zone-iot" } })], resources });
      expectRefused(await moves["moving a network into it"](), /Unknown in/);
    });

    it("compares the destination zone ID without regard to case", async () => {
      answer(client, { policies: [intoIot({ destination: { zoneId: "ZONE-IOT" } })], resources });
      expectRefused(await moves["moving a network into it"](), /Web to IoT/);
    });

    it("reports the refusal on a dry run", async () => {
      answer(client, { policies: [intoIot()], resources });
      expectRefused(await call("unifi_update_network", { siteId: "s1", networkId: "n1", zoneId: "zone-iot", dryRun: true }), /Web to IoT/);
    });

    it("refuses when the policies cannot be read", async () => {
      answer(client, { policies: new Error("HTTP 403: Forbidden"), resources });
      expectRefused(await moves["moving a network into it"](), /firewall policies that the change depends on could not be read \(HTTP 403: Forbidden\)/);
      expect(writes(client)).toEqual([]);
    });

    it.each([
      ["an ESTABLISHED/RELATED-only ALLOW from the External zone", intoIot({ connectionStateFilter: ["ESTABLISHED", "RELATED"] })],
      ["a BLOCK from the External zone", intoIot({ action: { type: "BLOCK" } })],
      ["an ALLOW from an internal zone", intoIot({ source: { zoneId: "zone-internal" } })],
      ["an ALLOW from the External zone into another zone", intoIot({ destination: { zoneId: "zone-lan" } })],
    ])("allows moving a network into a zone targeted only by %s", async (_label, targeting) => {
      answer(client, { policies: [targeting], resources });
      expect((await moves["moving a network into it"]()).isError).toBeUndefined();
      expect(mockFn(client, "put")).toHaveBeenCalledTimes(1);
    });

    it("allows a zone update that adds no networks to a zone the WAN can reach", async () => {
      answer(client, { policies: [policy("ALLOW", "zone-external")] });
      // zone-internal already holds net-lan, and the policy fixture targets zone-internal.
      const result = await call("unifi_update_firewall_zone", { siteId: "s1", firewallZoneId: "zone-internal", name: "Internal", networkIds: ["NET-LAN"] });
      expect(result.isError).toBeUndefined();
    });
  });

  describe("traffic matching lists", () => {
    const update = { siteId: "s1", trafficMatchingListId: "list1", type: "PORTS", name: "Web", items: [{ type: "PORT_NUMBER", value: 22 }] };
    const usingList = (action: string, source: string) =>
      policy(action, source, { id: "p9", name: "Web in", destination: { zoneId: "zone-internal", trafficFilter: { type: "PORT", portFilter: { type: "TRAFFIC_MATCHING_LIST", trafficMatchingListId: "list1" } } } });

    it("refuses changing a list that an ALLOW from the External zone uses", async () => {
      answer(client, { policies: [usingList("ALLOW", "zone-external")] });
      const result = await call("unifi_update_traffic_matching_list", update);
      expectRefused(result, /used by firewall policy "Web in", which ALLOWs traffic from the WAN/);
      expect(writes(client)).toEqual([]);
    });

    it("refuses when a policy using the list has a source zone not in the zone list", async () => {
      answer(client, { policies: [usingList("ALLOW", "zone-gone")] });
      expectRefused(await call("unifi_update_traffic_matching_list", update), /Web in/);
    });

    it.each([
      ["a BLOCK from the External zone", usingList("BLOCK", "zone-external")],
      ["an ALLOW from an internal zone", usingList("ALLOW", "zone-internal")],
      ["an ESTABLISHED/RELATED-only ALLOW from the External zone", { ...usingList("ALLOW", "zone-external"), connectionStateFilter: ["ESTABLISHED", "RELATED"] }],
    ])("allows changing a list used only by %s", async (_label, used) => {
      answer(client, { policies: [used] });
      expect((await call("unifi_update_traffic_matching_list", update)).isError).toBeUndefined();
      expect(mockFn(client, "put")).toHaveBeenCalledTimes(1);
    });

    it("matches the list ID without regard to case", async () => {
      answer(client, { policies: [usingList("ALLOW", "zone-external")] });
      expectRefused(await call("unifi_update_traffic_matching_list", { ...update, trafficMatchingListId: "LIST1" }), /Web in/);
    });

    /** A controller that sends no totalCount and at most pageSize entries per page, whatever limit asks for. */
    function capped(policies: unknown[], pageSize: number, zones: unknown[] = ZONES) {
      mockFn(client, "get").mockImplementation((path: string) => {
        const offset = Number(/offset=(\d+)/.exec(path)?.[1]);
        const list = path.includes("/firewall/zones?") ? zones : policies;
        return Promise.resolve({ data: list.slice(offset, offset + pageSize) });
      });
    }
    const policyGets = () => mockFn(client, "get").mock.calls.map(([path]) => path as string).filter((path) => path.includes("/policies?"));

    it("checks policies past the first page when the API leaves out totalCount", async () => {
      const filler = Array.from({ length: 200 }, () => usingList("BLOCK", "zone-external"));
      capped([...filler, usingList("ALLOW", "zone-external")], 200);
      expectRefused(await call("unifi_update_traffic_matching_list", update), /Web in/);
    });

    it("keeps paging when the controller caps pages below the limit and leaves out totalCount", async () => {
      const filler = Array.from({ length: 50 }, () => usingList("BLOCK", "zone-external"));
      capped([...filler, usingList("ALLOW", "zone-external"), ...filler], 50);
      const result = await call("unifi_update_traffic_matching_list", update);
      expectRefused(result, /used by firewall policy "Web in", which ALLOWs traffic from the WAN/);
      expect(policyGets()).toEqual([0, 50, 100, 101].map((offset) => `/sites/s1/firewall/policies?offset=${offset}&limit=200`));
      expect(writes(client)).toEqual([]);
    });

    it("finds the WAN zone past a capped first page of zones", async () => {
      capped([], 1);
      const result = await call("unifi_create_firewall_policy", { siteId: "s1", policy: policy("ALLOW", "zone-external"), confirm: true });
      expectRefused(result, /ALLOW traffic from the External zone, which is the WAN/);
    });

    it("refuses when the policy list does not end", async () => {
      mockFn(client, "get").mockImplementation((path: string) =>
        Promise.resolve(path.includes("/firewall/zones?") ? page(ZONES) : { data: [usingList("BLOCK", "zone-external")] }));
      const result = await call("unifi_update_traffic_matching_list", update);
      expectRefused(result, /could not be read \(the list did not end after 50 pages\)/);
      expect(policyGets()).toHaveLength(50);
      expect(writes(client)).toEqual([]);
    });

    it("refuses when the policies cannot be read", async () => {
      answer(client, { policies: new Error("HTTP 500: boom") });
      expectRefused(await call("unifi_update_traffic_matching_list", update), /firewall policies that the change depends on could not be read/);
    });

    it("refuses when the zones cannot be read", async () => {
      answer(client, { zones: new Error("HTTP 403: Forbidden"), policies: [usingList("ALLOW", "zone-internal")] });
      expectRefused(await call("unifi_update_traffic_matching_list", update), /firewall zones could not be read/);
      expect(writes(client)).toEqual([]);
    });

    it("refuses when neither the zones nor the policies can be read", async () => {
      answer(client, { zones: new Error("HTTP 403: Forbidden"), policies: new Error("HTTP 500: boom") });
      expectRefused(await call("unifi_update_traffic_matching_list", update), /could not be read/);
      expect(writes(client)).toEqual([]);
    });

    it("requests the zones and the policies together", async () => {
      let release: (value?: unknown) => void = () => undefined;
      const held = new Promise((resolve) => { release = resolve; });
      mockFn(client, "get").mockImplementation(async (path: string) => {
        await held;
        return page(path.includes("/firewall/zones?") ? ZONES : []);
      });
      const result = call("unifi_update_traffic_matching_list", update);
      await new Promise((resolve) => setImmediate(resolve));
      expect(mockFn(client, "get").mock.calls.map(([path]) => path)).toEqual([
        "/sites/s1/firewall/zones?offset=0&limit=200",
        "/sites/s1/firewall/policies?offset=0&limit=200",
      ]);
      release();
      expect((await result).isError).toBeUndefined();
    });
  });

  it("does not check ACL rules, which have no zone", async () => {
    const result = await call("unifi_create_acl_rule", { siteId: "s1", type: "IPV4", name: "Allow", enabled: true, action: "ALLOW", confirm: true });
    expect(result.isError).toBeUndefined();
    expect(mockFn(client, "get")).not.toHaveBeenCalled();
  });
});

describe("UNIFI_NETWORK_ALLOW_WAN_EXPOSURE=true", () => {
  let client: NetworkClient;
  let call: ReturnType<typeof setup>["call"];

  beforeEach(() => {
    ({ client, call } = setup({ allowExposure: true, zoneIds: [] }));
    answer(client, { resources: { "/sites/s1/networks/n1": gatewayNetwork } });
  });

  it("restores the confirm flow for an ALLOW from the External zone", async () => {
    const unconfirmed = await call("unifi_create_firewall_policy", { siteId: "s1", policy: policy("ALLOW", "zone-external") });
    expect(unconfirmed.isError).toBe(true);
    expect(unconfirmed.content[0].text).toContain("requires explicit confirmation");
    const confirmed = await call("unifi_create_firewall_policy", { siteId: "s1", policy: policy("ALLOW", "zone-external"), confirm: true });
    expect(confirmed.isError).toBeUndefined();
    expect(mockFn(client, "post")).toHaveBeenCalledTimes(1);
  });

  it("moves a network into a zone that an ALLOW from the External zone targets, reading no policies", async () => {
    answer(client, { policies: [policy("ALLOW", "zone-external", { destination: { zoneId: "zone-iot" } })], resources: { "/sites/s1/networks/n1": gatewayNetwork } });
    const result = await call("unifi_update_network", { siteId: "s1", networkId: "n1", zoneId: "zone-iot" });
    expect(result.isError).toBeUndefined();
    expect(mockFn(client, "get").mock.calls.some(([path]) => (path as string).includes("/policies?"))).toBe(false);
  });

  it("previews an ALLOW from the External zone", async () => {
    const result = await call("unifi_create_firewall_policy", { siteId: "s1", policy: policy("ALLOW", "zone-external"), dryRun: true });
    expect(result.structuredContent).toMatchObject({ dryRun: true });
  });

  it("restores the confirm flow for deleting the External zone", async () => {
    const unconfirmed = await call("unifi_delete_firewall_zone", { siteId: "s1", firewallZoneId: "zone-external" });
    expect(unconfirmed.content[0].text).toContain("requires explicit confirmation");
    mockFn(client, "delete").mockResolvedValue({});
    const confirmed = await call("unifi_delete_firewall_zone", { siteId: "s1", firewallZoneId: "zone-external", confirm: true });
    expect(confirmed.isError).toBeUndefined();
    expect(mockFn(client, "delete")).toHaveBeenCalledWith("/sites/s1/firewall/zones/zone-external");
    expect(mockFn(client, "get")).not.toHaveBeenCalled();
  });

  it("makes no zone lookups", async () => {
    await call("unifi_update_firewall_zone", { siteId: "s1", firewallZoneId: "zone-external", name: "External", networkIds: [] });
    await call("unifi_update_network", { siteId: "s1", networkId: "n1", zoneId: "zone-external" });
    await call("unifi_update_traffic_matching_list", { siteId: "s1", trafficMatchingListId: "l1", type: "PORTS", name: "W", items: [{ type: "PORT_NUMBER", value: 1 }] });
    expect(mockFn(client, "get").mock.calls.map(([path]) => path)).toEqual(["/sites/s1/networks/n1"]);
    expect(mockFn(client, "put")).toHaveBeenCalledTimes(3);
  });
});
