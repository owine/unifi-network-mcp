import { beforeEach, describe, expect, it, vi } from "vitest";
import { NetworkClient } from "../src/client.js";

const fetchMock = vi.hoisted(() => vi.fn());
vi.mock("undici", async (importOriginal) => ({ ...await importOriginal<typeof import("undici")>(), fetch: fetchMock }));

const config = { host: "console.example", apiKey: "test-secret", verifySsl: true, readOnly: true };
const envelope = (data: unknown[]) => ({ meta: { rc: "ok" }, data });
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { "Content-Type": "application/json" },
});

describe("classic controller transport", () => {
  beforeEach(() => { fetchMock.mockReset(); });

  it("GETs the collection outside the Integration API, with the API key and no body", async () => {
    fetchMock.mockResolvedValue(response(envelope([{ _id: "c1" }])));
    expect(await new NetworkClient(config).getClassic("default", "firewallrule")).toEqual(envelope([{ _id: "c1" }]));
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("https://console.example/proxy/network/api/s/default/rest/firewallrule");
    expect(options.method).toBe("GET");
    expect(options.body).toBeUndefined();
    expect(options.headers["X-API-KEY"]).toBe("test-secret");
    expect(options.redirect).toBe("error");
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  it("goes through the Cloud Connector", async () => {
    fetchMock.mockResolvedValue(response(envelope([])));
    await new NetworkClient({ ...config, host: "api.ui.com", consoleId: "ABC123" }).getClassic("default", "networkconf");
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.ui.com/v1/connector/consoles/ABC123/proxy/network/api/s/default/rest/networkconf");
  });

  it.each([401, 403, 404, 500])("surfaces HTTP %i without leaking the response or calling it empty", async (status) => {
    fetchMock.mockResolvedValue(response({ x_passphrase: "FAKE-SECRET-DO-NOT-USE" }, status));
    const attempt = new NetworkClient(config).getClassic("default", "networkconf");
    await expect(attempt).rejects.toThrow(`Classic controller API returned HTTP ${status}`);
    await expect(attempt).rejects.toThrow("not an empty result");
    await expect(attempt).rejects.not.toThrow("FAKE-SECRET");
  });

  it("rejects legacy errors wrapped in HTTP 200", async () => {
    fetchMock.mockResolvedValue(response({ meta: { rc: "error", msg: "api.err.NoPermission" }, data: [] }));
    await expect(new NetworkClient(config).getClassic("default", "firewallgroup")).rejects.toThrow("meta.rc");
  });

  it("rejects HTML login responses", async () => {
    fetchMock.mockResolvedValue(new Response("<html>Login</html>", { headers: { "Content-Type": "text/html" } }));
    await expect(new NetworkClient(config).getClassic("default", "networkconf")).rejects.toThrow("non-JSON");
  });

  it("reports a timed-out read as safe to retry", async () => {
    fetchMock.mockResolvedValue(new Response(new ReadableStream({
      pull: () => Promise.reject(new DOMException("The operation was aborted due to timeout", "TimeoutError")),
    }), { headers: { "Content-Type": "application/json" } }));
    await expect(new NetworkClient(config).getClassic("default", "networkconf"))
      .rejects.toThrow(/did not respond within 25s\. Retry/);
  });

  it("bounds response size before JSON parsing", async () => {
    fetchMock.mockResolvedValue(new Response(" ".repeat(10000001), { headers: { "Content-Type": "application/json" } }));
    await expect(new NetworkClient(config).getClassic("default", "networkconf")).rejects.toThrow("10 MB");
  });

  it("rejects path traversal in the site reference before sending credentials", async () => {
    await expect(new NetworkClient(config).getClassic("../other", "networkconf")).rejects.toThrow("internalReference");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
