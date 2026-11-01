import { describe, it, expect } from "vitest";
import { createMockServer, createMockClient } from "./_helpers.js";
import { registerAllTools } from "../../src/tools/index.js";

describe("registerAllTools", () => {
  it("should register 79 tools in read-write mode", () => {
    const { server, handlers } = createMockServer();
    const client = createMockClient();
    registerAllTools(server, client, false);
    expect(handlers.size).toBe(79);
  });

  it("should register 46 tools in read-only mode", () => {
    const { server, handlers } = createMockServer();
    const client = createMockClient();
    registerAllTools(server, client, true);
    expect(handlers.size).toBe(46);
  });

  it("should call server.registerTool once per registered tool", () => {
    const { server, handlers } = createMockServer();
    const client = createMockClient();
    registerAllTools(server, client, false);
    expect(server.registerTool).toHaveBeenCalledTimes(handlers.size);
  });
});
