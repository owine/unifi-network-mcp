/**
 * Output schemas for high-value read tools (loose strategy: every non-key
 * field optional, every nested object uses .passthrough() to allow
 * firmware/hardware-specific fields to flow through unchanged).
 *
 * Verified against UniFi Network API 10.5.43. Where the docs collapse
 * nested arrays/objects (e.g. interfaces.ports[], radios[]), the schema
 * uses passthrough records so the contract doesn't lock to fields we
 * haven't verified.
 */
import { z } from "zod";

const Metadata = z
  .object({ origin: z.string().optional() })
  .passthrough();

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
  .passthrough();

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
      .passthrough()
      .optional(),
  })
  .passthrough();

const DeviceRadio = z
  .object({
    wlanStandard: z.string().optional(),
    frequencyGHz: z.number().optional(),
    channelWidthMHz: z.number().optional(),
    channel: z.number().optional(),
  })
  .passthrough();

const DeviceDetail = z
  .object({
    ...DeviceCommon,
    adoptedAt: z.string().optional(),
    provisionedAt: z.string().optional(),
    configurationId: z.string().optional(),
    uplink: z
      .object({ deviceId: z.string().optional() })
      .passthrough()
      .optional(),
    // Detail view: object keyed by capability (switching/accessPoint).
    features: z.record(z.string(), z.unknown()).optional(),
    interfaces: z
      .object({
        ports: z.array(DevicePort).optional(),
        radios: z.array(DeviceRadio).optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

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
      .passthrough()
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
              .passthrough()
          )
          .optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

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
      .passthrough()
      .optional(),
  })
  .passthrough();

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
  .passthrough();

const ApplicationInfo = z
  .object({
    // Live-verified (10.5.43): only applicationVersion is returned.
    applicationVersion: z.string().optional(),
  })
  .passthrough();

const Site = z
  .object({
    id: z.string(),
    internalReference: z.string().optional(),
    name: z.string().optional(),
  })
  .passthrough();

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
    // get-by-id only (absent in list view); nested shape left loose.
    ipv4Configuration: z.unknown().optional(),
    metadata: Metadata.optional(),
  })
  .passthrough();

const NetworkReferences = z
  .object({
    referenceResources: z.array(z.unknown()).optional(),
  })
  .passthrough();

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
  .passthrough();

const FirewallZone = z
  .object({
    id: z.string(),
    name: z.string().optional(),
    networkIds: z.array(z.string()).optional(),
    metadata: Metadata.optional(),
  })
  .passthrough();

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
    index: z.number().optional(),
    description: z.string().optional(),
    metadata: Metadata.optional(),
  })
  .passthrough();

const FirewallPolicyOrdering = z
  .object({
    orderedFirewallPolicyIds: z
      .object({
        beforeSystemDefined: z.array(z.string()).optional(),
        afterSystemDefined: z.array(z.string()).optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

const AclRule = z
  .object({
    id: z.string(),
    type: z.string().optional(),
    name: z.string().optional(),
    enabled: z.boolean().optional(),
    action: z.string().optional(),
    description: z.string().optional(),
    protocolFilter: z.array(z.string()).optional(),
    sourceFilter: z.unknown().optional(),
    destinationFilter: z.unknown().optional(),
    metadata: Metadata.optional(),
  })
  .passthrough();

const AclRuleOrdering = z
  .object({
    orderedAclRuleIds: z.array(z.string()).optional(),
  })
  .passthrough();

const SwitchStack = z
  .object({
    id: z.string(),
    name: z.string().optional(),
    members: z.array(z.unknown()).optional(),
    lags: z.array(z.unknown()).optional(),
    metadata: Metadata.optional(),
  })
  .passthrough();

const McLagDomain = z
  .object({
    id: z.string(),
    name: z.string().optional(),
    peers: z.array(z.unknown()).optional(),
    lags: z.array(z.unknown()).optional(),
    metadata: Metadata.optional(),
  })
  .passthrough();

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
          .passthrough()
      )
      .optional(),
    metadata: Metadata.optional(),
  })
  .passthrough();

const DnsPolicy = z
  .object({
    id: z.string(),
    type: z.string().optional(),
    enabled: z.boolean().optional(),
    domain: z.string().optional(),
    ipv4Address: z.string().optional(),
    ttlSeconds: z.number().optional(),
    metadata: Metadata.optional(),
  })
  .passthrough();

const TrafficMatchingList = z
  .object({
    id: z.string(),
    type: z.string().optional(),
    name: z.string().optional(),
    items: z.array(z.unknown()).optional(),
    metadata: Metadata.optional(),
  })
  .passthrough();

// Verified against the live Integration API (10.5.43). The WAN and
// site-to-site-tunnel list rows are intentionally minimal in the API.
const Wan = z
  .object({
    id: z.string(),
    name: z.string().optional(),
  })
  .passthrough();

const VpnServer = z
  .object({
    id: z.string(),
    type: z.string().optional(),
    name: z.string().optional(),
    enabled: z.boolean().optional(),
    metadata: Metadata.optional(),
  })
  .passthrough();

// No tunnels present in the verification environment — keep loose.
const VpnTunnel = z
  .object({
    id: z.string(),
    name: z.string().optional(),
  })
  .passthrough();

const RadiusProfile = z
  .object({
    id: z.string(),
    name: z.string().optional(),
    metadata: Metadata.optional(),
  })
  .passthrough();

// No tags present in the verification environment — documented shape.
const DeviceTag = z
  .object({
    id: z.string(),
    name: z.string().optional(),
    deviceIds: z.array(z.string()).optional(),
  })
  .passthrough();

// DPI category/application ids are NUMERIC (verified live).
const DpiCategory = z
  .object({
    id: z.number(),
    name: z.string().optional(),
  })
  .passthrough();

const DpiApplication = z
  .object({
    id: z.number(),
    name: z.string().optional(),
  })
  .passthrough();

// Countries key on `code` (ISO alpha-2), NOT `id` (verified live).
const Country = z
  .object({
    code: z.string(),
    name: z.string().optional(),
  })
  .passthrough();

// No pending devices in the verification environment — keep loose.
const PendingDevice = z
  .object({
    macAddress: z.string().optional(),
    model: z.string().optional(),
    ipAddress: z.string().optional(),
    firmwareVersion: z.string().optional(),
  })
  .passthrough();

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
