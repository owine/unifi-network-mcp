import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  getDeviceOutputSchema,
  getDeviceStatisticsOutputSchema,
  listDevicesOutputSchema,
  getClientOutputSchema,
  networkOutputSchema,
  firewallPolicyOutputSchema,
  voucherOutputSchema,
  createVouchersOutputSchema,
  aclRuleOutputSchema,
  lagOutputSchema,
  getInfoOutputSchema,
  listDpiCategoriesOutputSchema,
  listCountriesOutputSchema,
  listWansOutputSchema,
  listVpnServersOutputSchema,
  switchStackOutputSchema,
} from "../../src/utils/output-schemas.js";

/**
 * Smoke tests: loose/passthrough schemas can still be subtly wrong
 * (typo'd key, wrong primitive). Verify realistic responses parse,
 * sparse responses parse, unknown fields pass through, and wrong
 * primitives are rejected.
 */
describe("output schemas", () => {
  it("device detail accepts a realistic switch response (live-verified shape)", () => {
    const schema = z.object(getDeviceOutputSchema);
    const sample = {
      id: "dev1",
      name: "USW Pro Max 16 PoE",
      model: "USW Pro Max 16 PoE",
      state: "ONLINE",
      supported: true,
      firmwareUpdatable: false,
      uplink: { deviceId: "up1" },
      features: { switching: { lags: [{ id: "l1", portIdxs: [17, 18] }] } },
      interfaces: {
        ports: [
          {
            idx: 13,
            state: "UP",
            connector: "RJ45",
            maxSpeedMbps: 2500,
            speedMbps: 2500,
            poe: { standard: "802.3bt", type: 3, enabled: true, state: "UP" },
          },
          { idx: 17, state: "UP", connector: "SFPPLUS", maxSpeedMbps: 10000 },
        ],
      },
      futureFirmwareField: "surprise",
    };
    expect(() => schema.parse(sample)).not.toThrow();
  });

  it("device detail accepts a realistic AP response with radios", () => {
    const schema = z.object(getDeviceOutputSchema);
    const sample = {
      id: "ap1",
      model: "U7 Pro",
      features: { accessPoint: {} },
      interfaces: {
        radios: [
          { wlanStandard: "802.11be", frequencyGHz: 6, channelWidthMHz: 320, channel: 5 },
        ],
      },
    };
    expect(() => schema.parse(sample)).not.toThrow();
  });

  it("list devices accepts capability-tag string arrays for features/interfaces", () => {
    const schema = z.object(listDevicesOutputSchema);
    const sample = {
      data: [
        {
          id: "dev1",
          name: "AP",
          features: ["accessPoint"],
          interfaces: ["radios"],
        },
      ],
    };
    expect(() => schema.parse(sample)).not.toThrow();
  });

  it("device detail accepts a sparse response (id only)", () => {
    const schema = z.object(getDeviceOutputSchema);
    expect(() => schema.parse({ id: "x" })).not.toThrow();
  });

  it("device statistics rejects a wrong primitive type", () => {
    const schema = z.object(getDeviceStatisticsOutputSchema);
    const result = schema.safeParse({ uptimeSec: "not-a-number" });
    expect(result.success).toBe(false);
  });

  it("list devices accepts the paginated envelope", () => {
    const schema = z.object(listDevicesOutputSchema);
    const sample = {
      offset: 0,
      limit: 25,
      count: 1,
      totalCount: 1,
      data: [{ id: "dev1", name: "AP" }],
    };
    expect(() => schema.parse(sample)).not.toThrow();
  });

  it("DPI category/application ids are numeric (live-verified)", () => {
    const catSchema = z.object(listDpiCategoriesOutputSchema);
    expect(() =>
      catSchema.parse({ data: [{ id: 4, name: "Media streaming services" }] })
    ).not.toThrow();
    // string id must be rejected — guards against the generic-id assumption
    expect(
      catSchema.safeParse({ data: [{ id: "4", name: "x" }] }).success
    ).toBe(false);
  });

  it("countries key on `code`, not `id` (live-verified)", () => {
    const schema = z.object(listCountriesOutputSchema);
    expect(() =>
      schema.parse({ data: [{ code: "US", name: "United States" }] })
    ).not.toThrow();
    expect(
      schema.safeParse({ data: [{ id: "US", name: "x" }] }).success
    ).toBe(false);
  });

  it("WAN and VPN server rows accept live-verified shapes", () => {
    expect(() =>
      z.object(listWansOutputSchema).parse({ data: [{ id: "w1", name: "Internet 1" }] })
    ).not.toThrow();
    expect(() =>
      z.object(listVpnServersOutputSchema).parse({
        data: [
          {
            id: "v1",
            type: "WIREGUARD",
            name: "WireGuard Server 1",
            enabled: true,
            metadata: { origin: "USER_DEFINED" },
          },
        ],
      })
    ).not.toThrow();
  });

  it("client / network / firewall policy / voucher / lag / info accept realistic samples", () => {
    expect(() =>
      z.object(getClientOutputSchema).parse({ id: "c1", type: "WIRELESS" })
    ).not.toThrow();
    expect(() =>
      z.object(networkOutputSchema).parse({ id: "n1", vlanId: 20, default: false })
    ).not.toThrow();
    expect(() =>
      z
        .object(firewallPolicyOutputSchema)
        .parse({ id: "p1", action: { type: "ALLOW" }, enabled: true })
    ).not.toThrow();
    expect(() =>
      z.object(voucherOutputSchema).parse({ id: "v1", code: "12345", expired: false })
    ).not.toThrow();
    expect(() =>
      z.object(lagOutputSchema).parse({ id: "l1", type: "LOCAL" })
    ).not.toThrow();
    expect(() =>
      z.object(getInfoOutputSchema).parse({ applicationVersion: "10.5.43" })
    ).not.toThrow();
  });

  it("create-voucher schema accepts the real Generate Vouchers response (live-captured 10.5.43)", () => {
    // Captured live: POST /hotspot/vouchers returns { vouchers: [...] } —
    // NOT a paginated { data: [...] } envelope. `code` is a STRING despite
    // the docs sample rendering it as a bare number. Regression guard against
    // the previous `{ ...pagination, data }` schema that hard-failed every call.
    const real = {
      vouchers: [
        {
          id: "d685adca-bef6-435f-9039-33f08663129f",
          createdAt: "2026-06-21T01:26:20Z",
          name: "shape-test",
          code: "8744293332",
          authorizedGuestCount: 0,
          expired: false,
          timeLimitMinutes: 1,
        },
      ],
    };
    expect(() => z.object(createVouchersOutputSchema).parse(real)).not.toThrow();
  });

  it("acl rule schema accepts source/destination/enforcingDevice filters", () => {
    expect(() =>
      z.object(aclRuleOutputSchema).parse({
        id: "a1",
        type: "IPV4",
        action: "BLOCK",
        sourceFilter: { type: "NETWORK", value: "n1" },
        destinationFilter: null,
        enforcingDeviceFilter: { type: "ALL" },
      })
    ).not.toThrow();
  });

  it("switch stack accepts the 10.6.106 shape (units[] + top-level deviceId)", () => {
    // Response sample from the 10.6.106 console docs. `units` replaced
    // `members`, and `deviceId` is new at the top level.
    expect(() =>
      z.object(switchStackOutputSchema).parse({
        id: "497f6eca-6276-4993-bfeb-53cbbbba6f08",
        deviceId: "4de4adb9-21ee-47e3-aeb4-8cf8ed6c109a",
        name: "Rack Stack",
        units: [{ deviceId: "d1" }, { deviceId: "d2" }],
        lags: [{ id: "l1" }],
        metadata: { origin: "USER_DEFINED" },
      })
    ).not.toThrow();
  });

  it("switch stack still accepts the pre-10.6.106 shape (members[])", () => {
    // The server talks to older consoles too — the rename must not make
    // their responses fail output validation.
    expect(() =>
      z.object(switchStackOutputSchema).parse({
        id: "s1",
        name: "Old Stack",
        members: [{ deviceId: "d1" }],
        lags: [],
        metadata: { origin: "USER_DEFINED" },
      })
    ).not.toThrow();
  });

  it("network schema accepts ipv6Configuration alongside ipv4Configuration", () => {
    // Live-captured from 10.6.106: ipv6Configuration is returned by
    // get-by-id but appears in no documented response sample.
    expect(() =>
      z.object(networkOutputSchema).parse({
        id: "8bb9e33c-9ee0-419c-88c6-f4b41776a289",
        name: "IoT",
        management: "GATEWAY",
        enabled: true,
        vlanId: 20,
        zoneId: "6884fc9e-af1a-4f83-bea4-b158421bf16a",
        ipv4Configuration: {
          autoScaleEnabled: false,
          hostIpAddress: "10.20.20.1",
          prefixLength: 24,
          dhcpConfiguration: { mode: "SERVER", leaseTimeSeconds: 86400 },
        },
        ipv6Configuration: {
          interfaceType: "STATIC",
          clientAddressAssignment: { slaacEnabled: true },
          routerAdvertisement: { priority: "LOW" },
          hostIpAddress: "fdc4:15e9:d008:20::1",
          prefixLength: 64,
        },
        metadata: { origin: "USER_DEFINED" },
      })
    ).not.toThrow();
  });

  it("acl rule schema accepts the read-only index field", () => {
    expect(() =>
      z.object(aclRuleOutputSchema).parse({ id: "a1", index: 0 })
    ).not.toThrow();
  });
});
