import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NetworkClient } from "../src/client.js";

const config = { host: "console.example", apiKey: "test-secret", verifySsl: true, readOnly: true };
const query = { start: 1789272000, end: 1790000000, limit: 2 };
const row = { _id: "session-a", mac: "02:00:00:00:00:01", assoc_time: 1789990000,
  duration: 323, rx_bytes: 1234, tx_bytes: 567, roaming_sessions: [] };
const envelope = (data: unknown[]) => ({ meta: { rc: "ok" }, data });
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { "Content-Type": "application/json" },
});

describe("controller history transport", () => {
  const fetchMock = vi.fn();
  beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock); });
  afterEach(() => vi.unstubAllGlobals());

  it("uses the read-only POST session query, seconds, stable sort without the ignored offset parameter", async () => {
    fetchMock.mockResolvedValue(response(envelope([row])));
    const client = new NetworkClient(config);
    expect(await client.getClientSessions("default", { ...query, mac: "AA:BB:CC:DD:EE:FF" })).toEqual(envelope([row]));
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("https://console.example/proxy/network/api/s/default/stat/session");
    expect(options.method).toBe("POST");
    expect(JSON.parse(options.body)).toEqual({ type: "all", start: query.start, end: query.end,
      _limit: 2, _sort: "-assoc_time", mac: "aa:bb:cc:dd:ee:ff" });
    expect(options.redirect).toBe("error");
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  it("supports Cloud Connector for both Integration API and retained history", async () => {
    fetchMock.mockImplementation(() => Promise.resolve(response([])));
    const client = new NetworkClient({ ...config, host: "api.ui.com", consoleId: "ABC123:456" });
    await client.getClientHistory("default", 336);
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.ui.com/v1/connector/consoles/ABC123:456/proxy/network/v2/api/site/default/clients/history?withinHours=336");
    await client.get("/sites");
    expect(fetchMock.mock.calls[1][0]).toBe("https://api.ui.com/v1/connector/consoles/ABC123:456/proxy/network/integration/v1/sites");
  });

  it.each([
    { start: 1789272000000 }, { end: query.start }, { end: query.start + 32 * 86400 },
    { limit: 0 }, { limit: 1001 }, { mac: "x/../../cmd" },
  ])("rejects invalid queries before sending credentials: %j", async (change) => {
    await expect(new NetworkClient(config).getClientSessions("default", { ...query, ...change })).rejects.toThrow("Invalid session query");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects path traversal and invalid Cloud Connector host", async () => {
    await expect(new NetworkClient(config).getClientHistory("../other", 24)).rejects.toThrow("internalReference");
    expect(() => new NetworkClient({ ...config, consoleId: "ABC:123" })).toThrow("api.ui.com");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([401, 403, 404, 429, 500])("surfaces HTTP %i without leaking the response or calling it empty", async status => {
    fetchMock.mockResolvedValue(response({ token: "must-not-be-shown" }, status));
    await expect(new NetworkClient(config).getClientSessions("default", query)).rejects.toThrow(`HTTP ${status}`);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects legacy errors wrapped in HTTP 200", async () => {
    fetchMock.mockResolvedValue(response({ meta: { rc: "error", msg: "private" }, data: [] }));
    await expect(new NetworkClient(config).getClientSessions("default", query)).rejects.toThrow("meta.rc");
  });

  it("rejects HTML login responses", async () => {
    fetchMock.mockResolvedValue(new Response("<html>Login</html>", { headers: { "Content-Type": "text/html" } }));
    await expect(new NetworkClient(config).getClientHistory("default", 24)).rejects.toThrow("non-JSON");
  });

  it("bounds response size before JSON parsing", async () => {
    fetchMock.mockResolvedValue(new Response(" ".repeat(10000001), { headers: { "Content-Type": "application/json" } }));
    await expect(new NetworkClient(config).getClientHistory("default", 24)).rejects.toThrow("10 MB");
  });
});
