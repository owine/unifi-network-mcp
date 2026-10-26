import { AsyncLocalStorage } from "node:async_hooks";
// undici's own fetch, not the global one: Node's built-in fetch bundles an
// older undici whose handlers the Agent from tls.ts (undici 8) rejects.
import { fetch, type Dispatcher, type RequestInit, type Response } from "undici";
import { Config, isSiteManagerHost } from "./config.js";
import { GuardError, guardRequest, type GuardPolicy } from "./guard.js";
import { consoleDispatcher } from "./tls.js";
import { noteRefusal, noteWriteRequest, noteWriteStatus } from "./write-log.js";

// Well under undici's 300s default, so a stalled controller fails the call
// before the MCP host gives up on it.
const REQUEST_TIMEOUT_MS = 30_000;
const CONTROLLER_TIMEOUT_MS = 25_000;

// What undici reports when the console closed the connection under a
// request, typically a kept-alive socket it had already timed out.
const SOCKET_CLOSED: readonly string[] = ["UND_ERR_SOCKET", "ECONNRESET", "EPIPE"];

function socketClosed(err: unknown): boolean {
  const cause = err instanceof Error ? err.cause : undefined;
  return cause instanceof Error && "code" in cause && typeof cause.code === "string" && SOCKET_CLOSED.includes(cause.code);
}

/**
 * A request that failed in flight, worded so the model knows whether retrying
 * is safe: a timed-out or cut-off write may already have been applied, and
 * repeating a create would duplicate it. The timeout also covers reading the
 * body, so this applies to the whole exchange, not only to fetch().
 */
function inFlightError(read: boolean, method: string, timeoutMs: number, err: unknown): unknown {
  const hint = read
    ? "Retry when the console responds."
    : `The ${method} may still have been applied; check the resource before retrying.`;
  if (err instanceof DOMException && err.name === "TimeoutError") {
    return new Error(`UniFi controller did not respond within ${timeoutMs / 1000}s. ${hint}`, { cause: err });
  }
  if (!read && socketClosed(err)) {
    return new Error(`The UniFi controller closed the connection during the ${method}. ${hint}`, { cause: err });
  }
  return err;
}

// The abort signal of the MCP tool call a request is made for. Without it a
// cancelled (or abandoned) call keeps its request running, and a write lands
// after the host has already reported the call as failed.
const callSignal = new AsyncLocalStorage<AbortSignal>();

/** Run fn so that every request it makes is aborted when signal is. */
export function withCallSignal<T>(signal: AbortSignal | undefined, fn: () => T): T {
  return signal ? callSignal.run(signal, fn) : fn();
}

const ERROR_BODY_LIMIT = 500;

/**
 * The useful part of an error body for the model: the API's documented
 * message, code and request ID, or a capped excerpt of anything else (a proxy
 * or UniFi OS HTML error page would otherwise land in the context whole).
 */
function describeErrorBody(text: string): string {
  try {
    const body: unknown = JSON.parse(text);
    if (body && typeof body === "object" && "message" in body && typeof body.message === "string") {
      const details = [
        "code" in body && typeof body.code === "string" ? body.code : undefined,
        "requestId" in body && typeof body.requestId === "string" ? `request ${body.requestId}` : undefined,
      ].filter((detail) => detail !== undefined);
      const message = capped(body.message);
      return details.length > 0 ? `${message} (${details.join("; ")})` : message;
    }
  } catch {
    // Not JSON: fall through to the excerpt.
  }
  return capped(text);
}

function capped(text: string): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  return collapsed.length > ERROR_BODY_LIMIT ? `${collapsed.slice(0, ERROR_BODY_LIMIT)}…` : collapsed;
}

function requestSignal(timeoutMs: number): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  const caller = callSignal.getStore();
  return caller ? AbortSignal.any([caller, timeout]) : timeout;
}

/** The classic controller REST collections the classic read tools list. */
export const CLASSIC_COLLECTIONS = ["networkconf", "firewallgroup", "firewallrule"] as const;
export type ClassicCollection = (typeof CLASSIC_COLLECTIONS)[number];

/** How errors from one family of controller routes outside the Integration API are worded. */
interface ControllerRead {
  name: string;
  query: string;
  notEmpty: string;
  tooLarge: string;
}

const HISTORY: ControllerRead = {
  name: "Controller history",
  query: "history query",
  notEmpty: "This is not an empty history result.",
  tooLarge: "reduce the page size or time window",
};

const CLASSIC: ControllerRead = {
  name: "Classic controller API",
  query: "classic API read",
  notEmpty: "This is not an empty result.",
  tooLarge: "the collection is too large to return",
};

export class NetworkClient {
  private headers: Record<string, string>;
  private networkUrl: string;
  private dispatcher: Dispatcher;
  private policy: GuardPolicy;

  constructor(config: Config) {
    // Cloud Connector only exists behind api.ui.com. A console ID set against a
    // local controller is ignored rather than fatal: the other tools work fine
    // against that controller, and taking the whole server down helps nobody.
    const useConnector = config.consoleId !== undefined && isSiteManagerHost(config.host);
    if (config.consoleId !== undefined && !useConnector) {
      console.error(
        `Ignoring UNIFI_NETWORK_CONSOLE_ID: Cloud Connector requires host api.ui.com, but host is ${config.host}.`
      );
    }
    const consolePath = useConnector ? `/v1/connector/consoles/${config.consoleId}` : "";
    this.networkUrl = `https://${config.host}${consolePath}/proxy/network`;
    this.headers = {
      "X-API-KEY": config.apiKey,
      "Content-Type": "application/json",
    };

    this.dispatcher = consoleDispatcher(config);
    this.policy = { readOnly: config.readOnly, ...(config.writeTools ? { writeTools: config.writeTools } : {}) };
  }

  /**
   * path is relative to the Integration API, as the tools pass it. The guard
   * sees it as the canonical path under the Network application; the host and
   * any Cloud Connector prefix are added only once it has passed.
   */
  private async request(
    method: string,
    path: string,
    body?: unknown
  ): Promise<unknown> {
    const canonical = `/integration/v1${path}`;
    this.guard(method, canonical);
    const url = `${this.networkUrl}${canonical}`;
    const send = () => this.send(method, url, body).catch((err: unknown) => {
      throw inFlightError(method === "GET", method, REQUEST_TIMEOUT_MS, err);
    });
    // A connection the console closed while it sat idle fails the next request
    // on it. Nothing reached the console, and a read changes nothing anyway, so
    // a read goes out once more on a fresh connection.
    return method === "GET"
      ? send().catch((err: unknown) => {
        if (socketClosed(err)) return send();
        throw err;
      })
      : send();
  }

  private async send(method: string, url: string, body?: unknown): Promise<unknown> {
    const options: RequestInit = {
      method,
      headers: this.headers,
      redirect: "error",
      signal: requestSignal(REQUEST_TIMEOUT_MS),
      dispatcher: this.dispatcher,
    };

    if (body !== undefined) {
      options.body = JSON.stringify(body);
    }

    const response: Response = await fetch(url, options);

    if (method !== "GET") noteWriteStatus(response.status);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${describeErrorBody(await response.text())}`);
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      return response.json();
    }
    return response.text();
  }

  /** Check a request against the guard before anything is sent, and note writes for the write log. */
  private guard(method: string, path: string): void {
    try {
      const route = guardRequest(method, path, this.policy);
      if (route.tools !== undefined) noteWriteRequest(method, path);
    } catch (err) {
      if (err instanceof GuardError) noteRefusal("request_guard", method, path);
      throw err;
    }
  }

  async get(path: string): Promise<unknown> {
    return this.request("GET", path);
  }

  async post(path: string, body?: unknown): Promise<unknown> {
    return this.request("POST", path, body);
  }

  async put(path: string, body: unknown): Promise<unknown> {
    return this.request("PUT", path, body);
  }

  async patch(path: string, body: unknown): Promise<unknown> {
    return this.request("PATCH", path, body);
  }

  async delete(path: string): Promise<unknown> {
    return this.request("DELETE", path);
  }

  /** These controller endpoints are read queries, including stat/session's POST. */
  async getClientHistory(siteReference: string, withinHours: number): Promise<unknown> {
    this.validateSiteReference(siteReference);
    if (!Number.isInteger(withinHours) || withinHours < 1 || withinHours > 8760) {
      throw new Error("withinHours must be an integer from 1 to 8760");
    }
    return this.historyRequest(`/v2/api/site/${siteReference}/clients/history?withinHours=${withinHours}`);
  }

  async getClientSessions(siteReference: string, query: {
    start: number; end: number; limit: number; mac?: string;
  }): Promise<unknown> {
    this.validateSiteReference(siteReference);
    const { start, end, limit, mac } = query;
    if (![start, end, limit].every(Number.isSafeInteger) || start < 0 || end > 4102444800 ||
        end <= start || end - start > 31 * 86400 || limit < 1 || limit > 1000 ||
        (mac !== undefined && !/^([\da-f]{2}:){5}[\da-f]{2}$/i.test(mac))) {
      throw new Error("Invalid session query: use epoch seconds, an increasing window of at most 31 days, a valid limit and MAC");
    }
    return this.historyRequest(`/api/s/${siteReference}/stat/session`, {
      type: "all", start, end, _limit: limit, _sort: "-assoc_time",
      ...(mac ? { mac: mac.toLowerCase() } : {}),
    });
  }

  /** A classic controller REST collection, read whole: the controller does not page these. */
  async getClassic(siteReference: string, collection: ClassicCollection): Promise<unknown> {
    this.validateSiteReference(siteReference);
    if (!CLASSIC_COLLECTIONS.includes(collection)) throw new Error(`Unknown classic collection ${collection}`);
    return this.classicRequest(`/api/s/${siteReference}/rest/${collection}`);
  }

  private validateSiteReference(siteReference: string): void {
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(siteReference)) {
      throw new Error("Use the site's internalReference from unifi_list_sites (for example default)");
    }
  }

  private async historyRequest(path: string, body?: unknown): Promise<unknown> {
    const method = body === undefined ? "GET" : "POST";
    this.guard(method, path);
    // Both history endpoints are reads, the POST included.
    return this.readController(HISTORY, method, path, body).catch((err: unknown) => {
      throw inFlightError(true, method, CONTROLLER_TIMEOUT_MS, err);
    });
  }

  /** The classic controller API, outside /integration/v1. Only GETs of the collections the guard allows. */
  private async classicRequest(path: string): Promise<unknown> {
    this.guard("GET", path);
    return this.readController(CLASSIC, "GET", path).catch((err: unknown) => {
      throw inFlightError(true, "GET", CONTROLLER_TIMEOUT_MS, err);
    });
  }

  private async readController(kind: ControllerRead, method: string, path: string, body?: unknown): Promise<unknown> {
    const options: RequestInit = {
      method, headers: this.headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      redirect: "error", signal: requestSignal(CONTROLLER_TIMEOUT_MS), dispatcher: this.dispatcher,
    };
    const response = await fetch(`${this.networkUrl}${path}`, options);
    if (!response.ok) {
      // Drain before throwing: an unread body pins the socket until GC, so a
      // run of failures (say, a mis-scoped API key) would leak connections.
      await response.body?.cancel();
      throw new Error(`${kind.name} returned HTTP ${response.status}; verify API-key access and controller support. ${kind.notEmpty}`);
    }
    if (!response.headers.get("content-type")?.includes("application/json")) {
      await response.body?.cancel();
      throw new Error(`${kind.name} returned non-JSON data; verify controller authentication`);
    }
    // Bound the body before parsing: controller session records can be large.
    if (response.body === null) throw new Error(`${kind.name} returned no response body`);
    // undici types the body as an untyped stream; a fetch body is always bytes.
    const reader = (response.body as ReadableStream<Uint8Array>).getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.length;
        if (bytes > 10000000) {
          await reader.cancel();
          throw new Error(`${kind.name} exceeds 10 MB; ${kind.tooLarge}`);
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const text = Buffer.concat(chunks).toString("utf8");
    if (text.trim() === "") {
      // A bare JSON.parse would surface "Unexpected end of JSON input", which
      // reads as a broken tool rather than an unusable controller response.
      throw new Error(`${kind.name} returned an empty body; verify controller support. ${kind.notEmpty}`);
    }
    const result: unknown = JSON.parse(text);
    if (result && typeof result === "object" && "meta" in result) {
      const meta = result.meta;
      if (meta && typeof meta === "object" && "rc" in meta && meta.rc !== "ok") {
        throw new Error(`Controller rejected the ${kind.query} (meta.rc is not ok)`);
      }
    }
    return result;
  }
}
