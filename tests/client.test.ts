import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NetworkClient, withCallSignal } from "../src/client.js";
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
  }: { ok?: boolean; status?: number; contentType?: string } = {}
): Response {
  return {
    ok,
    status,
    headers: new Headers({ "content-type": contentType }),
    json: () => Promise.resolve(JSON.parse(body)),
    text: () => Promise.resolve(body),
  } as Response;
}

describe("NetworkClient", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let savedTlsEnv: string | undefined;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    savedTlsEnv = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (savedTlsEnv === undefined) {
      delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    } else {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = savedTlsEnv;
    }
  });

  // ── Constructor ────────────────────────────────────────────────────

  describe("constructor", () => {
    it("should build the correct base URL from host", () => {
      fetchMock.mockResolvedValue(mockResponse("{}"));
      const client = new NetworkClient(makeConfig({ host: "10.0.0.1" }));
      client.get("/test");
      expect(fetchMock).toHaveBeenCalledWith(
        "https://10.0.0.1/proxy/network/integration/v1/test",
        expect.any(Object)
      );
    });

    it("should set X-API-KEY header from config", () => {
      fetchMock.mockResolvedValue(mockResponse("{}"));
      const client = new NetworkClient(makeConfig({ apiKey: "my-secret" }));
      client.get("/test");
      const [, options] = fetchMock.mock.calls[0];
      expect(options.headers["X-API-KEY"]).toBe("my-secret");
    });

    it("should set NODE_TLS_REJECT_UNAUTHORIZED=0 when verifySsl is false", () => {
      new NetworkClient(makeConfig({ verifySsl: false }));
      expect(process.env.NODE_TLS_REJECT_UNAUTHORIZED).toBe("0");
    });

    it("should NOT set NODE_TLS_REJECT_UNAUTHORIZED when verifySsl is true", () => {
      new NetworkClient(makeConfig({ verifySsl: true }));
      expect(process.env.NODE_TLS_REJECT_UNAUTHORIZED).toBeUndefined();
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
      await client.post("/sites", { name: "test" });
      const [, options] = fetchMock.mock.calls[0];
      expect(options.method).toBe("POST");
      expect(options.body).toBe(JSON.stringify({ name: "test" }));
    });

    it("put() should call fetch with PUT and JSON body", async () => {
      fetchMock.mockResolvedValue(mockResponse("{}"));
      await client.put("/sites/1", { name: "updated" });
      const [, options] = fetchMock.mock.calls[0];
      expect(options.method).toBe("PUT");
      expect(options.body).toBe(JSON.stringify({ name: "updated" }));
    });

    it("patch() should call fetch with PATCH and JSON body", async () => {
      fetchMock.mockResolvedValue(mockResponse("{}"));
      await client.patch("/sites/1", { name: "patched" });
      const [, options] = fetchMock.mock.calls[0];
      expect(options.method).toBe("PATCH");
      expect(options.body).toBe(JSON.stringify({ name: "patched" }));
    });

    it("delete() should call fetch with DELETE and no body", async () => {
      fetchMock.mockResolvedValue(mockResponse("{}"));
      await client.delete("/sites/1");
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
      const result = await client.get("/test");
      expect(result).toEqual({ data: [1, 2, 3] });
    });

    it("should return text for non-JSON content-type", async () => {
      fetchMock.mockResolvedValue(
        mockResponse("plain text", { contentType: "text/plain" })
      );
      const result = await client.get("/test");
      expect(result).toBe("plain text");
    });

    it("should throw an error for non-ok responses", async () => {
      fetchMock.mockResolvedValue(
        mockResponse("Not Found", { ok: false, status: 404 })
      );
      await expect(client.get("/missing")).rejects.toThrow(
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
      await expect(client.get("/test")).rejects.toThrow("fetch failed");
    });

    it("propagates fetch TypeError for post()", async () => {
      fetchMock.mockRejectedValue(new TypeError("fetch failed"));
      await expect(client.post("/test", {})).rejects.toThrow("fetch failed");
    });

    it("propagates fetch TypeError for put()", async () => {
      fetchMock.mockRejectedValue(new TypeError("fetch failed"));
      await expect(client.put("/test", {})).rejects.toThrow("fetch failed");
    });

    it("propagates fetch TypeError for patch()", async () => {
      fetchMock.mockRejectedValue(new TypeError("fetch failed"));
      await expect(client.patch("/test", {})).rejects.toThrow("fetch failed");
    });

    it("propagates fetch TypeError for delete()", async () => {
      fetchMock.mockRejectedValue(new TypeError("fetch failed"));
      await expect(client.delete("/test")).rejects.toThrow("fetch failed");
    });

    it("refuses redirects so the API key is never re-sent elsewhere", async () => {
      fetchMock.mockResolvedValue(mockResponse("{}"));
      await client.get("/test");
      const [, options] = fetchMock.mock.calls[0];
      expect(options.redirect).toBe("error");
    });

    it("bounds every request with a timeout signal", async () => {
      fetchMock.mockResolvedValue(mockResponse("{}"));
      await client.post("/test", {});
      const [, options] = fetchMock.mock.calls[0];
      expect(options.signal).toBeInstanceOf(AbortSignal);
    });

    it("reports a timeout as an unknown outcome rather than a failure", async () => {
      fetchMock.mockRejectedValue(new DOMException("The operation was aborted due to timeout", "TimeoutError"));
      await expect(client.post("/test", {})).rejects.toThrow(/did not respond within 30s.*may still have been applied/);
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
        requestPath: "/integration/v1/sites/123", requestId: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
      }), { ok: false, status: 400 }));
      await expect(client.get("/sites/123")).rejects.toThrow(
        /^HTTP 400: Missing credentials \(api\.authentication\.missing-credentials; request 3fa85f64-5717-4562-b3fc-2c963f66afa6\)$/
      );
    });

    it("caps a JSON error message", async () => {
      fetchMock.mockResolvedValue(mockResponse(JSON.stringify({ code: "api.err", message: "x".repeat(10_000) }), { ok: false, status: 500 }));
      const err = await client.get("/sites").catch((e: Error) => e);
      expect((err as Error).message.length).toBeLessThan(600);
      expect((err as Error).message).toContain("(api.err)");
    });

    it("caps a non-JSON error body", async () => {
      const page = "<html><body>" + "Bad gateway ".repeat(200) + "</body></html>";
      fetchMock.mockResolvedValue(mockResponse(page, { ok: false, status: 502, contentType: "text/html" }));
      const err = await client.get("/sites").catch((e: Error) => e);
      expect((err as Error).message.length).toBeLessThan(520);
      expect((err as Error).message).toMatch(/^HTTP 502: <html><body>Bad gateway Bad gateway .*…$/);
    });
  });

  // ── Inside an MCP call ────────────────────────────────────────────

  describe("inside an MCP call", () => {
    // A controller that never answers: settle only when the request aborts.
    const hang = (_url: string, options: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        options.signal?.addEventListener("abort", () => reject(options.signal?.reason));
      });

    it("keeps the 30s timeout alongside the call's abort signal", async () => {
      const timer = new AbortController();
      vi.spyOn(AbortSignal, "timeout").mockReturnValue(timer.signal);
      fetchMock.mockImplementation(hang);
      const pending = withCallSignal(new AbortController().signal, () => new NetworkClient(makeConfig()).put("/sites/s/x", {}));
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

  // ── Path guard ────────────────────────────────────────────────────

  describe("path guard", () => {
    let client: NetworkClient;

    beforeEach(() => {
      client = new NetworkClient(makeConfig());
      fetchMock.mockResolvedValue(mockResponse("{}"));
    });

    it.each([
      ["dot-segments", "/sites/../../../api/s/default/cmd/sitemgr"],
      ["encoded dot-segments", "/sites/s/devices/%2e%2e/%2e%2e/networks/n"],
      ["backslashes", "/sites/s/devices/x\\..\\..\\networks"],
      ["a fragment", "/sites/s/firewall/policies/x#/ignored"],
      ["an empty segment", "/sites//devices"],
    ])("rejects a path containing %s without sending it", async (_label, path) => {
      await expect(client.post(path, {})).rejects.toThrow(/outside the Integration API/);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("allows ordinary resource paths with an encoded query", async () => {
      await client.get("/sites/abc-123/devices/d_1/interfaces/ports/3/actions?offset=0&filter=name.eq%28%27a%27%29");
      expect(fetchMock).toHaveBeenCalledWith(
        "https://192.168.1.1/proxy/network/integration/v1/sites/abc-123/devices/d_1/interfaces/ports/3/actions?offset=0&filter=name.eq%28%27a%27%29",
        expect.any(Object)
      );
    });
  });
});
