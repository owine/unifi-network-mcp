import { describe, it, expect } from "vitest";
import { createMockServer, createMockClient } from "./_helpers.js";
import { registerAllTools } from "../../src/tools/index.js";

describe("registerAllTools", () => {
  it("should register 68 tools in read-write mode", () => {
    const { server, handlers } = createMockServer();
    const client = createMockClient();
    registerAllTools(server, client, false);
    expect(handlers.size).toBe(68);
  });

  it("should register 35 tools in read-only mode", () => {
    const { server, handlers } = createMockServer();
    const client = createMockClient();
    registerAllTools(server, client, true);
    expect(handlers.size).toBe(35);
  });

  it("should call server.tool once per registered tool", () => {
    const { server, handlers } = createMockServer();
    const client = createMockClient();
    registerAllTools(server, client, false);
    expect(server.tool).toHaveBeenCalledTimes(handlers.size);
  });
});
