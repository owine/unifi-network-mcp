import { describe, it, expect, beforeEach } from "vitest";
import { createMockServer, createMockClient, mockFn, parseInputSchema } from "./_helpers.js";
import { registerWifiTools } from "../../src/tools/wifi.js";

// Stand-in WiFi keys, referenced by name so secret scanners do not read the
// fixtures as leaked passwords.
const FIXTURE_KEYS = {
  current: "fixture-current",
  iot: "fixture-iot",
  a: "fixture-a",
  b: "fixture-b",
  ppskA: "fixture-ppsk-a",
  ppskB: "fixture-ppsk-b",
  newB: "fixture-new-b",
  created: "fixture-created",
};

describe("registerWifiTools", () => {
  let server: ReturnType<typeof createMockServer>["server"];
  let handlers: ReturnType<typeof createMockServer>["handlers"];
  let configs: ReturnType<typeof createMockServer>["configs"];
  let client: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    const mock = createMockServer();
    server = mock.server;
    handlers = mock.handlers;
    configs = mock.configs;
    client = createMockClient();
  });

  describe("read-only mode", () => {
    beforeEach(() => {
      registerWifiTools(server, client, true);
    });

    it("should register read tools when readOnly=true", () => {
      expect(handlers.has("unifi_list_wifi")).toBe(true);
      expect(handlers.has("unifi_get_wifi")).toBe(true);
    });

    it("should not register write tools when readOnly=true", () => {
      expect(handlers.has("unifi_create_wifi")).toBe(false);
      expect(handlers.has("unifi_update_wifi")).toBe(false);
      expect(handlers.has("unifi_delete_wifi")).toBe(false);
    });
  });

  describe("read-write mode", () => {
    beforeEach(() => {
      registerWifiTools(server, client, false);
    });

    it("should register all tools when readOnly=false", () => {
      expect(handlers.has("unifi_list_wifi")).toBe(true);
      expect(handlers.has("unifi_get_wifi")).toBe(true);
      expect(handlers.has("unifi_create_wifi")).toBe(true);
      expect(handlers.has("unifi_update_wifi")).toBe(true);
      expect(handlers.has("unifi_delete_wifi")).toBe(true);
    });
  });

  describe("unifi_list_wifi", () => {
    beforeEach(() => {
      registerWifiTools(server, client);
    });

    it("should register the tool", () => {
      expect(handlers.has("unifi_list_wifi")).toBe(true);
    });

    it("should have correct annotations", () => {
      const config = configs.get("unifi_list_wifi");
      expect(config?.annotations.readOnlyHint).toBe(true);
      expect(config?.annotations.destructiveHint).toBe(false);
    });

    it("should return success with default parameters", async () => {
      const mockData = [{ id: "wifi1", name: "Office" }];
      mockFn(client, "get").mockResolvedValue(mockData);

      const handler = handlers.get("unifi_list_wifi");
      const result = await handler({ siteId: "site1" });

      expect(mockFn(client, "get")).toHaveBeenCalledWith("/sites/site1/wifi/broadcasts");
      expect(result.content).toBeDefined();
      expect(result.content[0].text).toContain("wifi1");
      expect(result.isError).toBeUndefined();
    });

    it("should pass offset and limit to query", async () => {
      const mockData: unknown[] = [];
      mockFn(client, "get").mockResolvedValue(mockData);

      const handler = handlers.get("unifi_list_wifi");
      await handler({ siteId: "site1", offset: 5, limit: 25 });

      expect(mockFn(client, "get")).toHaveBeenCalledWith(
        "/sites/site1/wifi/broadcasts?offset=5&limit=25"
      );
    });

    it("should pass filter to query", async () => {
      const mockData: unknown[] = [];
      mockFn(client, "get").mockResolvedValue(mockData);

      const handler = handlers.get("unifi_list_wifi");
      await handler({ siteId: "site1", filter: "enabled.eq(true)" });

      expect(mockFn(client, "get")).toHaveBeenCalledWith(
        "/sites/site1/wifi/broadcasts?filter=enabled.eq%28true%29"
      );
    });

    it("should return error when client fails", async () => {
      const testError = new Error("API error");
      mockFn(client, "get").mockRejectedValue(testError);

      const handler = handlers.get("unifi_list_wifi");
      const result = await handler({ siteId: "site1" });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("API error");
    });
  });

  describe("unifi_get_wifi", () => {
    beforeEach(() => {
      registerWifiTools(server, client);
    });

    it("should register the tool", () => {
      expect(handlers.has("unifi_get_wifi")).toBe(true);
    });

    it("should have correct annotations", () => {
      const config = configs.get("unifi_get_wifi");
      expect(config?.annotations.readOnlyHint).toBe(true);
      expect(config?.annotations.destructiveHint).toBe(false);
    });

    it("should return success with site and wifi ids", async () => {
      const mockData = { id: "wifi1", name: "Office", enabled: true };
      mockFn(client, "get").mockResolvedValue(mockData);

      const handler = handlers.get("unifi_get_wifi");
      const result = await handler({
        siteId: "site1",
        wifiBroadcastId: "wifi1",
      });

      expect(mockFn(client, "get")).toHaveBeenCalledWith(
        "/sites/site1/wifi/broadcasts/wifi1"
      );
      expect(result.content[0].text).toContain("wifi1");
      expect(result.isError).toBeUndefined();
    });

    it("should return error when client fails", async () => {
      const testError = new Error("Not found");
      mockFn(client, "get").mockRejectedValue(testError);

      const handler = handlers.get("unifi_get_wifi");
      const result = await handler({
        siteId: "site1",
        wifiBroadcastId: "wifi1",
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Not found");
    });
  });

  describe("unifi_create_wifi", () => {
    const standardCreate = {
      siteId: "site1",
      name: "Guest",
      enabled: true,
      type: "STANDARD",
      broadcastingFrequenciesGHz: ["2.4", "5"],
      securityConfiguration: {},
      multicastToUnicastConversionEnabled: false,
      clientIsolationEnabled: false,
      hideName: false,
      uapsdEnabled: false,
      arpProxyEnabled: false,
      bssTransitionEnabled: false,
      advertiseDeviceName: false,
      channel2gLockedTo6: false,
      dtimPeriod2gLockedTo3: false,
    };

    beforeEach(() => {
      registerWifiTools(server, client);
    });

    it("should register the tool", () => {
      expect(handlers.has("unifi_create_wifi")).toBe(true);
    });

    it("should have correct annotations", () => {
      const config = configs.get("unifi_create_wifi");
      expect(config?.annotations.readOnlyHint).toBe(false);
      expect(config?.annotations.destructiveHint).toBe(false);
      expect(config?.annotations.idempotentHint).toBe(false);
    });

    it("should return success when client.post succeeds", async () => {
      const mockData = { id: "wifi-new", name: "Guest" };
      mockFn(client, "post").mockResolvedValue(mockData);

      const handler = handlers.get("unifi_create_wifi");
      const result = await handler({
        siteId: "site1",
        name: "Guest",
        enabled: true,
        type: "STANDARD",
        broadcastingFrequenciesGHz: ["2.4", "5"],
        securityConfiguration: {},
        multicastToUnicastConversionEnabled: false,
        clientIsolationEnabled: false,
        hideName: false,
        uapsdEnabled: false,
        arpProxyEnabled: false,
        bssTransitionEnabled: false,
        advertiseDeviceName: false,
        channel2gLockedTo6: false,
        dtimPeriod2gLockedTo3: false,
      });

      expect(mockFn(client, "post")).toHaveBeenCalledWith(
        "/sites/site1/wifi/broadcasts",
        expect.objectContaining({
          name: "Guest",
          enabled: true,
          type: "STANDARD",
          broadcastingFrequenciesGHz: [2.4, 5],
          securityConfiguration: {},
          multicastToUnicastConversionEnabled: false,
          clientIsolationEnabled: false,
          hideName: false,
          uapsdEnabled: false,
          arpProxyEnabled: false,
          bssTransitionEnabled: false,
          advertiseDeviceName: false,
          channel2gLockedTo6: false,
          dtimPeriod2gLockedTo3: false,
        })
      );
      expect(result.content[0].text).toContain("wifi-new");
      expect(result.isError).toBeUndefined();
    });

    it("should convert frequency strings to numbers", async () => {
      mockFn(client, "post").mockResolvedValue({ id: "wifi-new" });

      const handler = handlers.get("unifi_create_wifi");
      await handler({
        siteId: "site1",
        name: "Guest",
        enabled: true,
        type: "STANDARD",
        broadcastingFrequenciesGHz: ["2.4", "5", "6"],
        securityConfiguration: {},
        multicastToUnicastConversionEnabled: false,
        clientIsolationEnabled: false,
        hideName: false,
        uapsdEnabled: false,
        arpProxyEnabled: false,
        bssTransitionEnabled: false,
        advertiseDeviceName: false,
        channel2gLockedTo6: false,
        dtimPeriod2gLockedTo3: false,
      });

      expect(mockFn(client, "post")).toHaveBeenCalledWith(
        "/sites/site1/wifi/broadcasts",
        expect.objectContaining({
          broadcastingFrequenciesGHz: [2.4, 5, 6],
        })
      );
    });

    it("should return dryRun preview when dryRun=true", async () => {
      const handler = handlers.get("unifi_create_wifi");
      const result = await handler({
        siteId: "site1",
        name: "Guest",
        enabled: true,
        type: "STANDARD",
        broadcastingFrequenciesGHz: ["2.4", "5"],
        securityConfiguration: {},
        multicastToUnicastConversionEnabled: false,
        clientIsolationEnabled: false,
        hideName: false,
        uapsdEnabled: false,
        arpProxyEnabled: false,
        bssTransitionEnabled: false,
        advertiseDeviceName: false,
        channel2gLockedTo6: false,
        dtimPeriod2gLockedTo3: false,
        dryRun: true,
      });

      expect(mockFn(client, "post")).not.toHaveBeenCalled();
      expect(result.content[0].text).toContain("dryRun");
      expect(result.content[0].text).toContain("POST");
      expect(result.content[0].text).toContain("/sites/site1/wifi/broadcasts");
    });

    it("should return error when client fails", async () => {
      const testError = new Error("Create failed");
      mockFn(client, "post").mockRejectedValue(testError);

      const handler = handlers.get("unifi_create_wifi");
      const result = await handler({
        siteId: "site1",
        name: "Guest",
        enabled: true,
        type: "STANDARD",
        broadcastingFrequenciesGHz: ["2.4"],
        securityConfiguration: {},
        multicastToUnicastConversionEnabled: false,
        clientIsolationEnabled: false,
        hideName: false,
        uapsdEnabled: false,
        arpProxyEnabled: false,
        bssTransitionEnabled: false,
        advertiseDeviceName: false,
        channel2gLockedTo6: false,
        dtimPeriod2gLockedTo3: false,
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Create failed");
    });

    it("should create an IOT_OPTIMIZED SSID without the STANDARD-only fields", async () => {
      mockFn(client, "post").mockResolvedValue({ id: "wifi-iot" });

      const result = await handlers.get("unifi_create_wifi")({
        siteId: "site1",
        name: "Things",
        enabled: true,
        type: "IOT_OPTIMIZED",
        securityConfiguration: { type: "WPA2_PERSONAL", passphrase: FIXTURE_KEYS.iot },
        multicastToUnicastConversionEnabled: false,
        clientIsolationEnabled: true,
        hideName: false,
        uapsdEnabled: false,
        channel2gLockedTo6: false,
        dtimPeriod2gLockedTo3: false,
      });

      expect(result.isError).toBeUndefined();
      const body = mockFn(client, "post").mock.calls[0][1];
      expect(body).not.toHaveProperty("broadcastingFrequenciesGHz");
      expect(body).not.toHaveProperty("arpProxyEnabled");
      expect(body.securityConfiguration.passphrase).toBe(FIXTURE_KEYS.iot);
    });

    it("should reject STANDARD-only fields on an IOT_OPTIMIZED SSID", async () => {
      const result = await handlers.get("unifi_create_wifi")({
        siteId: "site1",
        name: "Things",
        enabled: true,
        type: "IOT_OPTIMIZED",
        securityConfiguration: {},
        multicastToUnicastConversionEnabled: false,
        clientIsolationEnabled: true,
        hideName: false,
        uapsdEnabled: false,
        channel2gLockedTo6: false,
        dtimPeriod2gLockedTo3: false,
        arpProxyEnabled: true,
        broadcastingFrequenciesGHz: ["2.4"],
      });

      expect(mockFn(client, "post")).not.toHaveBeenCalled();
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain(
        "Fields not accepted for type IOT_OPTIMIZED: arpProxyEnabled, broadcastingFrequenciesGHz"
      );
    });

    it("should require the STANDARD-only required fields for a STANDARD SSID", async () => {
      const result = await handlers.get("unifi_create_wifi")({
        siteId: "site1",
        name: "Guest",
        enabled: true,
        type: "STANDARD",
        securityConfiguration: {},
        multicastToUnicastConversionEnabled: false,
        clientIsolationEnabled: false,
        hideName: false,
        uapsdEnabled: false,
        channel2gLockedTo6: false,
        dtimPeriod2gLockedTo3: false,
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain(
        "Missing required fields for type STANDARD: broadcastingFrequenciesGHz, arpProxyEnabled, bssTransitionEnabled, advertiseDeviceName"
      );
    });

    it("should accept numeric frequencies and de-duplicate them", async () => {
      mockFn(client, "post").mockResolvedValue({ id: "wifi-new" });

      await handlers.get("unifi_create_wifi")({
        ...standardCreate,
        broadcastingFrequenciesGHz: [5, "5", 2.4],
      });

      expect(mockFn(client, "post").mock.calls[0][1].broadcastingFrequenciesGHz).toEqual([5, 2.4]);
    });

    it("should reject schema when channel2gLockedTo6 is missing", () => {
      const schema = parseInputSchema(configs, "unifi_create_wifi");
      const result = schema.safeParse({
        siteId: "site1",
        name: "Guest",
        enabled: true,
        type: "STANDARD",
        broadcastingFrequenciesGHz: ["5"],
        securityConfiguration: {},
        multicastToUnicastConversionEnabled: false,
        clientIsolationEnabled: false,
        hideName: false,
        uapsdEnabled: false,
        arpProxyEnabled: false,
        bssTransitionEnabled: false,
        advertiseDeviceName: false,
        dtimPeriod2gLockedTo3: false,
      });
      expect(result.success).toBe(false);
    });

    it("should reject schema when dtimPeriod2gLockedTo3 is missing", () => {
      const schema = parseInputSchema(configs, "unifi_create_wifi");
      const result = schema.safeParse({
        siteId: "site1",
        name: "Guest",
        enabled: true,
        type: "STANDARD",
        broadcastingFrequenciesGHz: ["5"],
        securityConfiguration: {},
        multicastToUnicastConversionEnabled: false,
        clientIsolationEnabled: false,
        hideName: false,
        uapsdEnabled: false,
        arpProxyEnabled: false,
        bssTransitionEnabled: false,
        advertiseDeviceName: false,
        channel2gLockedTo6: false,
      });
      expect(result.success).toBe(false);
    });

    it("should pass through v10.4.46 fields (channel2gLockedTo6, dtimPeriod2gLockedTo3, dnsAssistanceConfiguration, handoffSuggestionsConfiguration)", async () => {
      mockFn(client, "post").mockResolvedValue({ id: "wifi-new" });

      const handler = handlers.get("unifi_create_wifi");
      await handler({
        siteId: "site1",
        name: "Guest",
        enabled: true,
        type: "STANDARD",
        broadcastingFrequenciesGHz: ["2.4"],
        securityConfiguration: {},
        multicastToUnicastConversionEnabled: false,
        clientIsolationEnabled: false,
        hideName: false,
        uapsdEnabled: false,
        arpProxyEnabled: false,
        bssTransitionEnabled: false,
        advertiseDeviceName: false,
        channel2gLockedTo6: true,
        dtimPeriod2gLockedTo3: true,
        dnsAssistanceConfiguration: { mode: "auto" },
        handoffSuggestionsConfiguration: {
          band5GHzRssiThreshold: -80,
          band6GHzRssiThreshold: -80,
        },
      });

      expect(mockFn(client, "post")).toHaveBeenCalledWith(
        "/sites/site1/wifi/broadcasts",
        expect.objectContaining({
          channel2gLockedTo6: true,
          dtimPeriod2gLockedTo3: true,
          dnsAssistanceConfiguration: { mode: "auto" },
          handoffSuggestionsConfiguration: {
            band5GHzRssiThreshold: -80,
            band6GHzRssiThreshold: -80,
          },
        })
      );
    });
  });

  describe("unifi_update_wifi", () => {
    // Shape captured live from an 11.0.83 STANDARD SSID (values replaced).
    const currentSsid = {
      type: "STANDARD",
      id: "wifi1",
      name: "Guest",
      metadata: { origin: "USER_DEFINED" },
      enabled: true,
      network: { type: "SPECIFIC", networkId: "net-guest" },
      securityConfiguration: {
        type: "WPA2_WPA3_PERSONAL",
        passphrase: FIXTURE_KEYS.current,
        pmfMode: "OPTIONAL",
        presharedKeys: [
          { network: { type: "SPECIFIC", networkId: "net-a" }, passphrase: FIXTURE_KEYS.a },
          { network: { type: "SPECIFIC", networkId: "net-b" }, passphrase: FIXTURE_KEYS.b },
        ],
      },
      multicastToUnicastConversionEnabled: true,
      clientIsolationEnabled: true,
      hideName: false,
      uapsdEnabled: true,
      channel2gLockedTo6: false,
      dtimPeriod2gLockedTo3: false,
      broadcastingFrequenciesGHz: [5, 2.4],
      hotspotConfiguration: { type: "CAPTIVE_PORTAL" },
      bandSteeringEnabled: false,
      arpProxyEnabled: false,
      bssTransitionEnabled: true,
      advertiseDeviceName: false,
      handoffSuggestionsConfiguration: { band6GHzRssiThreshold: -80 },
    };

    // The documented PUT body: the GET response minus its read-only fields.
    const currentBody = Object.fromEntries(
      Object.entries(currentSsid).filter(([field]) => !["id", "metadata"].includes(field))
    );
    const path = "/sites/site1/wifi/broadcasts/wifi1";

    beforeEach(() => {
      registerWifiTools(server, client);
      mockFn(client, "get").mockResolvedValue(currentSsid);
    });

    it("should register the tool", () => {
      expect(handlers.has("unifi_update_wifi")).toBe(true);
    });

    it("should have correct annotations", () => {
      const config = configs.get("unifi_update_wifi");
      expect(config?.annotations.readOnlyHint).toBe(false);
      expect(config?.annotations.destructiveHint).toBe(false);
      expect(config?.annotations.idempotentHint).toBe(true);
    });

    it("should read the current SSID and PUT the merged full body", async () => {
      mockFn(client, "put").mockResolvedValue({ ...currentSsid, name: "Visitors" });

      const result = await handlers.get("unifi_update_wifi")({ siteId: "site1", wifiBroadcastId: "wifi1", name: "Visitors" });

      expect(mockFn(client, "get")).toHaveBeenCalledWith(path);
      expect(mockFn(client, "put")).toHaveBeenCalledWith(path, { ...currentBody, name: "Visitors" });
      expect(result.isError).toBeUndefined();
    });

    it("should keep optional configs that would otherwise reset when omitted", async () => {
      mockFn(client, "put").mockResolvedValue(currentSsid);

      await handlers.get("unifi_update_wifi")({ siteId: "site1", wifiBroadcastId: "wifi1", hideName: true });

      const body = mockFn(client, "put").mock.calls[0][1];
      expect(body.handoffSuggestionsConfiguration).toEqual({ band6GHzRssiThreshold: -80 });
      expect(body.hotspotConfiguration).toEqual({ type: "CAPTIVE_PORTAL" });
      expect(body.hideName).toBe(true);
      expect(body).not.toHaveProperty("id");
      expect(body).not.toHaveProperty("metadata");
    });

    it("should send an explicit null to clear an optional config", async () => {
      mockFn(client, "put").mockResolvedValue(currentSsid);

      await handlers.get("unifi_update_wifi")({
        siteId: "site1",
        wifiBroadcastId: "wifi1",
        handoffSuggestionsConfiguration: null,
      });

      expect(mockFn(client, "put").mock.calls[0][1].handoffSuggestionsConfiguration).toBeNull();
    });

    it("should drop STANDARD-only fields when switching to IOT_OPTIMIZED", async () => {
      mockFn(client, "put").mockResolvedValue(currentSsid);

      await handlers.get("unifi_update_wifi")({ siteId: "site1", wifiBroadcastId: "wifi1", type: "IOT_OPTIMIZED" });

      const body = mockFn(client, "put").mock.calls[0][1];
      expect(body.type).toBe("IOT_OPTIMIZED");
      for (const field of ["broadcastingFrequenciesGHz", "hotspotConfiguration", "arpProxyEnabled", "handoffSuggestionsConfiguration"]) {
        expect(body).not.toHaveProperty(field);
      }
      expect(body.securityConfiguration.passphrase).toBe(FIXTURE_KEYS.current);
    });

    it("should reject STANDARD-only fields on an IOT_OPTIMIZED SSID", async () => {
      mockFn(client, "get").mockResolvedValue({ ...currentSsid, type: "IOT_OPTIMIZED" });

      const result = await handlers.get("unifi_update_wifi")({ siteId: "site1", wifiBroadcastId: "wifi1", mloEnabled: true });

      expect(mockFn(client, "put")).not.toHaveBeenCalled();
      expect(result.content[0].text).toContain("Fields not accepted for type IOT_OPTIMIZED: mloEnabled");
    });

    it("should return the merged body as a dryRun preview without writing", async () => {
      const result = await handlers.get("unifi_update_wifi")({
        siteId: "site1",
        wifiBroadcastId: "wifi1",
        enabled: false,
        dryRun: true,
      });

      expect(mockFn(client, "put")).not.toHaveBeenCalled();
      const preview = JSON.parse(result.content[0].text);
      expect(preview.wouldExecute.method).toBe("PUT");
      expect(preview.wouldExecute.body.enabled).toBe(false);
      expect(preview.wouldExecute.body.securityConfiguration.passphrase).toBe(FIXTURE_KEYS.current);
    });

    it("should return error when client.put fails", async () => {
      mockFn(client, "put").mockRejectedValue(new Error("Update failed"));

      const result = await handlers.get("unifi_update_wifi")({ siteId: "site1", wifiBroadcastId: "wifi1", name: "x" });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Update failed");
    });
  });

  describe("unifi_delete_wifi", () => {
    beforeEach(() => {
      registerWifiTools(server, client);
    });

    it("should register the tool", () => {
      expect(handlers.has("unifi_delete_wifi")).toBe(true);
    });

    it("should have correct annotations", () => {
      const config = configs.get("unifi_delete_wifi");
      expect(config?.annotations.readOnlyHint).toBe(false);
      expect(config?.annotations.destructiveHint).toBe(true);
    });

    it("should return success when client.delete succeeds", async () => {
      const mockData = { deleted: true };
      mockFn(client, "delete").mockResolvedValue(mockData);

      const handler = handlers.get("unifi_delete_wifi");
      const result = await handler({
        siteId: "site1",
        wifiBroadcastId: "wifi1",
        confirm: true,
      });

      expect(mockFn(client, "delete")).toHaveBeenCalledWith(
        "/sites/site1/wifi/broadcasts/wifi1"
      );
      expect(result.isError).toBeUndefined();
    });

    it("should add force parameter to path when force=true", async () => {
      mockFn(client, "delete").mockResolvedValue({ deleted: true });

      const handler = handlers.get("unifi_delete_wifi");
      await handler({
        siteId: "site1",
        wifiBroadcastId: "wifi1",
        force: true,
        confirm: true,
      });

      expect(mockFn(client, "delete")).toHaveBeenCalledWith(
        "/sites/site1/wifi/broadcasts/wifi1?force=true"
      );
    });

    it("should not add force parameter when force=false", async () => {
      mockFn(client, "delete").mockResolvedValue({ deleted: true });

      const handler = handlers.get("unifi_delete_wifi");
      await handler({
        siteId: "site1",
        wifiBroadcastId: "wifi1",
        force: false,
        confirm: true,
      });

      expect(mockFn(client, "delete")).toHaveBeenCalledWith(
        "/sites/site1/wifi/broadcasts/wifi1"
      );
    });

    it("should return dryRun preview when dryRun=true", async () => {
      const handler = handlers.get("unifi_delete_wifi");
      const result = await handler({
        siteId: "site1",
        wifiBroadcastId: "wifi1",
        dryRun: true,
        confirm: true,
      });

      expect(mockFn(client, "delete")).not.toHaveBeenCalled();
      expect(result.content[0].text).toContain("dryRun");
      expect(result.content[0].text).toContain("DELETE");
      expect(result.content[0].text).toContain("/sites/site1/wifi/broadcasts/wifi1");
    });

    it("should return dryRun with force in path when force=true and dryRun=true", async () => {
      const handler = handlers.get("unifi_delete_wifi");
      const result = await handler({
        siteId: "site1",
        wifiBroadcastId: "wifi1",
        force: true,
        dryRun: true,
        confirm: true,
      });

      expect(mockFn(client, "delete")).not.toHaveBeenCalled();
      expect(result.content[0].text).toContain("?force=true");
    });

    it("should return error when client fails", async () => {
      const testError = new Error("Delete failed");
      mockFn(client, "delete").mockRejectedValue(testError);

      const handler = handlers.get("unifi_delete_wifi");
      const result = await handler({
        siteId: "site1",
        wifiBroadcastId: "wifi1",
        confirm: true,
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Delete failed");
    });

    it("should return error when confirm is not provided", async () => {
      const handler = handlers.get("unifi_delete_wifi");
      const result = await handler({ siteId: "site1", wifiBroadcastId: "wifi1" });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("requires explicit confirmation");
    });

    it("should return error when confirm is false", async () => {
      const handler = handlers.get("unifi_delete_wifi");
      const result = await handler({
        siteId: "site1",
        wifiBroadcastId: "wifi1",
        confirm: false,
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("requires explicit confirmation");
    });
  });
});
