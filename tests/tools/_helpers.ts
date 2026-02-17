import { vi, expect } from "vitest";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { NetworkClient } from "../../src/client.js";

interface ToolConfig {
  description: string;
  annotations: Record<string, unknown>;
  schema: Record<string, unknown>;
}

/**
 * Captures tool handlers registered via server.tool().
 * Returns maps from tool name → handler function and tool name → config.
 *
 * server.tool() is called as:
 *   server.tool(name, description, schema, annotations, handler)
 */
export function createMockServer() {
  const handlers = new Map<string, (...args: any[]) => any>();
  const configs = new Map<string, ToolConfig>();
  const server = {
    tool: vi.fn((...args: any[]) => {
      const name = args[0] as string;
      const description = args[1] as string;
      // args[2] = schema, args[3] = annotations, args[4] = handler
      const schema = args[2] as Record<string, unknown>;
      const annotations = args[3] as Record<string, unknown>;
      const handler = args[args.length - 1] as (...a: any[]) => any;
      configs.set(name, { description, annotations, schema });
      handlers.set(name, handler);
    }),
  } as unknown as McpServer;
  return { server, handlers, configs };
}

/**
 * Creates a NetworkClient with all methods mocked.
 */
export function createMockClient() {
  return {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  } as unknown as NetworkClient;
}

/** Type-safe way to access mock fns on the mock client */
export function mockFn(client: NetworkClient, method: keyof NetworkClient) {
  return (client as any)[method] as ReturnType<typeof vi.fn>;
}

interface ToolResult {
  isError?: boolean;
  content: { type: string; text?: string }[];
}

/** Assert a tool result is a success containing the given substring */
export function expectSuccess(result: ToolResult, substring: string) {
  expect(result.isError).toBeUndefined();
  expect(result.content[0].text).toContain(substring);
}

/** Assert a tool result is an error with text starting with "Error:" */
export function expectError(result: ToolResult) {
  expect(result.isError).toBe(true);
  expect(result.content[0].text).toMatch(/^Error:/);
}

/**
 * Extract schema from a tool config and wrap it in z.object() for validation testing.
 * Returns a Zod object schema that can be used with .safeParse().
 */
export function parseInputSchema(
  configs: Map<string, ToolConfig>,
  toolName: string
) {
  const config = configs.get(toolName);
  if (!config?.schema) {
    throw new Error(`Tool "${toolName}" has no schema`);
  }
  return z.object(config.schema as Record<string, z.ZodType>);
}
