import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { NetworkClient } from "../client.js";
import { formatSuccess, formatError } from "../utils/responses.js";
import { READ_ONLY } from "../utils/safety.js";
import { siteReference } from "../utils/params.js";
import { pick } from "../utils/pick.js";
import {
  ClassicEnvelope,
  PortForward,
  PortForwardDestination,
  getDeviceSshSettingsOutputSchema,
  getUpnpStatusOutputSchema,
  listPortForwardsOutputSchema,
} from "../utils/output-schemas.js";

type Row = Record<string, unknown>;

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

const SETTINGS = "from the classic controller API (get/setting)";

export function registerExposureTools(server: McpServer, client: NetworkClient) {
  server.registerTool("unifi_list_port_forwards", {
    description: `List the site's port forwards from the classic controller API (rest/portforward), whole and unpaged: each one exposes a LAN host to the internet on the WAN interface pfwd_interface. enabled: false rules forward nothing; enabledCount counts the rest. src is the allowed source ("any" for the whole internet) unless src_limiting_enabled restricts it to src_firewall_group_id. fwd and fwd_port are the LAN target. IDs are the classic controller's _id values.`,
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
    description: `Read whether UPnP and NAT-PMP are on for the site's gateway, ${SETTINGS}: the dedicated upnp section where the controller has one, otherwise the gateway (usg) section's upnp_* fields. With UPnP on, LAN devices open WAN ports themselves, without a port forward. upnp_nat_pmp_enabled is the stored setting, which does nothing while UPnP is off; detail says which applies. status: unavailable means no UPnP setting was found on this controller version; it does not mean UPnP is off.`,
    inputSchema: { siteReference: siteReference() },
    outputSchema: getUpnpStatusOutputSchema,
    annotations: READ_ONLY,
  }, async ({ siteReference }) => {
    try {
      const sections = await settingSections(client, siteReference);
      for (const source of ["upnp", "usg"] as const) {
        const section = sections.get(source);
        if (!section) continue;
        // Network 11.0.94 (zone-based) has no upnp section: its usg section holds
        // the upnp_* fields. A upnp section, where there is one, may drop the prefix.
        const field = (name: string) => section[`upnp_${name}`] ?? (source === "upnp" ? section[name] : undefined);
        const enabled = flag(field("enabled"));
        if (enabled === null) continue;
        const natPmp = flag(field("nat_pmp_enabled"));
        const detail = enabled
          ? `UPnP is on: LAN devices can open ports on the WAN without a port forward.${natPmp ? " NAT-PMP is on too." : ""}`
          : natPmp
            ? "UPnP is off. NAT-PMP is stored as on, but that flag does nothing while UPnP is off; it applies again if UPnP is turned on."
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

  server.registerTool("unifi_get_device_ssh_settings", {
    description: `Read the site's device SSH settings (Device SSH Authentication for adopted UniFi devices) ${SETTINGS} mgmt section: whether SSH is on, whether it accepts passwords, whether it listens on every interface (x_ssh_bind_wildcard), and how many SSH keys are installed. Credentials and keys are never returned. Console (UniFi OS) SSH is a separate UniFi OS setting this API does not expose. Which networks reach the console's web UI and SSH is set by firewall rules and policies, and from the internet by Remote Access and port forwards (unifi_list_port_forwards). status: unavailable means the controller's settings had no such fields.`,
    inputSchema: { siteReference: siteReference() },
    outputSchema: getDeviceSshSettingsOutputSchema,
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
