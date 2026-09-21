import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NetworkClient } from "../src/client.js";
import { registerAllTools } from "../src/tools/index.js";
import { createMockServer, createMockClient, mockFn, parseInputSchema } from "./tools/_helpers.js";

const config = { host: "console.example", apiKey: "test-secret", verifySsl: true, readOnly: true };
const query = { start: 1789272000, end: 1790000000, offset: 0, limit: 2 };
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

  it("uses the read-only POST session query, seconds, stable sort and offset", async () => {
    fetchMock.mockResolvedValue(response(envelope([row])));
    const client = new NetworkClient(config);
    expect(await client.getClientSessions("default", { ...query, mac: "AA:BB:CC:DD:EE:FF" })).toEqual(envelope([row]));
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("https://console.example/proxy/network/api/s/default/stat/session");
    expect(options.method).toBe("POST");
    expect(JSON.parse(options.body)).toEqual({ type: "all", start: query.start, end: query.end,
      _start: 0, _limit: 2, _sort: "-assoc_time", mac: "aa:bb:cc:dd:ee:ff" });
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
    { offset: -1 }, { limit: 0 }, { limit: 1001 }, { mac: "x/../../cmd" },
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

describe("history tools", () => {
  function setup() {
    const server = createMockServer();
    const client = createMockClient();
    registerAllTools(server.server, client, true);
    return { ...server, client };
  }

  it("registers both with read-only annotations and output schemas", () => {
    const { configs } = setup();
    for (const name of ["unifi_list_client_sessions", "unifi_list_client_history"]) {
      expect(configs.get(name)?.annotations.readOnlyHint).toBe(true);
      expect(configs.get(name)?.annotations.destructiveHint).toBe(false);
      expect(configs.get(name)?.outputSchema).toBeDefined();
    }
  });

  it("returns structured inventory separately from session records", async () => {
    const { client, handlers } = setup();
    mockFn(client, "getClientHistory").mockResolvedValue([{ mac: row.mac, last_seen: 1789990000, hostname: "iPhone" }]);
    const result = await handlers.get("unifi_list_client_history")!({ siteReference: "default", withinHours: 336 });
    expect(result.structuredContent.count).toBe(1);
    expect(result.structuredContent.coverage).toContain("not a complete session log");
  });

  it("paginates a full page and reports exhaustion only on a short page", async () => {
    const { client, handlers } = setup();
    mockFn(client, "getClientSessions").mockResolvedValueOnce(envelope([row, { ...row, _id: "session-b" }])).mockResolvedValueOnce(envelope([]));
    const handler = handlers.get("unifi_list_client_sessions")!;
    const first = await handler({ siteReference: "default", ...query });
    expect(first.structuredContent).toMatchObject({ count: 2, hasMore: true, nextOffset: 2 });
    const second = await handler({ siteReference: "default", ...query, offset: 2 });
    expect(second.structuredContent).toMatchObject({ count: 0, hasMore: false, nextOffset: null });
  });

  it("preserves null hostnames seen on real disconnected clients", async () => {
    const { client, handlers } = setup();
    mockFn(client, "getClientSessions").mockResolvedValue(envelope([{ ...row, hostname: null }]));
    const result = await handlers.get("unifi_list_client_sessions")!({ siteReference: "default", ...query });
    expect(result.isError).toBeUndefined();
    expect(result.structuredContent.data[0].hostname).toBeNull();
  });

  it.each([envelope([row, row]), { data: [] }, { meta: { rc: "error" }, data: [] }])("rejects malformed or duplicate sessions", async data => {
    const { client, handlers } = setup();
    mockFn(client, "getClientSessions").mockResolvedValue(data);
    expect((await handlers.get("unifi_list_client_sessions")!({ siteReference: "default", ...query })).isError).toBe(true);
  });

  it("validates milliseconds, bounds, MAC and defaults through the MCP schema", () => {
    const { configs } = setup();
    const schema = parseInputSchema(configs, "unifi_list_client_sessions");
    expect(schema.safeParse({ siteReference: "default", start: query.start * 1000, end: query.end * 1000 }).success).toBe(false);
    expect(schema.parse({ siteReference: "default", start: query.start, end: query.end })).toMatchObject({ offset: 0, limit: 200 });
  });

  it("propagates access failures for both tools", async () => {
    const { client, handlers } = setup();
    mockFn(client, "getClientSessions").mockRejectedValue(new Error("HTTP 403"));
    mockFn(client, "getClientHistory").mockRejectedValue(new Error("HTTP 403"));
    expect((await handlers.get("unifi_list_client_sessions")!({ siteReference: "default", ...query })).isError).toBe(true);
    expect((await handlers.get("unifi_list_client_history")!({ siteReference: "default", withinHours: 24 })).isError).toBe(true);
  });
});
