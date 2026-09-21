import { describe, expect, it } from "vitest";
import { registerAllTools } from "../../src/tools/index.js";
import { createMockServer, createMockClient, mockFn, parseInputSchema } from "./_helpers.js";

const query = { start: 1789272000, end: 1790000000, limit: 2 };
const row = { _id: "session-a", mac: "02:00:00:00:00:01", assoc_time: 1789990000,
  duration: 323, rx_bytes: 1234, tx_bytes: 567, roaming_sessions: [] };
const envelope = (data: unknown[]) => ({ meta: { rc: "ok" }, data });

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

  it("flags full results for time-window splitting instead of claiming offset pagination works", async () => {
    const { client, handlers } = setup();
    mockFn(client, "getClientSessions").mockResolvedValueOnce(envelope([row, { ...row, _id: "session-b" }])).mockResolvedValueOnce(envelope([row]));
    const handler = handlers.get("unifi_list_client_sessions")!;
    expect((await handler({ siteReference: "default", ...query })).structuredContent).toMatchObject({ count: 2, mayBeTruncated: true });
    expect((await handler({ siteReference: "default", ...query })).structuredContent).toMatchObject({ count: 1, mayBeTruncated: false });
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
    expect(schema.parse({ siteReference: "default", start: query.start, end: query.end })).toMatchObject({ limit: 1000 });
  });

  it("propagates access failures for both tools", async () => {
    const { client, handlers } = setup();
    mockFn(client, "getClientSessions").mockRejectedValue(new Error("HTTP 403"));
    mockFn(client, "getClientHistory").mockRejectedValue(new Error("HTTP 403"));
    expect((await handlers.get("unifi_list_client_sessions")!({ siteReference: "default", ...query })).isError).toBe(true);
    expect((await handlers.get("unifi_list_client_history")!({ siteReference: "default", withinHours: 24 })).isError).toBe(true);
  });
});
