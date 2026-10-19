import { z } from "zod";
import type { NetworkClient } from "../client.js";
import { noteRefusal } from "../write-log.js";
import { errorMessage } from "./responses.js";

/**
 * Hard refusals for writes that would let traffic in from the WAN. Unlike
 * confirm, which the model can pass after asking (or after being talked into
 * it by data it read), these hold whatever the call says: the operator turns
 * them off with UNIFI_NETWORK_ALLOW_WAN_EXPOSURE=true, and then the existing
 * confirm flow applies.
 *
 * Which zone is the WAN: the Integration API marks zones only with
 * metadata.origin, and names can be changed, so a zone is the WAN when its ID
 * is in UNIFI_NETWORK_WAN_ZONE_IDS, or when it is system-defined and named
 * "External". The ID list is the reliable signal; the name is the fallback
 * for operators who have not set it. When the zones cannot be read, or a
 * zone a change depends on is not among them, the write is refused: a check
 * that cannot run must not pass.
 *
 * ACL rules need no check: they are switch-enforced IPV4/MAC rules between
 * LAN hosts and have no zone, so they cannot admit WAN traffic past the
 * gateway firewall. The Integration API has no port-forward endpoint.
 */

export interface WanPolicy {
  /** UNIFI_NETWORK_ALLOW_WAN_EXPOSURE: skip these refusals. */
  allowExposure: boolean;
  /** UNIFI_NETWORK_WAN_ZONE_IDS, lower-cased. */
  zoneIds: readonly string[];
}

export const DEFAULT_WAN_POLICY: WanPolicy = { allowExposure: false, zoneIds: [] };

const Zone = z.object({
  id: z.string(),
  name: z.string().optional(),
  networkIds: z.array(z.string()).optional(),
  metadata: z.object({ origin: z.string().optional() }).loose().optional(),
}).loose();
type Zone = z.infer<typeof Zone>;

const Policy = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  action: z.unknown().optional(),
  source: z.unknown().optional(),
  destination: z.unknown().optional(),
}).loose();

const PAGE_LIMIT = 200;
const MAX_PAGES = 50;

async function listAll<T extends z.ZodType>(client: NetworkClient, path: string, item: T): Promise<z.infer<T>[]> {
  const page = z.object({ data: z.array(item), totalCount: z.number().optional() }).loose();
  const items: z.infer<T>[] = [];
  for (let pages = 0; pages < MAX_PAGES; pages++) {
    const { data, totalCount } = page.parse(await client.get(`${path}?offset=${items.length}&limit=${PAGE_LIMIT}`));
    items.push(...data);
    // Without a totalCount, only an empty page shows the list has ended: a
    // controller may cap pages below PAGE_LIMIT, so a short page proves nothing.
    if (data.length === 0 || (totalCount !== undefined && items.length >= totalCount)) return items;
  }
  // A list that does not end cannot be checked, which must not pass.
  throw new Error(`the list did not end after ${MAX_PAGES} pages`);
}

class Refusal extends Error {}

/** The checks for one site; zones and policies are read at most once per call. */
export class WanExposure {
  private zones?: Promise<Zone[]>;
  private policies?: Promise<z.infer<typeof Policy>[]>;

  constructor(
    private readonly client: NetworkClient,
    private readonly wan: WanPolicy,
    private readonly siteId: string
  ) {}

  /** A firewall policy, as it would be after the write: refused if it ALLOWs traffic from the WAN. */
  async firewallPolicy(policy: Record<string, unknown>): Promise<string | undefined> {
    if (this.wan.allowExposure || !allowsTraffic(policy)) return undefined;
    return this.refusal(async () => {
      const zoneId = sourceZoneId(policy);
      if (zoneId === undefined) {
        throw new Refusal("the policy ALLOWs traffic but has no source.zoneId, so its source cannot be checked against the WAN zone");
      }
      const zone = await this.zone(zoneId, "its source zone");
      if (this.isWan(zone)) throw new Refusal(`the policy would ALLOW traffic from the ${label(zone)} zone, which is the WAN`);
    });
  }

  /** A zone create (zoneId undefined) or full update: refused if it changes the WAN zone or takes networks from it. */
  async firewallZone(zoneId: string | undefined, networkIds: readonly string[]): Promise<string | undefined> {
    if (this.wan.allowExposure || (zoneId === undefined && networkIds.length === 0)) return undefined;
    return this.refusal(async () => {
      if (zoneId !== undefined) {
        const zone = await this.zone(zoneId, "the zone");
        if (this.isWan(zone)) throw new Refusal(`the change would modify the ${label(zone)} zone, which is the WAN`);
      }
      const wanNetworks = new Set((await this.zoneList()).filter((zone) => this.isWan(zone))
        .flatMap((zone) => zone.networkIds ?? []).map((id) => id.toLowerCase()));
      const moved = networkIds.filter((id) => wanNetworks.has(id.toLowerCase()));
      if (moved.length > 0) throw new Refusal(`the change would move networks out of the WAN zone: ${moved.join(", ")}`);
      // A new zone has no policies yet; an existing one may be open to the WAN.
      if (zoneId !== undefined) {
        const zone = await this.zone(zoneId, "the zone");
        const present = new Set((zone.networkIds ?? []).map((id) => id.toLowerCase()));
        const added = networkIds.filter((id) => !present.has(id.toLowerCase()));
        if (added.length > 0) await this.refuseIfWanTarget(zone, `add networks (${added.join(", ")}) to`);
      }
    });
  }

  /** A zone delete: refused if it is the WAN zone. */
  async zoneDelete(zoneId: string): Promise<string | undefined> {
    if (this.wan.allowExposure) return undefined;
    return this.refusal(async () => {
      const zone = await this.zone(zoneId, "the zone");
      if (this.isWan(zone)) throw new Refusal(`the change would delete the ${label(zone)} zone, which is the WAN`);
    });
  }

  /** The zone a network is put in, and on an update the zone it leaves: refused if either is the WAN zone. */
  async networkZone(zoneId: string, currentZoneId?: string): Promise<string | undefined> {
    if (this.wan.allowExposure) return undefined;
    return this.refusal(async () => {
      if (currentZoneId !== undefined) {
        const current = await this.zone(currentZoneId, "the network's current zoneId");
        if (this.isWan(current)) throw new Refusal(`the change would move the network out of the ${label(current)} zone, which is the WAN`);
      }
      const zone = await this.zone(zoneId, "the network's zoneId");
      if (this.isWan(zone)) throw new Refusal(`the change would put the network in the ${label(zone)} zone, which is the WAN`);
      await this.refuseIfWanTarget(zone, "put the network in");
    });
  }

  /** A policy reorder: refused for policies that apply to traffic from the WAN. */
  async policyOrder(sourceZoneId: string): Promise<string | undefined> {
    if (this.wan.allowExposure) return undefined;
    return this.refusal(async () => {
      const zone = await this.zone(sourceZoneId, "the source zone");
      if (this.isWan(zone)) {
        throw new Refusal(`the change would reorder the policies for traffic from the ${label(zone)} zone, which is the WAN, and could put an ALLOW ahead of a BLOCK`);
      }
    });
  }

  /** A traffic matching list update: refused if a policy that ALLOWs traffic from the WAN uses the list. */
  async matchingList(listId: string): Promise<string | undefined> {
    if (this.wan.allowExposure) return undefined;
    return this.refusal(async () => {
      // Either lookup failing refuses the write.
      const [zones, policies] = await Promise.all([this.zoneList(), this.policyList()]);
      const user = policies.find((policy) => {
        // IDs are compared without case: the controller may not care about it.
        if (!allowsTraffic(policy) || !JSON.stringify(policy).toLowerCase().includes(JSON.stringify(listId.toLowerCase()))) return false;
        // A source zone that is not on the list could be the WAN: count it.
        const zone = zones.find((candidate) => sameId(candidate.id, sourceZoneId(policy)));
        return zone === undefined || this.isWan(zone);
      });
      if (user) {
        throw new Refusal(`the list is used by firewall policy ${JSON.stringify(user.name ?? user.id)}, which ALLOWs traffic from the WAN, so changing it changes what the WAN can reach`);
      }
    });
  }

  /**
   * Refuse a change that puts networks in zone when a policy ALLOWs traffic
   * from the WAN into it: the networks would be reachable from the WAN with no
   * policy changing. A policy's destination trafficFilter may narrow it to
   * hosts outside the networks, but telling that apart takes more of the
   * filter's shape than the docs pin down, so it counts either way.
   */
  private async refuseIfWanTarget(zone: Zone, change: string): Promise<void> {
    const [zones, policies] = await Promise.all([this.zoneList(), this.policyList()]);
    const exposing = policies.find((policy) => {
      if (!allowsTraffic(policy) || !sameId(zone.id, destinationZoneId(policy))) return false;
      // A source zone that is not on the list could be the WAN: count it.
      const source = zones.find((candidate) => sameId(candidate.id, sourceZoneId(policy)));
      return source === undefined || this.isWan(source);
    });
    if (exposing) {
      throw new Refusal(`the change would ${change} the ${label(zone)} zone, which firewall policy ${JSON.stringify(exposing.name ?? exposing.id)} ALLOWs traffic into from the WAN`);
    }
  }

  private isWan(zone: Zone): boolean {
    return this.wan.zoneIds.includes(zone.id.toLowerCase()) ||
      (zone.metadata?.origin === "SYSTEM_DEFINED" && zone.name?.toLowerCase() === "external");
  }

  private async zone(zoneId: string, what: string): Promise<Zone> {
    const zone = (await this.zoneList()).find((candidate) => sameId(candidate.id, zoneId));
    if (zone === undefined) throw new Refusal(`${what} (${zoneId}) is not one of this site's firewall zones, so it cannot be checked against the WAN zone`);
    return zone;
  }

  private zoneList(): Promise<Zone[]> {
    this.zones ??= listAll(this.client, `/sites/${this.siteId}/firewall/zones`, Zone).catch((err: unknown) => {
      throw new Refusal(`the firewall zones could not be read to find the WAN zone (${errorMessage(err)})`);
    });
    return this.zones;
  }

  private policyList(): Promise<z.infer<typeof Policy>[]> {
    this.policies ??= listAll(this.client, `/sites/${this.siteId}/firewall/policies`, Policy).catch((err: unknown) => {
      throw new Refusal(`the firewall policies that the change depends on could not be read (${errorMessage(err)})`);
    });
    return this.policies;
  }

  private async refusal(check: () => Promise<void>): Promise<string | undefined> {
    try {
      await check();
      return undefined;
    } catch (err) {
      if (err instanceof Refusal) return err.message;
      return `the WAN check failed (${errorMessage(err)})`;
    }
  }
}

/** Connection states that only answer traffic already let through, so cannot open a new connection. */
const RETURN_STATES: readonly unknown[] = ["ESTABLISHED", "RELATED"];

/**
 * Any action but BLOCK or REJECT lets traffic through, including a missing
 * one, unless the policy matches only ESTABLISHED and RELATED connections.
 * A missing, null or empty connectionStateFilter matches every state.
 */
function allowsTraffic(policy: Record<string, unknown>): boolean {
  const action = policy.action;
  const type = action !== null && typeof action === "object" && "type" in action ? action.type : undefined;
  if (type === "BLOCK" || type === "REJECT") return false;
  const states = policy.connectionStateFilter;
  return !(Array.isArray(states) && states.length > 0 && states.every((state) => RETURN_STATES.includes(state)));
}

function sourceZoneId(policy: Record<string, unknown>): string | undefined {
  const source = policy.source;
  const zoneId = source !== null && typeof source === "object" && "zoneId" in source ? source.zoneId : undefined;
  return typeof zoneId === "string" ? zoneId : undefined;
}

function destinationZoneId(policy: Record<string, unknown>): string | undefined {
  const destination = policy.destination;
  const zoneId = destination !== null && typeof destination === "object" && "zoneId" in destination ? destination.zoneId : undefined;
  return typeof zoneId === "string" ? zoneId : undefined;
}

/** IDs are compared without case: the controller may not care about it. */
function sameId(a: string, b: string | undefined): boolean {
  return a.toLowerCase() === b?.toLowerCase();
}

function label(zone: Zone): string {
  return zone.name ?? zone.id;
}

/** The result of a refused write; method and path are the write it would have sent. */
export function wanRefusal(reason: string, method: string, path: string) {
  noteRefusal("wan_exposure", method, `/integration/v1${path}`);
  return {
    content: [{
      type: "text" as const,
      text: `Refused: ${reason}. This server does not make changes that could let traffic in from the WAN, and confirm does not override this; if the change is intended, make it in the UniFi console.`,
    }],
    isError: true as const,
  };
}
