import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { NetworkClient } from "../client.js";
import { formatSuccess, formatError } from "../utils/responses.js";
import { READ_ONLY } from "../utils/safety.js";
import { siteReference } from "../utils/params.js";
import {
  ClassicEnvelope,
  PortForward,
  PortForwardDestination,
  getManagementAccessOutputSchema,
  getRemoteAccessStatusOutputSchema,
  getUpnpStatusOutputSchema,
  listPortForwardsOutputSchema,
} from "../utils/output-schemas.js";

type Row = Record<string, unknown>;

/**
 * Copy only the allowlisted fields of a record. Classic records hold
 * credentials under names no redaction list could anticipate, so the output is
 * built up from the schema's keys and nothing is ever passed through.
 */
function pick(row: Row, fields: readonly string[]): Row {
  return Object.fromEntries(fields.filter((field) => Object.hasOwn(row, field)).map((field) => [field, row[field]]));
}

const isRow = (value: unknown): value is Row => typeof value === "object" && value !== null && !Array.isArray(value);
const flag = (value: unknown) => (typeof value === "boolean" ? value : null);
const text = (value: unknown) => (typeof value === "string" ? value : null);

const FORWARD_FIELDS = Object.keys(PortForward.shape);
const DESTINATION_FIELDS = Object.keys(PortForwardDestination.shape);

/** The site's settings sections by key. Only the caller's picked fields leave this module. */
async function settingSections(client: NetworkClient, site: string): Promise<Map<string, Row>> {
  const { data } = ClassicEnvelope.parse(await client.getClassicSettings(site));
  return new Map(data.flatMap((section) => (typeof section.key === "string" ? [[section.key, section] as const] : [])));
}

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

const SETTINGS = "from the classic controller API (get/setting)";

export function registerExposureTools(server: McpServer, client: NetworkClient) {
  server.registerTool("unifi_list_port_forwards", {
    description: `List the site's port forwards from the classic controller API (rest/portforward), whole and unpaged: each one exposes a LAN host to the internet on the WAN interface pfwd_interface. enabled: false rules forward nothing; enabledCount counts the rest. src is the allowed source ("any" for the whole internet) unless src_limiting_enabled restricts it to src_firewall_group_id. fwd and fwd_port are the LAN target. IDs are the classic controller's _id values. Rows carry only ${FORWARD_FIELDS.join(", ")}.`,
    inputSchema: { siteReference: siteReference() },
    outputSchema: listPortForwardsOutputSchema,
    annotations: READ_ONLY,
  }, async ({ siteReference }) => {
    try {
      const { data: rows } = ClassicEnvelope.parse(await client.getClassic(siteReference, "portforward"));
      const data = rows.map((record) => {
        const row = pick(record, FORWARD_FIELDS);
        if (Array.isArray(row.destination_ips)) {
          row.destination_ips = (row.destination_ips as unknown[]).map((entry) => (isRow(entry) ? pick(entry, DESTINATION_FIELDS) : entry));
        }
        return PortForward.strip().parse(row);
      });
      const enabledCount = data.filter((row) => row.enabled !== false).length;
      return formatSuccess({ data, count: data.length, enabledCount, siteReference }, { structured: true });
    } catch (err) { return formatError(err); }
  });

  server.registerTool("unifi_get_upnp_status", {
    description: `Read whether UPnP and NAT-PMP are on for the site's gateway, ${SETTINGS}: the dedicated upnp section where the controller has one, otherwise the gateway (usg) section's upnp_* fields. With UPnP on, LAN devices open WAN ports themselves, without a port forward. status: unavailable means no UPnP setting was found on this controller version; it does not mean UPnP is off.`,
    inputSchema: { siteReference: siteReference() },
    outputSchema: getUpnpStatusOutputSchema,
    annotations: READ_ONLY,
  }, async ({ siteReference }) => {
    try {
      const sections = await settingSections(client, siteReference);
      for (const source of ["upnp", "usg"] as const) {
        const section = sections.get(source);
        if (!section) continue;
        // The upnp section, where there is one, may drop the upnp_ prefix.
        const field = (name: string) => section[`upnp_${name}`] ?? (source === "upnp" ? section[name] : undefined);
        const enabled = flag(field("enabled"));
        if (enabled === null) continue;
        const natPmp = flag(field("nat_pmp_enabled"));
        const detail = enabled
          ? `UPnP is on: LAN devices can open ports on the WAN without a port forward.${natPmp ? " NAT-PMP is on too." : ""}`
          : "UPnP is off, so NAT-PMP is not served either.";
        return formatSuccess({
          siteReference, status: "available", source,
          upnp_enabled: enabled,
          upnp_nat_pmp_enabled: natPmp,
          upnp_secure_mode: flag(field("secure_mode")),
          upnp_wan_interface: text(field("wan_interface")),
          detail,
        }, { structured: true });
      }
      return formatSuccess({
        siteReference, status: "unavailable", source: null,
        upnp_enabled: null, upnp_nat_pmp_enabled: null, upnp_secure_mode: null, upnp_wan_interface: null,
        detail: "No UPnP setting was found in the site's settings (neither a upnp section nor upnp_enabled in the usg section). This controller version may keep it elsewhere; check the gateway's UPnP setting in the console. This is not a result that UPnP is off.",
      }, { structured: true });
    } catch (err) { return formatError(err); }
  });

  server.registerTool("unifi_get_remote_access_status", {
    description: "Report whether the console's Remote Access (its UniFi cloud connection, which lets unifi.ui.com and the UniFi apps reach it from the internet) is on. Through the Site Manager Cloud Connector a successful read proves it is on: the connector cannot reach the console otherwise. Against a local console the setting belongs to UniFi OS, which this API does not expose, so remoteAccess is unavailable; networkCloudAccessEnabled is then the Network application's own legacy cloud-access flag, when its settings have one, and may not reflect UniFi OS Remote Access. unavailable never means off.",
    inputSchema: { siteReference: siteReference() },
    outputSchema: getRemoteAccessStatusOutputSchema,
    annotations: READ_ONLY,
  }, async ({ siteReference }) => {
    try {
      const connection = client.viaCloudConnector ? "cloud-connector" : "local";
      let networkCloudAccessEnabled: boolean | null = null;
      let settingsError: string | undefined;
      try {
        networkCloudAccessEnabled = flag((await settingSections(client, siteReference)).get("super_cloudaccess")?.enabled);
      } catch (err) {
        settingsError = message(err);
      }
      const result = (remoteAccess: "enabled" | "unavailable", detail: string) =>
        formatSuccess({ siteReference, remoteAccess, connection, networkCloudAccessEnabled, detail }, { structured: true });

      if (connection === "local") {
        return result("unavailable", `This server talks to the console directly, so it cannot see UniFi OS Remote Access; check it in the console's UniFi OS settings, or at unifi.ui.com, where a console that shows as online has it on.${settingsError ? ` The site settings could not be read either: ${settingsError}` : ""}`);
      }
      if (settingsError !== undefined) {
        // The settings read can fail for reasons of its own (the key's access
        // to the classic API); a plain Integration API read settles whether
        // the connector reaches the console at all.
        try {
          await client.get("/info");
        } catch (err) {
          return result("unavailable", `The console could not be reached through the Cloud Connector (${message(err)}). It may be offline or have Remote Access off; this read cannot tell which.`);
        }
      }
      return result("enabled", "Remote Access is on: this server reached the console through the Site Manager Cloud Connector, which only works while the console is connected to the UniFi cloud. UI accounts with access to this console can manage it from the internet.");
    } catch (err) { return formatError(err); }
  });

  server.registerTool("unifi_get_management_access", {
    description: `Read the site's device SSH settings (Device SSH Authentication for adopted UniFi devices) ${SETTINGS} mgmt section: whether SSH is on, whether it accepts passwords, whether it listens on every interface (x_ssh_bind_wildcard), and how many SSH keys are installed. Credentials and keys are never returned. Console (UniFi OS) SSH is a separate UniFi OS setting this API does not expose. Which networks reach the console's web UI and SSH is set by firewall rules and policies, and from the internet by Remote Access and port forwards (unifi_get_remote_access_status, unifi_list_port_forwards). status: unavailable means the controller's settings had no such fields.`,
    inputSchema: { siteReference: siteReference() },
    outputSchema: getManagementAccessOutputSchema,
    annotations: READ_ONLY,
  }, async ({ siteReference }) => {
    try {
      const mgmt = (await settingSections(client, siteReference)).get("mgmt");
      const sshEnabled = flag(mgmt?.x_ssh_enabled);
      if (!mgmt || sshEnabled === null) {
        return formatSuccess({
          siteReference, status: "unavailable",
          x_ssh_enabled: null, x_ssh_auth_password_enabled: null, x_ssh_bind_wildcard: null, sshKeyCount: null,
          detail: "The site's settings have no device SSH setting (mgmt.x_ssh_enabled) on this controller version. This is not a result that SSH is off.",
        }, { structured: true });
      }
      const passwords = flag(mgmt.x_ssh_auth_password_enabled);
      return formatSuccess({
        siteReference, status: "available",
        x_ssh_enabled: sshEnabled,
        x_ssh_auth_password_enabled: passwords,
        x_ssh_bind_wildcard: flag(mgmt.x_ssh_bind_wildcard),
        sshKeyCount: Array.isArray(mgmt.x_ssh_keys) ? mgmt.x_ssh_keys.length : null,
        detail: sshEnabled
          ? `Device SSH is on${passwords === false ? " with key authentication only" : passwords ? ", and accepts passwords" : ""}. It is reachable from wherever the firewall lets traffic to the devices through.`
          : "Device SSH is off.",
      }, { structured: true });
    } catch (err) { return formatError(err); }
  });
}
