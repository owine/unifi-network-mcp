import { describe, it, expect, vi, beforeEach } from "vitest";
import { NetworkClient, withCallSignal } from "../src/client.js";

// The client calls undici's fetch rather than the global one, so mock that;
// the real Agent stays, since the client still builds one.
const fetchMock = vi.hoisted(() => vi.fn());
vi.mock("undici", async (importOriginal) => ({ ...await importOriginal<typeof import("undici")>(), fetch: fetchMock }));
import type { Config } from "../src/config.js";

function makeConfig(overrides: Partial<Config> = {}): Config {
  return {
    host: "192.168.1.1",
    apiKey: "test-key",
    verifySsl: true,
    readOnly: false,
    ...overrides,
  };
}

function mockResponse(
  body: string,
  {
    ok = true,
    status = 200,
    contentType = "application/json",
    headers = {},
  }: { ok?: boolean; status?: number; contentType?: string; headers?: Record<string, string> } = {}
): Response {
  return {
    ok,
    status,
    headers: new Headers({ "content-type": contentType, ...headers }),
    json: () => Promise.resolve(JSON.parse(body)),
    text: () => Promise.resolve(body),
  } as Response;
}

function socketError(code: string): TypeError {
  return new TypeError("fetch failed", { cause: Object.assign(new Error("other side closed"), { code }) });
}

describe("NetworkClient", () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  // ── Constructor ────────────────────────────────────────────────────

  describe("constructor", () => {
    it("should build the correct base URL from host", async () => {
      fetchMock.mockResolvedValue(mockResponse("{}"));
      const client = new NetworkClient(makeConfig({ host: "10.0.0.1" }));
      await client.get("/sites");
      expect(fetchMock).toHaveBeenCalledWith(
        "https://10.0.0.1/proxy/network/integration/v1/sites",
        expect.any(Object)
      );
    });

    it("should set X-API-KEY header from config", async () => {
      fetchMock.mockResolvedValue(mockResponse("{}"));
      const client = new NetworkClient(makeConfig({ apiKey: "my-secret" }));
      await client.get("/sites");
      const [, options] = fetchMock.mock.calls[0];
      expect(options.headers["X-API-KEY"]).toBe("my-secret");
    });

  });

  // ── HTTP methods ───────────────────────────────────────────────────

  describe("HTTP methods", () => {
    let client: NetworkClient;

    beforeEach(() => {
      client = new NetworkClient(makeConfig());
    });

    it("get() should call fetch with GET and no body", async () => {
      fetchMock.mockResolvedValue(mockResponse("{}"));
      await client.get("/sites");
      const [url, options] = fetchMock.mock.calls[0];
      expect(url).toContain("/sites");
      expect(options.method).toBe("GET");
      expect(options.body).toBeUndefined();
    });

    it("post() should call fetch with POST and JSON body", async () => {
      fetchMock.mockResolvedValue(mockResponse("{}"));
      await client.post("/sites/s1/networks", { name: "test" });
      const [, options] = fetchMock.mock.calls[0];
      expect(options.method).toBe("POST");
      expect(options.body).toBe(JSON.stringify({ name: "test" }));
    });

    it("put() should call fetch with PUT and JSON body", async () => {
      fetchMock.mockResolvedValue(mockResponse("{}"));
      await client.put("/sites/s1/networks/n1", { name: "updated" });
      const [, options] = fetchMock.mock.calls[0];
      expect(options.method).toBe("PUT");
      expect(options.body).toBe(JSON.stringify({ name: "updated" }));
    });

    it("patch() should call fetch with PATCH and JSON body", async () => {
      fetchMock.mockResolvedValue(mockResponse("{}"));
      await client.patch("/sites/s1/firewall/policies/p1", { name: "patched" });
      const [, options] = fetchMock.mock.calls[0];
      expect(options.method).toBe("PATCH");
      expect(options.body).toBe(JSON.stringify({ name: "patched" }));
    });

    it("delete() should call fetch with DELETE and no body", async () => {
      fetchMock.mockResolvedValue(mockResponse("{}"));
      await client.delete("/sites/s1/networks/n1");
      const [, options] = fetchMock.mock.calls[0];
      expect(options.method).toBe("DELETE");
      expect(options.body).toBeUndefined();
    });
  });

  // ── Response handling ──────────────────────────────────────────────

  describe("response handling", () => {
    let client: NetworkClient;

    beforeEach(() => {
      client = new NetworkClient(makeConfig());
    });

    it("should return parsed JSON for application/json content-type", async () => {
      fetchMock.mockResolvedValue(
        mockResponse(JSON.stringify({ data: [1, 2, 3] }))
      );
      const result = await client.get("/sites");
      expect(result).toEqual({ data: [1, 2, 3] });
    });

    it("should return text for non-JSON content-type", async () => {
      fetchMock.mockResolvedValue(
        mockResponse("plain text", { contentType: "text/plain" })
      );
      const result = await client.get("/sites");
      expect(result).toBe("plain text");
    });

    it("should throw an error for non-ok responses", async () => {
      fetchMock.mockResolvedValue(
        mockResponse("Not Found", { ok: false, status: 404 })
      );
      await expect(client.get("/sites/s1/devices/missing")).rejects.toThrow(
        "HTTP 404: Not Found"
      );
    });
  });

  // ── Network failures ──────────────────────────────────────────────

  describe("network failures", () => {
    let client: NetworkClient;

    beforeEach(() => {
      client = new NetworkClient(makeConfig());
    });

    it("propagates fetch TypeError for get()", async () => {
      fetchMock.mockRejectedValue(new TypeError("fetch failed"));
      await expect(client.get("/sites")).rejects.toThrow("fetch failed");
    });

    it("propagates fetch TypeError for post()", async () => {
      fetchMock.mockRejectedValue(new TypeError("fetch failed"));
      await expect(client.post("/sites/s1/networks", {})).rejects.toThrow("fetch failed");
    });

    it("propagates fetch TypeError for put()", async () => {
      fetchMock.mockRejectedValue(new TypeError("fetch failed"));
      await expect(client.put("/sites/s1/networks/n1", {})).rejects.toThrow("fetch failed");
    });

    it("propagates fetch TypeError for patch()", async () => {
      fetchMock.mockRejectedValue(new TypeError("fetch failed"));
      await expect(client.patch("/sites/s1/firewall/policies/p1", {})).rejects.toThrow("fetch failed");
    });

    it("propagates fetch TypeError for delete()", async () => {
      fetchMock.mockRejectedValue(new TypeError("fetch failed"));
      await expect(client.delete("/sites/s1/networks/n1")).rejects.toThrow("fetch failed");
    });

    it("refuses redirects so the API key is never re-sent elsewhere", async () => {
      fetchMock.mockResolvedValue(mockResponse("{}"));
      await client.get("/sites");
      const [, options] = fetchMock.mock.calls[0];
      expect(options.redirect).toBe("error");
    });

    it("bounds every request with a timeout signal", async () => {
      fetchMock.mockResolvedValue(mockResponse("{}"));
      await client.post("/sites/s1/networks", {});
      const [, options] = fetchMock.mock.calls[0];
      expect(options.signal).toBeInstanceOf(AbortSignal);
    });

    it("tells a timed-out read to retry, since nothing can have changed", async () => {
      fetchMock.mockRejectedValue(new DOMException("The operation was aborted due to timeout", "TimeoutError"));
      const err = await client.get("/sites").catch((e: unknown) => e);
      expect((err as Error).message).toMatch(/did not respond within 30s\. Retry/);
      expect((err as Error).message).not.toContain("may still have been applied");
    });

    it("reports a timeout while reading a write's body as an unknown outcome", async () => {
      // The 2xx headers arrived, so the write was applied; the body then stalled.
      fetchMock.mockResolvedValue(Object.assign(mockResponse("{}"), {
        json: () => Promise.reject(new DOMException("The operation was aborted due to timeout", "TimeoutError")),
      }));
      await expect(client.post("/sites/s1/networks", {})).rejects.toThrow(/did not respond within 30s.*may still have been applied/);
    });

    it("reports a write cut off by a closed connection as an unknown outcome", async () => {
      fetchMock.mockRejectedValue(socketError("UND_ERR_SOCKET"));
      await expect(client.put("/sites/s1/networks/n1", {})).rejects.toThrow(/closed the connection during the PUT.*may still have been applied/);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("sends a read once more when the console closed an idle connection", async () => {
      fetchMock.mockRejectedValueOnce(socketError("ECONNRESET")).mockResolvedValueOnce(mockResponse('{"ok":true}'));
      await expect(client.get("/sites")).resolves.toEqual({ ok: true });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("sends a read at most twice", async () => {
      fetchMock.mockRejectedValue(socketError("UND_ERR_SOCKET"));
      await expect(client.get("/sites")).rejects.toThrow("fetch failed");
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("never resends a write", async () => {
      fetchMock.mockRejectedValue(socketError("ECONNRESET"));
      await expect(client.post("/sites/s1/networks", {})).rejects.toThrow();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("reports a timeout as an unknown outcome rather than a failure", async () => {
      fetchMock.mockRejectedValue(new DOMException("The operation was aborted due to timeout", "TimeoutError"));
      await expect(client.post("/sites/s1/networks", {})).rejects.toThrow(/did not respond within 30s.*may still have been applied/);
    });
  });

  // ── Error bodies ──────────────────────────────────────────────────

  describe("error bodies", () => {
    let client: NetworkClient;

    beforeEach(() => {
      client = new NetworkClient(makeConfig());
    });

    it("reports the message and code of a documented API error", async () => {
      fetchMock.mockResolvedValue(mockResponse(JSON.stringify({
        statusCode: 400, statusName: "UNAUTHORIZED", code: "api.authentication.missing-credentials",
        message: "Missing credentials", timestamp: "2024-11-27T08:13:46.966Z",
        requestPath: "/integration/v1/sites/123/devices", requestId: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
      }), { ok: false, status: 400 }));
      await expect(client.get("/sites/123/devices")).rejects.toThrow(
        /^HTTP 400: Missing credentials \(api\.authentication\.missing-credentials; request 3fa85f64-5717-4562-b3fc-2c963f66afa6\)$/
      );
    });

    it("says when the console rate-limits a request, with its Retry-After delay", async () => {
      fetchMock.mockResolvedValue(mockResponse("Too Many Requests", { ok: false, status: 429, contentType: "text/plain", headers: { "retry-after": "7" } }));
      await expect(client.get("/sites")).rejects.toThrow(
        /^HTTP 429: Too Many Requests\. The console is rate-limiting requests; retry after 7s\.$/
      );
    });

    it("reads a Retry-After date as the seconds until then", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      try {
        vi.setSystemTime(new Date("2026-11-15T12:00:00Z"));
        fetchMock.mockResolvedValue(mockResponse("", { ok: false, status: 429, headers: { "retry-after": "Sun, 15 Nov 2026 12:00:30 GMT" } }));
        await expect(client.get("/sites")).rejects.toThrow(/^HTTP 429: The console is rate-limiting requests; retry after 30s\.$/);
      } finally {
        vi.useRealTimers();
      }
    });

    it("asks the model to wait when a 429 has no usable Retry-After", async () => {
      // "1.5", "-5" and "2026 x" are not delay-seconds; V8's lenient Date.parse
      // would read the first two as 2001 dates ("retry after 0s"). An absurd
      // delay is no guidance either.
      const unusable = ["soon", "1.5", "-5", "2026 x", "86401", "999999999999999999999", "Sun, 15 Nov 2126 12:00:30 GMT"];
      for (const headers of [{}, ...unusable.map((value) => ({ "retry-after": value }))] as Record<string, string>[]) {
        fetchMock.mockResolvedValue(mockResponse("", { ok: false, status: 429, headers }));
        await expect(client.post("/sites/s1/networks", {})).rejects.toThrow(
          /^HTTP 429: The console is rate-limiting requests; wait before retrying\.$/
        );
      }
    });

    it("joins a body that ends in punctuation to the hint with one period", async () => {
      fetchMock.mockResolvedValue(mockResponse(JSON.stringify({ message: "Too many requests." }), { ok: false, status: 429, headers: { "retry-after": "3" } }));
      await expect(client.get("/sites")).rejects.toThrow(
        /^HTTP 429: Too many requests\. The console is rate-limiting requests; retry after 3s\.$/
      );
    });

    it("reports a write a gateway gave up on as an unknown outcome", async () => {
      // The Cloud Connector answers 408 after 25s, once it has passed the
      // request on; a 502 or 504 from a proxy is just as unclear.
      for (const status of [408, 502, 504]) {
        fetchMock.mockResolvedValue(mockResponse(JSON.stringify({ code: "timeout", message: "request timed out" }), { ok: false, status }));
        await expect(client.post("/sites/s1/hotspot/vouchers", {})).rejects.toThrow(
          new RegExp(`^HTTP ${String(status)}: request timed out \\(timeout\\)\\. The POST may still have been applied; check the resource before retrying\\.$`)
        );
      }
    });

    it("tells a read a gateway gave up on nothing about write outcomes", async () => {
      fetchMock.mockResolvedValue(mockResponse("Gateway Timeout", { ok: false, status: 504, contentType: "text/plain" }));
      await expect(client.get("/sites")).rejects.toThrow(/^HTTP 504: Gateway Timeout$/);
    });

    it("adds no outcome hint to a write the console itself rejected", async () => {
      fetchMock.mockResolvedValue(mockResponse(JSON.stringify({ message: "Invalid body" }), { ok: false, status: 400 }));
      await expect(client.put("/sites/s1/networks/n1", {})).rejects.toThrow(/^HTTP 400: Invalid body$/);
    });

    it("adds no rate-limit hint to other errors", async () => {
      fetchMock.mockResolvedValue(mockResponse("Service Unavailable", { ok: false, status: 503, headers: { "retry-after": "5" } }));
      await expect(client.get("/sites")).rejects.toThrow(/^HTTP 503: Service Unavailable$/);
    });

    it("caps a JSON error message", async () => {
      fetchMock.mockResolvedValue(mockResponse(JSON.stringify({ code: "api.err", message: "x".repeat(10_000) }), { ok: false, status: 500 }));
      const err = await client.get("/sites").catch((e: unknown) => e);
      expect((err as Error).message.length).toBeLessThan(600);
      expect((err as Error).message).toContain("(api.err)");
    });

    it("caps a non-JSON error body", async () => {
      const page = "<html><body>" + "Bad gateway ".repeat(200) + "</body></html>";
      fetchMock.mockResolvedValue(mockResponse(page, { ok: false, status: 502, contentType: "text/html" }));
      const err = await client.get("/sites").catch((e: unknown) => e);
      expect((err as Error).message.length).toBeLessThan(520);
      expect((err as Error).message).toMatch(/^HTTP 502: <html><body>Bad gateway Bad gateway .*…$/);
    });
  });

  // ── Inside an MCP call ────────────────────────────────────────────

  describe("inside an MCP call", () => {
    // A controller that never answers: settle only when the request aborts.
    const hang = (_url: string, options: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        options.signal?.addEventListener("abort", () => { reject(options.signal?.reason as DOMException); });
      });

    it("keeps the 30s timeout alongside the call's abort signal", async () => {
      const timer = new AbortController();
      vi.spyOn(AbortSignal, "timeout").mockReturnValue(timer.signal);
      fetchMock.mockImplementation(hang);
      const pending = withCallSignal(new AbortController().signal, () => new NetworkClient(makeConfig()).put("/sites/s/networks/x", {}));
      timer.abort(new DOMException("timed out", "TimeoutError"));
      await expect(pending).rejects.toThrow(/did not respond within 30s/);
    });

    it("aborts a controller-history request when the call is cancelled", async () => {
      fetchMock.mockImplementation(hang);
      const call = new AbortController();
      const pending = withCallSignal(call.signal, () => new NetworkClient(makeConfig()).getClientHistory("default", 24));
      call.abort();
      await expect(pending).rejects.toThrow();
      expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
    });
  });

  // ── Startup check ─────────────────────────────────────────────────

  describe("checkConnection", () => {
    it("reads /info and resolves when the console answers", async () => {
      fetchMock.mockResolvedValue(mockResponse('{"applicationVersion":"11.0.83"}'));
      await new NetworkClient(makeConfig()).checkConnection();
      expect(fetchMock).toHaveBeenCalledWith(
        "https://192.168.1.1/proxy/network/integration/v1/info",
        expect.objectContaining({ method: "GET" })
      );
    });

    it.each([
      ["an HTML page", "<html>Welcome</html>", "text/html"],
      ["JSON without applicationVersion", '{"status":"ok"}', "application/json"],
      ["a non-string applicationVersion", '{"applicationVersion":11}', "application/json"],
    ])("rejects a 2xx answer that is %s", async (_label, body, contentType) => {
      fetchMock.mockResolvedValue(mockResponse(body, { contentType }));
      await expect(new NetworkClient(makeConfig()).checkConnection()).rejects.toThrow(/not with UniFi Network application info/);
    });

    it("rejects with the HTTP status when the console refuses the key", async () => {
      fetchMock.mockResolvedValue(mockResponse('{"message":"Unauthorized"}', { ok: false, status: 401 }));
      await expect(new NetworkClient(makeConfig()).checkConnection()).rejects.toThrow(/HTTP 401: Unauthorized/);
    });

    it("rejects with the network failure, keeping its cause", async () => {
      const refused = new TypeError("fetch failed", { cause: Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" }) });
      fetchMock.mockRejectedValue(refused);
      await expect(new NetworkClient(makeConfig()).checkConnection()).rejects.toBe(refused);
    });

    it("gives up after its own shorter timeout", async () => {
      const timers = new Map<number, AbortController>();
      vi.spyOn(AbortSignal, "timeout").mockImplementation((ms) => {
        const controller = new AbortController();
        timers.set(ms, controller);
        return controller.signal;
      });
      fetchMock.mockImplementation((_url: string, options: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          options.signal?.addEventListener("abort", () => { reject(options.signal?.reason as DOMException); });
        }));
      const pending = new NetworkClient(makeConfig()).checkConnection();
      await vi.waitFor(() => { expect(fetchMock).toHaveBeenCalled(); });
      timers.get(10_000)?.abort(new DOMException("timed out", "TimeoutError"));
      await expect(pending).rejects.toThrow("the console did not respond within 10s");
      vi.restoreAllMocks();
    });
  });

  // ── Path guard ────────────────────────────────────────────────────

  describe("path guard", () => {
    let client: NetworkClient;

    beforeEach(() => {
      client = new NetworkClient(makeConfig());
      fetchMock.mockResolvedValue(mockResponse("{}"));
    });

    // The cases here are the client's view; tests/guard.test.ts covers the
    // guard itself.
    it.each([
      ["dot-segments", "/sites/../../../api/s/default/cmd/sitemgr"],
      ["encoded dot-segments", "/sites/s/devices/%2e%2e/%2e%2e/networks/n"],
      ["backslashes", "/sites/s/devices/x\\..\\..\\networks"],
      ["a fragment", "/sites/s/firewall/policies/x#/ignored"],
      ["an empty segment", "/sites//devices"],
    ])("rejects a path containing %s without sending it", async (_label, path) => {
      await expect(client.post(path, {})).rejects.toThrow(/request guard/);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("allows ordinary resource paths with an encoded query", async () => {
      await client.get("/sites/abc-123/devices?offset=0&filter=name.eq%28%27a%27%29");
      expect(fetchMock).toHaveBeenCalledWith(
        "https://192.168.1.1/proxy/network/integration/v1/sites/abc-123/devices?offset=0&filter=name.eq%28%27a%27%29",
        expect.any(Object)
      );
    });
  });
});
