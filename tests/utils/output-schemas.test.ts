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
  lagOutputSchema,
  getInfoOutputSchema,
  listDpiCategoriesOutputSchema,
  listCountriesOutputSchema,
  listWansOutputSchema,
  listVpnServersOutputSchema,
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
      z.object(getInfoOutputSchema).parse({ applicationVersion: "10.4.55" })
    ).not.toThrow();
  });
});
