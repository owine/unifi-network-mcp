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

  it("GETs port forwards from the legacy /api/s route under the Network application, with the API key and no body", async () => {
    fetchMock.mockResolvedValue(response(envelope([{ _id: "f1" }])));
    expect(await new NetworkClient(config).getClassic("default", "portforward")).toEqual(envelope([{ _id: "f1" }]));
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("https://console.example/proxy/network/api/s/default/rest/portforward");
    expect(options.method).toBe("GET");
    expect(options.body).toBeUndefined();
    expect(options.headers["X-API-KEY"]).toBe("test-secret");
    expect(options.redirect).toBe("error");
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  it("GETs the site settings", async () => {
    fetchMock.mockResolvedValue(response(envelope([{ key: "mgmt" }])));
    await new NetworkClient(config).getClassicSettings("whalehead");
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("https://console.example/proxy/network/api/s/whalehead/get/setting");
    expect(options.method).toBe("GET");
  });

  it("goes through the Cloud Connector, and says so", async () => {
    fetchMock.mockImplementation(() => Promise.resolve(response(envelope([]))));
    const client = new NetworkClient({ ...config, host: "api.ui.com", consoleId: "ABC123" });
    expect(client.viaCloudConnector).toBe(true);
    await client.getClassic("default", "portforward");
    await client.getClassicSettings("default");
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "https://api.ui.com/v1/connector/consoles/ABC123/proxy/network/api/s/default/rest/portforward",
      "https://api.ui.com/v1/connector/consoles/ABC123/proxy/network/api/s/default/get/setting",
    ]);
  });

  it("is not via the Cloud Connector against a local console, even with a console ID", () => {
    expect(new NetworkClient(config).viaCloudConnector).toBe(false);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(new NetworkClient({ ...config, consoleId: "ABC123" }).viaCloudConnector).toBe(false);
  });

  it.each([401, 403, 404, 500])("surfaces HTTP %i without leaking the response or calling it empty", async (status) => {
    fetchMock.mockResolvedValue(response({ x_ssh_password: "FAKE-SECRET-DO-NOT-USE" }, status));
    const attempt = new NetworkClient(config).getClassicSettings("default");
    await expect(attempt).rejects.toThrow(`Classic controller API returned HTTP ${status}`);
    await expect(attempt).rejects.toThrow("not an empty result");
    await expect(attempt).rejects.not.toThrow("FAKE-SECRET");
  });

  it("rejects legacy errors wrapped in HTTP 200", async () => {
    fetchMock.mockResolvedValue(response({ meta: { rc: "error", msg: "api.err.NoPermission" }, data: [] }));
    await expect(new NetworkClient(config).getClassic("default", "portforward")).rejects.toThrow("meta.rc");
  });

  it("rejects HTML login responses", async () => {
    fetchMock.mockResolvedValue(new Response("<html>Login</html>", { headers: { "Content-Type": "text/html" } }));
    await expect(new NetworkClient(config).getClassicSettings("default")).rejects.toThrow("non-JSON");
  });

  it("reports malformed JSON without quoting the body, which can hold credentials", async () => {
    fetchMock.mockResolvedValue(new Response('{"meta":{"rc":"ok"},"data":[{"key":"mgmt","x_ssh_password":"FAKE-SECRET-DO-NOT-USE",?}]}', {
      headers: { "Content-Type": "application/json" },
    }));
    const attempt = new NetworkClient(config).getClassicSettings("default");
    await expect(attempt).rejects.toThrow("Classic controller API returned malformed JSON");
    await expect(attempt).rejects.not.toThrow(/SECRET|DO-NOT|USE/);
  });

  it("reports a timed-out read as safe to retry", async () => {
    fetchMock.mockResolvedValue(new Response(new ReadableStream({
      pull: () => Promise.reject(new DOMException("The operation was aborted due to timeout", "TimeoutError")),
    }), { headers: { "Content-Type": "application/json" } }));
    await expect(new NetworkClient(config).getClassic("default", "portforward"))
      .rejects.toThrow(/did not respond within 25s\. Retry/);
  });

  it("bounds response size before JSON parsing", async () => {
    fetchMock.mockResolvedValue(new Response(" ".repeat(10000001), { headers: { "Content-Type": "application/json" } }));
    await expect(new NetworkClient(config).getClassicSettings("default")).rejects.toThrow("10 MB");
  });

  it("rejects path traversal in the site reference before sending credentials", async () => {
    await expect(new NetworkClient(config).getClassic("../other", "portforward")).rejects.toThrow("internalReference");
    await expect(new NetworkClient(config).getClassicSettings("a/b")).rejects.toThrow("internalReference");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
