import { AsyncLocalStorage } from "node:async_hooks";
import { Config } from "./config.js";

// Well under undici's 300s default, so a stalled controller fails the call
// before the MCP host gives up on it.
const REQUEST_TIMEOUT_MS = 30_000;

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

export class NetworkClient {
  private baseUrl: string;
  private headers: Record<string, string>;
  private networkUrl: string;

  constructor(config: Config) {
    // Cloud Connector only exists behind api.ui.com. A console ID set against a
    // local controller is ignored rather than fatal: the other tools work fine
    // against that controller, and taking the whole server down helps nobody.
    const useConnector = config.consoleId !== undefined && config.host === "api.ui.com";
    if (config.consoleId !== undefined && !useConnector) {
      console.error(
        `Ignoring UNIFI_NETWORK_CONSOLE_ID: Cloud Connector requires host api.ui.com, but host is ${config.host}.`
      );
    }
    const consolePath = useConnector ? `/v1/connector/consoles/${config.consoleId}` : "";
    this.networkUrl = `https://${config.host}${consolePath}/proxy/network`;
    this.baseUrl = `${this.networkUrl}/integration/v1`;
    this.headers = {
      "X-API-KEY": config.apiKey,
      "Content-Type": "application/json",
    };

    if (!config.verifySsl) {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    }
  }

  private async request(
    method: string,
    path: string,
    body?: unknown
  ): Promise<unknown> {
    const url = this.resolve(path);
    const options: RequestInit = {
      method,
      headers: this.headers,
      redirect: "error",
      signal: requestSignal(REQUEST_TIMEOUT_MS),
    };

    if (body !== undefined) {
      options.body = JSON.stringify(body);
    }

    let response: Response;
    try {
      response = await fetch(url, options);
    } catch (err) {
      if (err instanceof DOMException && err.name === "TimeoutError") {
        throw new Error(
          `UniFi controller did not respond within ${REQUEST_TIMEOUT_MS / 1000}s. ` +
          `A ${method} may still have been applied; check the resource before retrying.`,
          { cause: err }
        );
      }
      throw err;
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${describeErrorBody(await response.text())}`);
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      return response.json();
    }
    return response.text();
  }

  /**
   * Path segments come from model-supplied IDs. URL parsing folds `..`
   * (and `%2e%2e`, and `\`) out of the path and `#` truncates it, which would
   * let an ID reach any endpoint on the console — legacy controller API
   * included — with this API key. Every tool path is plain word segments, so
   * allow only those; the query string is built by URLSearchParams.
   */
  private resolve(path: string): string {
    const queryStart = path.indexOf("?");
    const pathname = queryStart === -1 ? path : path.slice(0, queryStart);
    if (!/^(\/[A-Za-z0-9_-]+)+$/.test(pathname) || path.includes("#")) {
      throw new Error(`Refusing a request path outside the Integration API: ${pathname}`);
    }
    return `${this.baseUrl}${path}`;
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

  private validateSiteReference(siteReference: string): void {
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(siteReference)) {
      throw new Error("Use the site's internalReference from unifi_list_sites (for example default)");
    }
  }

  private async historyRequest(path: string, body?: unknown): Promise<unknown> {
    const response = await fetch(`${this.networkUrl}${path}`, {
      method: body === undefined ? "GET" : "POST", headers: this.headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      redirect: "error", signal: requestSignal(25000),
    });
    if (!response.ok) {
      // Drain before throwing: an unread body pins the socket until GC, so a
      // run of failures (say, a mis-scoped API key) would leak connections.
      await response.body?.cancel();
      throw new Error(`Controller history returned HTTP ${response.status}; verify API-key access and controller support. This is not an empty history result.`);
    }
    if (!response.headers.get("content-type")?.includes("application/json")) {
      await response.body?.cancel();
      throw new Error("Controller history returned non-JSON data; verify controller authentication");
    }
    // Bound the body before parsing: controller session records can be large.
    if (response.body === null) throw new Error("Controller history returned no response body");
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.length;
        if (bytes > 10000000) {
          await reader.cancel();
          throw new Error("Controller history exceeds 10 MB; reduce the page size or time window");
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
      throw new Error("Controller history returned an empty body; verify controller support. This is not an empty history result.");
    }
    const result: unknown = JSON.parse(text);
    if (result && typeof result === "object" && "meta" in result) {
      const meta = result.meta;
      if (meta && typeof meta === "object" && "rc" in meta && meta.rc !== "ok") {
        throw new Error("Controller rejected the history query (meta.rc is not ok)");
      }
    }
    return result;
  }
}
