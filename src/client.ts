import { Config } from "./config.js";

export class NetworkClient {
  private baseUrl: string;
  private headers: Record<string, string>;
  private networkUrl: string;

  constructor(config: Config) {
    if (config.consoleId && (config.host !== "api.ui.com" || !/^[A-Za-z0-9:]+$/.test(config.consoleId))) {
      throw new Error("Cloud Connector requires host api.ui.com and a valid console ID");
    }
    const consolePath = config.consoleId ? `/v1/connector/consoles/${config.consoleId}` : "";
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
    const url = `${this.baseUrl}${path}`;
    const options: RequestInit = {
      method,
      headers: this.headers,
    };

    if (body !== undefined) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HTTP ${response.status}: ${text}`);
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      return response.json();
    }
    return response.text();
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
      redirect: "error", signal: AbortSignal.timeout(25000),
    });
    if (!response.ok) {
      throw new Error(`Controller history returned HTTP ${response.status}; verify API-key access and controller support. This is not an empty history result.`);
    }
    if (!response.headers.get("content-type")?.includes("application/json")) {
      throw new Error("Controller history returned non-JSON data; verify controller authentication");
    }
    // Bound the body before parsing: controller session records can be large.
    const reader = response.body?.getReader();
    if (!reader) throw new Error("Controller history returned no response body");
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
    const result: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (result && typeof result === "object" && "meta" in result) {
      const meta = result.meta;
      if (meta && typeof meta === "object" && "rc" in meta && meta.rc !== "ok") {
        throw new Error("Controller rejected the history query (meta.rc is not ok)");
      }
    }
    return result;
  }
}
