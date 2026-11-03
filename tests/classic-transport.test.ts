import { beforeEach, describe, expect, it, vi } from "vitest";
import { NetworkClient } from "../src/client.js";

const fetchMock = vi.hoisted(() => vi.fn());
vi.mock("undici", async (importOriginal) => ({ ...await importOriginal<typeof import("undici")>(), fetch: fetchMock }));

const FAKE = "FAKE-SECRET-DO-NOT-USE";
const config = { host: "console.example", apiKey: "test-secret", verifySsl: true, readOnly: true };
const envelope = (data: unknown[]) => ({ meta: { rc: "ok" }, data });
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { "Content-Type": "application/json" },
});
const socketClosed = (code: string) => Object.assign(new TypeError("fetch failed"), {
  cause: Object.assign(new Error("other side closed"), { code }),
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
    fetchMock.mockResolvedValue(response({ x_passphrase: FAKE }, status));
    const attempt = new NetworkClient(config).getClassic("default", "networkconf");
    await expect(attempt).rejects.toThrow(`Classic controller API returned HTTP ${status}`);
    await expect(attempt).rejects.toThrow("not an empty result");
    await expect(attempt).rejects.not.toThrow(FAKE);
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

  it("retries once on a fresh connection when the console closed an idle one", async () => {
    fetchMock.mockRejectedValueOnce(socketClosed("ECONNRESET")).mockResolvedValueOnce(response(envelope([{ _id: "c1" }])));
    await expect(new NetworkClient(config).getClassic("default", "networkconf")).resolves.toEqual(envelope([{ _id: "c1" }]));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("gives up after one retry", async () => {
    fetchMock.mockRejectedValue(socketClosed("UND_ERR_SOCKET"));
    await expect(new NetworkClient(config).getClassic("default", "networkconf")).rejects.toThrow("fetch failed");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry a failure that is not a closed socket", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    await expect(new NetworkClient(config).getClassic("default", "networkconf")).rejects.toThrow("fetch failed");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reports malformed JSON without quoting the body, which can hold credentials", async () => {
    fetchMock.mockResolvedValue(new Response(`{"x_passphrase":"${FAKE}"`, { headers: { "Content-Type": "application/json" } }));
    const attempt = new NetworkClient(config).getClassic("default", "networkconf");
    await expect(attempt).rejects.toThrow("returned malformed JSON");
    await expect(attempt).rejects.not.toThrow(FAKE);
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

describe("classic port-forward and settings transport", () => {
  beforeEach(() => { fetchMock.mockReset(); });

  it("GETs the site settings", async () => {
    fetchMock.mockResolvedValue(response(envelope([{ key: "mgmt" }])));
    await new NetworkClient(config).getClassicSettings("whalehead");
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("https://console.example/proxy/network/api/s/whalehead/get/setting");
    expect(options.method).toBe("GET");
    expect(options.body).toBeUndefined();
  });

  it("goes through the Cloud Connector", async () => {
    fetchMock.mockImplementation(() => Promise.resolve(response(envelope([]))));
    const client = new NetworkClient({ ...config, host: "api.ui.com", consoleId: "ABC123" });
    await client.getClassic("default", "portforward");
    await client.getClassicSettings("default");
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "https://api.ui.com/v1/connector/consoles/ABC123/proxy/network/api/s/default/rest/portforward",
      "https://api.ui.com/v1/connector/consoles/ABC123/proxy/network/api/s/default/get/setting",
    ]);
  });

  it("surfaces an HTTP error on the settings read without leaking the response", async () => {
    fetchMock.mockResolvedValue(response({ x_ssh_password: FAKE }, 403));
    const attempt = new NetworkClient(config).getClassicSettings("default");
    await expect(attempt).rejects.toThrow("Classic controller API returned HTTP 403");
    await expect(attempt).rejects.not.toThrow(FAKE);
  });

  it("reports malformed settings JSON without quoting the body", async () => {
    fetchMock.mockResolvedValue(new Response(`{"meta":{"rc":"ok"},"data":[{"key":"mgmt","x_ssh_password":"${FAKE}",?}]}`, {
      headers: { "Content-Type": "application/json" },
    }));
    const attempt = new NetworkClient(config).getClassicSettings("default");
    await expect(attempt).rejects.toThrow("Classic controller API returned malformed JSON");
    await expect(attempt).rejects.not.toThrow(/SECRET|DO-NOT|USE/);
  });

  it("retries the settings read once when the console closed an idle connection", async () => {
    fetchMock.mockRejectedValueOnce(socketClosed("ECONNRESET")).mockResolvedValueOnce(response(envelope([{ key: "mgmt" }])));
    await expect(new NetworkClient(config).getClassicSettings("default")).resolves.toEqual(envelope([{ key: "mgmt" }]));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects path traversal in the site reference before sending credentials", async () => {
    await expect(new NetworkClient(config).getClassic("../other", "portforward")).rejects.toThrow("internalReference");
    await expect(new NetworkClient(config).getClassicSettings("a/b")).rejects.toThrow("internalReference");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
