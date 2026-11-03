import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { NetworkClient, type ClassicCollection } from "../client.js";
import { formatSuccess, formatError } from "../utils/responses.js";
import { READ_ONLY } from "../utils/safety.js";
import { siteReference } from "../utils/params.js";
import { pick } from "../utils/pick.js";
import {
  ClassicEnvelope,
  ClassicFirewallGroup,
  ClassicNetwork,
  LegacyFirewallRule,
  listClassicNetworksOutputSchema,
  listFirewallGroupsOutputSchema,
  listLegacyFirewallRulesOutputSchema,
} from "../utils/output-schemas.js";

const CLASSIC_IDS = "IDs are the classic controller's _id values, which differ from Integration API IDs: do not pass one to an Integration API tool, or the reverse.";

type Row = Record<string, unknown>;

const ruleset = (rule: Row) => (typeof rule.ruleset === "string" ? rule.ruleset : "");

// A number or a numeric string, depending on the controller version.
function ruleIndex(rule: Row): number {
  const index = Number.parseFloat(String(rule.rule_index));
  return Number.isNaN(index) ? Number.MAX_SAFE_INTEGER : index;
}

/** The order legacy rules are evaluated in; a rule with no usable index goes last in its ruleset. */
function byEvaluationOrder(a: Row, b: Row): number {
  return ruleset(a).localeCompare(ruleset(b)) || ruleIndex(a) - ruleIndex(b);
}

export function registerClassicTools(server: McpServer, client: NetworkClient) {
  const list = (collection: ClassicCollection, row: z.ZodObject, order?: (a: Row, b: Row) => number) => {
    const fields = Object.keys(row.shape);
    return async ({ siteReference }: { siteReference: string }) => {
      try {
        const { data: rows } = ClassicEnvelope.parse(await client.getClassic(siteReference, collection));
        const data = rows.map((record) => row.strip().parse(pick(record, fields)));
        if (order) data.sort(order);
        return formatSuccess({ data, count: data.length, siteReference }, { structured: true });
      } catch (err) { return formatError(err); }
    };
  };

  server.registerTool("unifi_list_classic_networks", {
    description: `List the site's networks from the classic controller API (rest/networkconf), whole and unpaged. Use it to resolve the classic network IDs legacy firewall rules reference; for everything else prefer unifi_list_networks. ${CLASSIC_IDS} Rows carry only the fields in the output schema; credentials are never returned.`,
    inputSchema: { siteReference: siteReference() },
    outputSchema: listClassicNetworksOutputSchema,
    annotations: READ_ONLY,
  }, list("networkconf", ClassicNetwork));

  server.registerTool("unifi_list_firewall_groups", {
    description: `List the site's firewall groups (address, IPv6 address and port groups) from the classic controller API (rest/firewallgroup), whole and unpaged. Legacy firewall rules reference these by ID. ${CLASSIC_IDS}`,
    inputSchema: { siteReference: siteReference() },
    outputSchema: listFirewallGroupsOutputSchema,
    annotations: READ_ONLY,
  }, list("firewallgroup", ClassicFirewallGroup));

  server.registerTool("unifi_list_legacy_firewall_rules", {
    description: `List the site's legacy firewall rules (WAN_IN, LAN_IN, GUEST_LOCAL and the other rulesets) from the classic controller API (rest/firewallrule), whole and unpaged. On a site that uses the zone-based firewall these rules may not be enforced; its rules are the policies unifi_list_firewall_policies returns. ${CLASSIC_IDS} Rules reference networks by unifi_list_classic_networks IDs and groups by unifi_list_firewall_groups IDs. Sorted by ruleset, then rule_index, the order they are evaluated in.`,
    inputSchema: { siteReference: siteReference() },
    outputSchema: listLegacyFirewallRulesOutputSchema,
    annotations: READ_ONLY,
  }, list("firewallrule", LegacyFirewallRule, byEvaluationOrder));
}
