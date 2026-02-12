import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NetworkClient } from "../src/client.js";
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
});
