import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { NetworkClient } from "../client.js";
import { formatSuccess, formatError } from "../utils/responses.js";
import { buildQuery } from "../utils/query.js";
import {
  READ_ONLY,
  WRITE,
  WRITE_NOT_IDEMPOTENT,
  DESTRUCTIVE,
  formatDryRun,
  requireConfirmation,
  requireConfirmationIf,
} from "../utils/safety.js";
import {
  asObject,
  definedEntries,
  mergeForPut,
  missingFields,
  unsupportedFields,
  type JsonObject,
  withResourceLock,
} from "../utils/full-put.js";
import { containsRedacted, redactSecrets, restoreRedacted, REDACTED } from "../utils/secrets.js";
import {
  listWifiOutputSchema,
  getWifiOutputSchema,
  writeResult,
} from "../utils/output-schemas.js";
import { resourceId } from "../utils/params.js";

// Request-body fields per broadcast type, from the 11.0.83 POST/PUT schemas.
// IOT_OPTIMIZED accepts a strict subset of STANDARD.
const IOT_OPTIMIZED_FIELDS = [
  "type",
  "name",
  "network",
  "enabled",
  "securityConfiguration",
  "broadcastingDeviceFilter",
  "mdnsProxyConfiguration",
  "multicastFilteringPolicy",
  "multicastToUnicastConversionEnabled",
  "clientIsolationEnabled",
  "hideName",
  "uapsdEnabled",
  "channel2gLockedTo6",
  "dtimPeriod2gLockedTo3",
  "basicDataRateKbpsByFrequencyGHz",
  "clientFilteringPolicy",
  "blackoutScheduleConfiguration",
] as const;

const STANDARD_FIELDS = [
  ...IOT_OPTIMIZED_FIELDS,
  "broadcastingFrequenciesGHz",
  "hotspotConfiguration",
  "mloEnabled",
  "bandSteeringEnabled",
  "arpProxyEnabled",
  "bssTransitionEnabled",
  "advertiseDeviceName",
  "dtimPeriodByFrequencyGHzOverride",
  "dnsAssistanceConfiguration",
  "handoffSuggestionsConfiguration",
] as const;

const IOT_OPTIMIZED_REQUIRED = [
  "type",
  "name",
  "enabled",
  "securityConfiguration",
  "multicastToUnicastConversionEnabled",
  "clientIsolationEnabled",
  "hideName",
  "uapsdEnabled",
  "channel2gLockedTo6",
  "dtimPeriod2gLockedTo3",
] as const;

const STANDARD_REQUIRED = [
  ...IOT_OPTIMIZED_REQUIRED,
  "broadcastingFrequenciesGHz",
  "arpProxyEnabled",
  "bssTransitionEnabled",
  "advertiseDeviceName",
] as const;

function fieldsForType(type: unknown) {
  if (type === "STANDARD") return { allowed: STANDARD_FIELDS, required: STANDARD_REQUIRED };
  if (type === "IOT_OPTIMIZED") return { allowed: IOT_OPTIMIZED_FIELDS, required: IOT_OPTIMIZED_REQUIRED };
  throw new Error(`Unsupported WiFi broadcast type: ${String(type)}`);
}

const frequencies = z
  .array(z.union([z.enum(["2.4", "5", "6"]), z.literal(2.4), z.literal(5), z.literal(6)]))
  .min(1)
  .describe("Frequencies to broadcast on: 2.4, 5, 6 (strings or numbers; sent as unique numbers). STANDARD only.");

const config = (description: string) =>
  z.record(z.string(), z.unknown()).nullable().optional().describe(description);

const flag = (description: string) => z.boolean().optional().describe(description);

// Every body field as an optional input. Create tightens the core fields to
// required; update keeps them optional and fills gaps from the current SSID.
const wifiFields = {
  name: z.string().min(1).optional().describe("SSID name"),
  enabled: flag("Enable the WiFi network"),
  type: z.enum(["STANDARD", "IOT_OPTIMIZED"]).optional().describe("WiFi type"),
  broadcastingFrequenciesGHz: frequencies.optional(),
  securityConfiguration: z
    .record(z.string(), z.unknown())
    .optional()
    .describe(`Security configuration object (type, passphrase, presharedKeys[], pmfMode, …). A "${REDACTED}" value read from unifi_get_wifi is kept as the existing secret on update.`),
  multicastToUnicastConversionEnabled: flag("Enable multicast to unicast conversion"),
  clientIsolationEnabled: flag("Enable client isolation"),
  hideName: flag("Hide SSID name"),
  uapsdEnabled: flag("Enable Unscheduled Automatic Power Save Delivery"),
  channel2gLockedTo6: flag("Lock 2.4GHz channel to 6 on all broadcasting devices"),
  dtimPeriod2gLockedTo3: flag("Lock 2.4GHz DTIM period to 3"),
  arpProxyEnabled: flag("Enable ARP proxy. STANDARD only."),
  bssTransitionEnabled: flag("Enable BSS transition. STANDARD only."),
  advertiseDeviceName: flag("Advertise device name in beacon frames. STANDARD only."),
  mloEnabled: flag("Enable MLO (Multi-Link Operation). STANDARD only."),
  bandSteeringEnabled: flag("Enable band steering. STANDARD only."),
  network: config("Network reference, e.g. {type:'NATIVE'} or {type:'SPECIFIC', networkId:'<uuid>'} (live-observed). Omitted on PPSK SSIDs, where each presharedKeys[] entry carries its own network."),
  broadcastingDeviceFilter: config("Custom scope of broadcasting devices. Null = broadcast from all AP-capable devices."),
  mdnsProxyConfiguration: config("mDNS proxy configuration"),
  multicastFilteringPolicy: config("Multicast filtering policy"),
  basicDataRateKbpsByFrequencyGHz: config("Basic data rate in kbps by frequency"),
  clientFilteringPolicy: config("Client MAC address filtering policy"),
  blackoutScheduleConfiguration: config("Blackout schedule configuration"),
  hotspotConfiguration: config("Hotspot configuration, e.g. {type:'CAPTIVE_PORTAL'}. STANDARD only."),
  dtimPeriodByFrequencyGHzOverride: config("DTIM period override by frequency. STANDARD only."),
  dnsAssistanceConfiguration: config("DNS assistance configuration. STANDARD only."),
  handoffSuggestionsConfiguration: config("Handoff suggestions config (band5GHzRssiThreshold, band6GHzRssiThreshold). Null disables. STANDARD only."),
};

type WifiFieldValues = { [K in keyof typeof wifiFields]?: z.infer<(typeof wifiFields)[K]> };

function toBodyFields(values: WifiFieldValues): JsonObject {
  const { broadcastingFrequenciesGHz, ...rest } = values;
  return definedEntries({
    ...rest,
    broadcastingFrequenciesGHz:
      broadcastingFrequenciesGHz && [...new Set(broadcastingFrequenciesGHz.map(Number))],
  });
}

function checkBody(body: JsonObject, updates: JsonObject) {
  const { allowed, required } = fieldsForType(body.type);
  const rejected = unsupportedFields(updates, allowed);
  if (rejected.length > 0) {
    throw new Error(`Fields not accepted for type ${String(body.type)}: ${rejected.join(", ")}`);
  }
  const missing = missingFields(body, required);
  if (missing.length > 0) {
    throw new Error(`Missing required fields for type ${String(body.type)}: ${missing.join(", ")}`);
  }
}

function securityType(ssid: JsonObject): unknown {
  const security = ssid.securityConfiguration;
  return security !== null && typeof security === "object" && "type" in security ? security.type : undefined;
}

const confirmSecurity = z
  .boolean()
  .optional()
  .describe("Set true to confirm creating an open SSID or changing an SSID's security type");

const includeSecrets = z
  .boolean()
  .optional()
  .describe(`Return WiFi passphrases in plaintext instead of "${REDACTED}" (default: false). Only set this when the user explicitly needs the key.`);

const readRedaction = `Passphrases (securityConfiguration.passphrase, presharedKeys[].passphrase) are returned as "${REDACTED}" unless includeSecrets is true.`;

export function registerWifiTools(
  server: McpServer,
  client: NetworkClient,
  readOnly = false
) {
  server.registerTool(
    "unifi_list_wifi",
    {
      description: `List all WiFi broadcasts (SSIDs) at a site. Returns (sparse list view, live-verified on 11.0.83): id, name (SSID), type (STANDARD/IOT_OPTIMIZED), enabled, metadata.origin, network reference (absent on PPSK SSIDs), securityConfiguration.type, broadcastingFrequenciesGHz, hotspotConfiguration (empty object when set). Booleans such as hideName/bandSteeringEnabled/clientIsolationEnabled, the full security configuration and optional configs are only returned by unifi_get_wifi. ${readRedaction} Use for: SSID inventory. For per-AP radio state (channel, txPower), use unifi_get_device on the AP.`,
      inputSchema: {
        siteId: resourceId().describe("Site ID"),
        offset: z
          .number()
          .int()
          .nonnegative()
          .optional()
          .describe("Number of records to skip (default: 0)"),
        limit: z
          .number()
          .int()
          .min(0)
          .max(200)
          .optional()
          .describe("Number of records to return (default: 25, max: 200)"),
        filter: z
          .string()
          .optional()
          .describe("Filter expression, e.g. enabled.eq(true)"),
        includeSecrets,
      },
      outputSchema: listWifiOutputSchema,
      annotations: READ_ONLY,
    },
    async ({ siteId, offset, limit, filter, includeSecrets }) => {
      try {
        const query = buildQuery({ offset, limit, filter });
        const data = await client.get(`/sites/${siteId}/wifi/broadcasts${query}`);
        return formatSuccess(includeSecrets ? data : redactSecrets(data), { structured: true });
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.registerTool(
    "unifi_get_wifi",
    {
      description: `Get full configuration for a WiFi broadcast (SSID). Returns the list fields plus the booleans (hideName, clientIsolationEnabled, uapsdEnabled, multicastToUnicastConversionEnabled, bandSteeringEnabled, arpProxyEnabled, bssTransitionEnabled, advertiseDeviceName, channel2gLockedTo6, dtimPeriod2gLockedTo3), the full securityConfiguration (type, pmfMode, fastRoamingEnabled, saeConfiguration, presharedKeys[] on PPSK SSIDs, …), and optional configs when configured (omitted otherwise): clientFilteringPolicy, blackoutScheduleConfiguration, hotspotConfiguration, mdnsProxyConfiguration, handoffSuggestionsConfiguration, dtimPeriodByFrequencyGHzOverride, broadcastingDeviceFilter, mloEnabled. ${readRedaction}`,
      inputSchema: {
        siteId: resourceId().describe("Site ID"),
        wifiBroadcastId: resourceId().describe("WiFi Broadcast ID"),
        includeSecrets,
      },
      outputSchema: getWifiOutputSchema,
      annotations: READ_ONLY,
    },
    async ({ siteId, wifiBroadcastId, includeSecrets }) => {
      try {
        const data = await client.get(
          `/sites/${siteId}/wifi/broadcasts/${wifiBroadcastId}`
        );
        return formatSuccess(includeSecrets ? data : redactSecrets(data), { structured: true });
      } catch (err) {
        return formatError(err);
      }
    }
  );

  if (readOnly) return;

  server.registerTool(
    "unifi_create_wifi",
    {
      description: `Create a new WiFi network (SSID). Required for both types: type, name, enabled, securityConfiguration, multicastToUnicastConversionEnabled, clientIsolationEnabled, hideName, uapsdEnabled, channel2gLockedTo6, dtimPeriod2gLockedTo3. STANDARD additionally requires broadcastingFrequenciesGHz, arpProxyEnabled, bssTransitionEnabled, advertiseDeviceName; fields marked "STANDARD only" are rejected for IOT_OPTIMIZED (per 11.0.83 docs). The response echo has passphrases redacted. Idempotency: not safe to retry — re-running creates a duplicate SSID.`,
      inputSchema: {
        siteId: resourceId().describe("Site ID"),
        ...wifiFields,
        name: z.string().min(1).describe("SSID name"),
        enabled: z.boolean().describe("Enable the WiFi network"),
        type: z.enum(["STANDARD", "IOT_OPTIMIZED"]).describe("WiFi type"),
        securityConfiguration: z
          .record(z.string(), z.unknown())
          .describe("Security configuration object (type, passphrase, …)"),
        multicastToUnicastConversionEnabled: z.boolean().describe("Enable multicast to unicast conversion"),
        clientIsolationEnabled: z.boolean().describe("Enable client isolation"),
        hideName: z.boolean().describe("Hide SSID name"),
        uapsdEnabled: z.boolean().describe("Enable Unscheduled Automatic Power Save Delivery"),
        channel2gLockedTo6: z.boolean().describe("Lock 2.4GHz channel to 6 on all broadcasting devices"),
        dtimPeriod2gLockedTo3: z.boolean().describe("Lock 2.4GHz DTIM period to 3"),
        confirm: confirmSecurity,
        dryRun: z
          .boolean()
          .optional()
          .describe("Preview this action without executing it"),
      },
      outputSchema: writeResult(getWifiOutputSchema),
      annotations: WRITE_NOT_IDEMPOTENT,
    },
    async ({ siteId, confirm, dryRun, ...fields }) => {
      try {
        const body = toBodyFields(fields);
        checkBody(body, body);
        const guard = requireConfirmationIf(
          securityType(body) === "OPEN" ? "This creates an open SSID with no encryption" : undefined,
          confirm, dryRun
        );
        if (guard) return guard;
        if (containsRedacted(body)) {
          throw new Error(`securityConfiguration contains "${REDACTED}" — a new SSID needs the real passphrase`);
        }
        if (dryRun) return formatDryRun("POST", `/sites/${siteId}/wifi/broadcasts`, redactSecrets(body));
        const data = await client.post(`/sites/${siteId}/wifi/broadcasts`, body);
        return formatSuccess(redactSecrets(data), { structured: true });
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.registerTool(
    "unifi_update_wifi",
    {
      description: `Update an existing WiFi network. Pass only the fields to change. The API's PUT replaces the whole SSID (11.0.83 documents 14 required fields for STANDARD, 10 for IOT_OPTIMIZED), so this tool reads the current SSID, keeps every documented body field, overlays your changes and sends the full body — omitted fields keep their current values instead of being reset. Pass null to clear an optional config (e.g. broadcastingDeviceFilter: null broadcasts from all APs). Top-level objects are replaced whole: to change one security setting, start from the securityConfiguration unifi_get_wifi returns and edit it, since a partial object drops the passphrase or presharedKeys it omits. Passphrases are kept if you omit securityConfiguration or echo its "${REDACTED}" values; send a new one to change it. dryRun shows the merged body (secrets redacted).`,
      inputSchema: {
        siteId: resourceId().describe("Site ID"),
        wifiBroadcastId: resourceId().describe("WiFi Broadcast ID"),
        ...wifiFields,
        confirm: confirmSecurity,
        dryRun: z
          .boolean()
          .optional()
          .describe("Preview the merged PUT body without executing it (still reads the current SSID)"),
      },
      outputSchema: writeResult(getWifiOutputSchema),
      annotations: WRITE,
    },
    async ({ siteId, wifiBroadcastId, confirm, dryRun, ...fields }) => {
      try {
        const path = `/sites/${siteId}/wifi/broadcasts/${wifiBroadcastId}`;
        return await withResourceLock(path, async () => {
          const current = asObject(await client.get(path), "the current WiFi broadcast");
          const updates = restoreRedacted(toBodyFields(fields), current) as JsonObject;
          const { allowed } = fieldsForType(updates.type ?? current.type);
          const body = mergeForPut(current, updates, allowed);
          checkBody(body, updates);
          const [before, after] = [securityType(current), securityType(body)];
          const guard = requireConfirmationIf(
            before === after ? undefined : `This changes the SSID's security from ${String(before)} to ${String(after)}`,
            confirm, dryRun
          );
          if (guard) return guard;
          if (dryRun) return formatDryRun("PUT", path, redactSecrets(body));
          const data = await client.put(path, body);
          return formatSuccess(redactSecrets(data), { structured: true });
        });
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.registerTool(
    "unifi_delete_wifi",
    {
      description: "DESTRUCTIVE: Delete a WiFi network — all clients on this SSID will be disconnected",
      inputSchema: {
        siteId: resourceId().describe("Site ID"),
        wifiBroadcastId: resourceId().describe("WiFi Broadcast ID"),
        force: z
          .boolean()
          .optional()
          .default(false)
          .describe("Force delete (default: false)"),
        confirm: z
          .boolean()
          .optional()
          .describe("Must be true to execute this destructive action"),
        dryRun: z
          .boolean()
          .optional()
          .describe("Preview this action without executing it"),
      },
      annotations: DESTRUCTIVE,
    },
    async ({ siteId, wifiBroadcastId, force, confirm, dryRun }) => {
      const guard = dryRun ? null : requireConfirmation(confirm, "This will delete the WiFi network and disconnect all clients on this SSID");
      if (guard) return guard;

      try {
        let path = `/sites/${siteId}/wifi/broadcasts/${wifiBroadcastId}`;
        if (force) {
          path += "?force=true";
        }
        if (dryRun) return formatDryRun("DELETE", path);
        const data = await client.delete(path);
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );
}
