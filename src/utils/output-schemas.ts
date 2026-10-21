/**
 * Output schemas for every read tool, and for write tools whose response
 * echoes the resource (loose strategy: every non-key
 * field optional, every nested object uses .loose() to allow
 * firmware/hardware-specific fields to flow through unchanged).
 *
 * Verified against UniFi Network API 11.0.83. Where the docs collapse
 * nested arrays/objects (e.g. interfaces.ports[], radios[]), the schema
 * uses loose records so the contract doesn't lock to fields we
 * haven't verified. Tools register these raw shapes, and registerAllTools()
 * publishes each as a loose object (src/tools/index.ts), so fields a schema
 * does not list never fail client-side validation.
 */
import { z } from "zod";

// configurable is live-verified (11.0.83) on system-defined zones, policies,
// networks and RADIUS profiles; it is absent on user-defined resources.
const Metadata = z
  .object({ origin: z.string().optional(), configurable: z.boolean().optional() })
  .loose();

const PaginationFields = {
  offset: z.number().int().optional(),
  limit: z.number().int().optional(),
  count: z.number().int().optional(),
  totalCount: z.number().int().optional(),
} as const;

// Shared device identity fields. NOTE: the list endpoint returns
// `features` and `interfaces` as string arrays (capability tags, e.g.
// ["switching"], ["ports"]); the get-by-id endpoint expands them into
// objects. Hence two distinct schemas below.
const DeviceCommon = {
  id: z.string(),
  name: z.string().optional(),
  model: z.string().optional(),
  macAddress: z.string().optional(),
  ipAddress: z.string().optional(),
  state: z.string().optional(),
  supported: z.boolean().optional(),
  firmwareVersion: z.string().optional(),
  firmwareUpdatable: z.boolean().optional(),
} as const;

const DeviceListItem = z
  .object({
    ...DeviceCommon,
    adoptedAt: z.string().optional(),
    features: z.array(z.string()).optional(),
    interfaces: z.array(z.string()).optional(),
  })
  .loose();

const DevicePort = z
  .object({
    idx: z.number(),
    name: z.string().optional(),
    state: z.string().optional(),
    connector: z.string().optional(),
    maxSpeedMbps: z.number().optional(),
    speedMbps: z.number().optional(),
    poe: z
      .object({
        standard: z.string().optional(),
        type: z.number().optional(),
        enabled: z.boolean().optional(),
        state: z.string().optional(),
      })
      .loose()
      .optional(),
  })
  .loose();

const DeviceRadio = z
  .object({
    wlanStandard: z.string().optional(),
    frequencyGHz: z.number().optional(),
    channelWidthMHz: z.number().optional(),
    channel: z.number().optional(),
  })
  .loose();

const DeviceDetail = z
  .object({
    ...DeviceCommon,
    adoptedAt: z.string().optional(),
    provisionedAt: z.string().optional(),
    configurationId: z.string().optional(),
    uplink: z
      .object({ deviceId: z.string().optional() })
      .loose()
      .optional(),
    // Detail view: object keyed by capability (switching/accessPoint).
    features: z.record(z.string(), z.unknown()).optional(),
    interfaces: z
      .object({
        ports: z.array(DevicePort).optional(),
        radios: z.array(DeviceRadio).optional(),
      })
      .loose()
      .optional(),
  })
  .loose();

const DeviceStatistics = z
  .object({
    uptimeSec: z.number().optional(),
    lastHeartbeatAt: z.string().optional(),
    nextHeartbeatAt: z.string().optional(),
    loadAverage1Min: z.number().optional(),
    loadAverage5Min: z.number().optional(),
    loadAverage15Min: z.number().optional(),
    cpuUtilizationPct: z.number().optional(),
    memoryUtilizationPct: z.number().optional(),
    uplink: z
      .object({
        txRateBps: z.number().optional(),
        rxRateBps: z.number().optional(),
      })
      .loose()
      .optional(),
    interfaces: z
      .object({
        radios: z
          .array(
            z
              .object({
                frequencyGHz: z.number().optional(),
                txRetriesPct: z.number().optional(),
              })
              .loose()
          )
          .optional(),
      })
      .loose()
      .optional(),
  })
  .loose();

const Client = z
  .object({
    id: z.string(),
    type: z.string().optional(),
    name: z.string().optional(),
    macAddress: z.string().optional(),
    ipAddress: z.string().optional(),
    connectedAt: z.string().optional(),
    uplinkDeviceId: z.string().optional(),
    access: z
      .object({ type: z.string().optional() })
      .loose()
      .optional(),
  })
  .loose();

const WifiBroadcast = z
  .object({
    id: z.string(),
    name: z.string().optional(),
    enabled: z.boolean().optional(),
    type: z.string().optional(),
    // Nested shapes not live-verified — z.unknown() avoids over-asserting
    // object-vs-array (the SDK enforces outputSchema and a wrong type
    // makes the tool hard-fail, not just mislead).
    broadcastingFrequenciesGHz: z.array(z.unknown()).optional(),
    securityConfiguration: z.unknown().optional(),
    hideName: z.boolean().optional(),
    bandSteeringEnabled: z.boolean().optional(),
    mloEnabled: z.boolean().optional(),
    network: z.unknown().optional(),
    broadcastingDeviceFilter: z.unknown().optional(),
    metadata: Metadata.optional(),
  })
  .loose();

const ApplicationInfo = z
  .object({
    // Live-verified (11.0.83): only applicationVersion is returned.
    applicationVersion: z.string().optional(),
  })
  .loose();

const Site = z
  .object({
    id: z.string(),
    internalReference: z.string().optional(),
    name: z.string().optional(),
  })
  .loose();

const Network = z
  .object({
    id: z.string(),
    name: z.string().optional(),
    management: z.string().optional(),
    enabled: z.boolean().optional(),
    vlanId: z.number().int().optional(),
    default: z.boolean().optional(),
    zoneId: z.string().optional(),
    isolationEnabled: z.boolean().optional(),
    internetAccessEnabled: z.boolean().optional(),
    mdnsForwardingEnabled: z.boolean().optional(),
    cellularBackupEnabled: z.boolean().optional(),
    dhcpGuarding: z.unknown().optional(),
    // get-by-id only (absent in list view); nested shapes left loose.
    ipv4Configuration: z.unknown().optional(),
    ipv6Configuration: z.unknown().optional(),
    metadata: Metadata.optional(),
  })
  .loose();

const NetworkReferences = z
  .object({
    referenceResources: z.array(z.unknown()).optional(),
  })
  .loose();

const Voucher = z
  .object({
    id: z.string(),
    code: z.string().optional(),
    name: z.string().optional(),
    createdAt: z.string().optional(),
    activatedAt: z.string().optional(),
    expiresAt: z.string().optional(),
    timeLimitMinutes: z.number().optional(),
    dataUsageLimitMBytes: z.number().optional(),
    rxRateLimitKbps: z.number().optional(),
    txRateLimitKbps: z.number().optional(),
    authorizedGuestLimit: z.number().optional(),
    authorizedGuestCount: z.number().optional(),
    expired: z.boolean().optional(),
  })
  .loose();

const FirewallZone = z
  .object({
    id: z.string(),
    name: z.string().optional(),
    networkIds: z.array(z.string()).optional(),
    metadata: Metadata.optional(),
  })
  .loose();

const FirewallPolicy = z
  .object({
    id: z.string(),
    name: z.string().optional(),
    enabled: z.boolean().optional(),
    // connectionStateFilter is live-verified to be an ARRAY, not an
    // object — the rest are not live-verified, so leave all loose.
    action: z.unknown().optional(),
    source: z.unknown().optional(),
    destination: z.unknown().optional(),
    ipProtocolScope: z.unknown().optional(),
    connectionStateFilter: z.unknown().optional(),
    ipsecFilter: z.unknown().optional(),
    schedule: z.unknown().optional(),
    loggingEnabled: z.boolean().optional(),
    // New in 11.0.83; live-verified as a boolean on every policy.
    reportFlowEnabled: z.boolean().optional(),
    index: z.number().optional(),
    description: z.string().optional(),
    metadata: Metadata.optional(),
  })
  .loose();

const FirewallPolicyOrdering = z
  .object({
    orderedFirewallPolicyIds: z
      .object({
        beforeSystemDefined: z.array(z.string()).optional(),
        afterSystemDefined: z.array(z.string()).optional(),
      })
      .loose()
      .optional(),
  })
  .loose();

const AclRule = z
  .object({
    id: z.string(),
    type: z.string().optional(),
    name: z.string().optional(),
    enabled: z.boolean().optional(),
    action: z.string().optional(),
    // The docs give null a meaning ("When null, the rule will be applied to
    // all protocols") and ACL samples already carry explicit nulls, so both
    // must accept null or a protocol-agnostic rule hard-fails with -32602.
    description: z.string().nullable().optional(),
    protocolFilter: z.array(z.string()).nullable().optional(),
    sourceFilter: z.unknown().optional(),
    destinationFilter: z.unknown().optional(),
    enforcingDeviceFilter: z.unknown().optional(),
    // Read-only in the response. Deprecated as a *request* field — ordering
    // is set via the dedicated reorder endpoint, so no write tool accepts it.
    index: z.number().int().optional(),
    metadata: Metadata.optional(),
  })
  .loose();

const AclRuleOrdering = z
  .object({
    orderedAclRuleIds: z.array(z.string()).optional(),
  })
  .loose();

const SwitchStack = z
  .object({
    id: z.string(),
    name: z.string().optional(),
    // The stack's primary device. Added in 10.6.106.
    deviceId: z.string().optional(),
    // Renamed from `members` in 10.6.106 (was `members` through 10.4.57).
    // `members` stays declared so responses from older consoles still
    // describe themselves; both are optional, so either shape validates.
    units: z.array(z.unknown()).optional(),
    members: z.array(z.unknown()).optional(),
    lags: z.array(z.unknown()).optional(),
    metadata: Metadata.optional(),
  })
  .loose();

const McLagDomain = z
  .object({
    id: z.string(),
    name: z.string().optional(),
    peers: z.array(z.unknown()).optional(),
    lags: z.array(z.unknown()).optional(),
    metadata: Metadata.optional(),
  })
  .loose();

const Lag = z
  .object({
    id: z.string(),
    type: z.string().optional(),
    members: z
      .array(
        z
          .object({
            deviceId: z.string().optional(),
            portIdxs: z.array(z.number()).optional(),
          })
          .loose()
      )
      .optional(),
    metadata: Metadata.optional(),
  })
  .loose();

const DnsPolicy = z
  .object({
    id: z.string(),
    type: z.string().optional(),
    enabled: z.boolean().optional(),
    domain: z.string().optional(),
    ipv4Address: z.string().optional(),
    ttlSeconds: z.number().optional(),
    // Type-specific fields from the 11.0.83 response samples (no live DNS
    // policies to sample), so nullable to be safe.
    ipv6Address: z.string().nullable().optional(),
    targetDomain: z.string().nullable().optional(),
    mailServerDomain: z.string().nullable().optional(),
    text: z.string().nullable().optional(),
    serverDomain: z.string().nullable().optional(),
    service: z.string().nullable().optional(),
    protocol: z.string().nullable().optional(),
    port: z.number().nullable().optional(),
    priority: z.number().nullable().optional(),
    weight: z.number().nullable().optional(),
    ipAddress: z.string().nullable().optional(),
    metadata: Metadata.optional(),
  })
  .loose();

const TrafficMatchingList = z
  .object({
    id: z.string(),
    type: z.string().optional(),
    name: z.string().optional(),
    items: z.array(z.unknown()).optional(),
    metadata: Metadata.optional(),
  })
  .loose();

// Verified against the live Integration API (11.0.83). The WAN and
// site-to-site-tunnel list rows are intentionally minimal in the API.
const Wan = z
  .object({
    id: z.string(),
    name: z.string().optional(),
  })
  .loose();

const VpnServer = z
  .object({
    id: z.string(),
    type: z.string().optional(),
    name: z.string().optional(),
    enabled: z.boolean().optional(),
    metadata: Metadata.optional(),
  })
  .loose();

// No tunnels present in the verification environment — keep loose.
const VpnTunnel = z
  .object({
    id: z.string(),
    name: z.string().optional(),
  })
  .loose();

const RadiusProfile = z
  .object({
    id: z.string(),
    name: z.string().optional(),
    metadata: Metadata.optional(),
  })
  .loose();

// No tags present in the verification environment — documented shape.
const DeviceTag = z
  .object({
    id: z.string(),
    name: z.string().optional(),
    deviceIds: z.array(z.string()).optional(),
  })
  .loose();

// DPI category/application ids are NUMERIC (verified live).
const DpiCategory = z
  .object({
    id: z.number(),
    name: z.string().optional(),
  })
  .loose();

const DpiApplication = z
  .object({
    id: z.number(),
    name: z.string().optional(),
  })
  .loose();

// Countries key on `code` (ISO alpha-2), NOT `id` (verified live).
const Country = z
  .object({
    code: z.string(),
    name: z.string().optional(),
  })
  .loose();

// No pending devices in the verification environment — keep loose.
const PendingDevice = z
  .object({
    macAddress: z.string().optional(),
    model: z.string().optional(),
    ipAddress: z.string().optional(),
    firmwareVersion: z.string().optional(),
  })
  .loose();

// A write tool returns either the API's echo of the resource or, with dryRun,
// a preview of the request it would send. The SDK validates both against the
// one outputSchema, so the resource's key fields relax to optional alongside
// the preview fields; read tools keep their stricter schemas.
const DryRunPreview = {
  dryRun: z.literal(true).optional(),
  wouldExecute: z
    .object({ method: z.string(), path: z.string(), body: z.unknown().optional() })
    .loose()
    .optional(),
  confirmationRequired: z.string().optional(),
} as const;

/**
 * The outputSchema to publish for a tool: always a loose object, whether the
 * tool passed a raw shape or a Zod object (the SDK accepts both). Wrapping a
 * Zod object in z.looseObject() would build a broken schema that makes
 * tools/list throw for every tool.
 */
export function looseOutput(schema: z.ZodRawShape | z.ZodObject): z.ZodObject {
  return schema instanceof z.ZodObject ? schema.loose() : z.looseObject(schema);
}

export function writeResult<T extends z.ZodRawShape>(shape: T) {
  return { ...z.object(shape).partial().shape, ...DryRunPreview };
}

export const getInfoOutputSchema = ApplicationInfo.shape;

export const listSitesOutputSchema = {
  ...PaginationFields,
  data: z.array(Site),
} as const;

export const networkOutputSchema = Network.shape;

export const listNetworksOutputSchema = {
  ...PaginationFields,
  data: z.array(Network),
} as const;

export const getNetworkReferencesOutputSchema = NetworkReferences.shape;

export const voucherOutputSchema = Voucher.shape;

export const listVouchersOutputSchema = {
  ...PaginationFields,
  data: z.array(Voucher),
} as const;

// NOTE: the Generate Vouchers endpoint does NOT return the standard
// paginated envelope. Live-verified (10.5.43): it returns
// `{ "vouchers": [ ...Voucher ] }` with no offset/limit/count/totalCount.
// An over-tight schema here (e.g. requiring `data`) hard-fails every call.
export const createVouchersOutputSchema = {
  vouchers: z.array(Voucher),
} as const;

export const firewallZoneOutputSchema = FirewallZone.shape;

export const listFirewallZonesOutputSchema = {
  ...PaginationFields,
  data: z.array(FirewallZone),
} as const;

export const firewallPolicyOutputSchema = FirewallPolicy.shape;

export const listFirewallPoliciesOutputSchema = {
  ...PaginationFields,
  data: z.array(FirewallPolicy),
} as const;

export const firewallPolicyOrderingOutputSchema = FirewallPolicyOrdering.shape;

export const aclRuleOutputSchema = AclRule.shape;

export const listAclRulesOutputSchema = {
  ...PaginationFields,
  data: z.array(AclRule),
} as const;

export const aclRuleOrderingOutputSchema = AclRuleOrdering.shape;

export const switchStackOutputSchema = SwitchStack.shape;

export const listSwitchStacksOutputSchema = {
  ...PaginationFields,
  data: z.array(SwitchStack),
} as const;

export const mcLagDomainOutputSchema = McLagDomain.shape;

export const listMcLagDomainsOutputSchema = {
  ...PaginationFields,
  data: z.array(McLagDomain),
} as const;

export const lagOutputSchema = Lag.shape;

export const listLagsOutputSchema = {
  ...PaginationFields,
  data: z.array(Lag),
} as const;

export const dnsPolicyOutputSchema = DnsPolicy.shape;

export const listDnsPoliciesOutputSchema = {
  ...PaginationFields,
  data: z.array(DnsPolicy),
} as const;

export const trafficMatchingListOutputSchema = TrafficMatchingList.shape;

export const listTrafficMatchingListsOutputSchema = {
  ...PaginationFields,
  data: z.array(TrafficMatchingList),
} as const;

export const listDevicesOutputSchema = {
  ...PaginationFields,
  data: z.array(DeviceListItem),
} as const;

export const getDeviceOutputSchema = DeviceDetail.shape;

export const getDeviceStatisticsOutputSchema = DeviceStatistics.shape;

export const listClientsOutputSchema = {
  ...PaginationFields,
  data: z.array(Client),
} as const;

export const getClientOutputSchema = Client.shape;

export const listWifiOutputSchema = {
  ...PaginationFields,
  data: z.array(WifiBroadcast),
} as const;

export const getWifiOutputSchema = WifiBroadcast.shape;

export const listWansOutputSchema = {
  ...PaginationFields,
  data: z.array(Wan),
} as const;

export const listVpnServersOutputSchema = {
  ...PaginationFields,
  data: z.array(VpnServer),
} as const;

export const listVpnTunnelsOutputSchema = {
  ...PaginationFields,
  data: z.array(VpnTunnel),
} as const;

export const listRadiusProfilesOutputSchema = {
  ...PaginationFields,
  data: z.array(RadiusProfile),
} as const;

export const listDeviceTagsOutputSchema = {
  ...PaginationFields,
  data: z.array(DeviceTag),
} as const;

export const listDpiCategoriesOutputSchema = {
  ...PaginationFields,
  data: z.array(DpiCategory),
} as const;

export const listDpiApplicationsOutputSchema = {
  ...PaginationFields,
  data: z.array(DpiApplication),
} as const;

export const listCountriesOutputSchema = {
  ...PaginationFields,
  data: z.array(Country),
} as const;

export const listPendingDevicesOutputSchema = {
  ...PaginationFields,
  data: z.array(PendingDevice),
} as const;

// Controller history endpoints (v2 clients/history and stat/session) are not
// part of the Integration API, so these follow the same loose strategy against
// the controller's own response shape: only the identity fields are required.
export const HistoryClient = z
  .object({
    mac: z.string(),
    hostname: z.string().nullish(),
    display_name: z.string().nullish(),
    first_seen: z.number().optional(),
    last_seen: z.number().optional(),
    is_wired: z.boolean().optional(),
    status: z.string().optional(),
  })
  .loose();

export const ClientSession = z
  .object({
    _id: z.string(),
    mac: z.string(),
    assoc_time: z.number(),
    duration: z.number().optional(),
    rx_bytes: z.number().optional(),
    tx_bytes: z.number().optional(),
    hostname: z.string().nullish(),
    is_wired: z.boolean().optional(),
    roaming_sessions: z.array(z.unknown()).optional(),
  })
  .loose();

/** Envelope returned by the controller's stat/session endpoint. */
export const ClientSessionEnvelope = z.object({
  meta: z.object({ rc: z.literal("ok") }).loose(),
  data: z.array(ClientSession),
});

export const listClientHistoryOutputSchema = {
  data: z.array(HistoryClient),
  count: z.number(),
  totalCount: z.number(),
  limit: z.number(),
  truncated: z.boolean(),
  withinHours: z.number(),
  coverage: z.string(),
} as const;

export const listClientSessionsOutputSchema = {
  data: z.array(ClientSession),
  count: z.number(),
  limit: z.number(),
  mayBeTruncated: z.boolean(),
  start: z.number(),
  end: z.number(),
  coverage: z.string(),
} as const;

// Classic controller REST collections (rest/networkconf, rest/firewallgroup,
// rest/firewallrule). Unlike every other schema here, each shape is also the
// tool's output allowlist: the tools copy only these fields from a record, so
// a field the controller adds never reaches the model. networkconf records
// carry WAN, VPN and RADIUS credentials (x_passphrase, x_wan_password,
// x_ipsec_*, x_openvpn_*, WireGuard keys, PPPoE logins); never list one here.
// Field types vary across controller versions, hence the unions.
const classicScalar = z.union([z.string(), z.number()]).nullish();
const classicString = z.string().nullish();
const classicBoolean = z.boolean().nullish();

export const ClassicNetwork = z
  .object({
    _id: z.string(),
    name: classicString,
    purpose: classicString,
    vlan: classicScalar,
    vlan_enabled: classicBoolean,
    ip_subnet: classicString,
    networkgroup: classicString,
    enabled: classicBoolean,
    dhcpd_enabled: classicBoolean,
    dhcpd_start: classicString,
    dhcpd_stop: classicString,
    domain_name: classicString,
    igmp_snooping: classicBoolean,
    mdns_enabled: classicBoolean,
    network_isolation_enabled: classicBoolean,
    internet_access_enabled: classicBoolean,
    firewall_zone_id: classicString,
    is_nat: classicBoolean,
    ipv6_interface_type: classicString,
    setting_preference: classicString,
  })
  .loose();

export const ClassicFirewallGroup = z
  .object({
    _id: z.string(),
    name: classicString,
    group_type: classicString,
    group_members: z.array(z.string()).nullish(),
  })
  .loose();

export const LegacyFirewallRule = z
  .object({
    _id: z.string(),
    name: classicString,
    enabled: classicBoolean,
    ruleset: classicString,
    rule_index: classicScalar,
    action: classicString,
    protocol: classicString,
    protocol_v6: classicString,
    protocol_match_excepted: classicBoolean,
    icmp_typename: classicString,
    icmpv6_typename: classicString,
    logging: classicBoolean,
    state_established: classicBoolean,
    state_related: classicBoolean,
    state_new: classicBoolean,
    state_invalid: classicBoolean,
    src_firewallgroup_ids: z.array(z.string()).nullish(),
    src_networkconf_id: classicString,
    src_networkconf_type: classicString,
    src_address: classicString,
    src_address_ipv6: classicString,
    src_mac_address: classicString,
    src_port: classicScalar,
    dst_firewallgroup_ids: z.array(z.string()).nullish(),
    dst_networkconf_id: classicString,
    dst_networkconf_type: classicString,
    dst_address: classicString,
    dst_address_ipv6: classicString,
    dst_port: classicScalar,
    ipsec: classicString,
    setting_preference: classicString,
  })
  .loose();

/** Envelope of a classic REST collection; rows stay unknown until the allowlist is applied. */
export const ClassicEnvelope = z.object({
  meta: z.object({ rc: z.literal("ok") }).loose(),
  data: z.array(z.record(z.string(), z.unknown())),
});

const classicList = <T extends z.ZodType>(row: T) => ({
  data: z.array(row),
  count: z.number(),
  siteReference: z.string(),
}) as const;

export const listClassicNetworksOutputSchema = classicList(ClassicNetwork);
export const listFirewallGroupsOutputSchema = classicList(ClassicFirewallGroup);
export const listLegacyFirewallRulesOutputSchema = classicList(LegacyFirewallRule);
