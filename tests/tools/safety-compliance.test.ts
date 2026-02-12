import { describe, it, expect, beforeAll } from "vitest";
import { createMockServer, createMockClient } from "./_helpers.js";
import { registerAllTools } from "../../src/tools/index.js";

/**
 * Safety compliance meta-test.
 *
 * Registers every tool and inspects its schema, description, and annotations
 * to enforce the safety contract defined in CLAUDE.md:
 *
 *   1. Read-only tools must NOT have dryRun or confirm parameters
 *   2. Write tools (readOnlyHint: false) must have a dryRun parameter
 *   3. Destructive tools (destructiveHint: true) must also have a confirm
 *      parameter and a description starting with "DESTRUCTIVE:"
 *   4. Write tools must NOT be registered when readOnly = true
 */

interface ToolEntry {
  name: string;
  description: string;
  annotations: Record<string, unknown>;
  schemaKeys: string[];
}

function collectTools(readOnly: boolean): ToolEntry[] {
  const { server, configs } = createMockServer();
  const client = createMockClient();
  registerAllTools(server, client, readOnly);

  const tools: ToolEntry[] = [];
  for (const [name, config] of configs) {
    tools.push({
      name,
      description: config.description,
      annotations: config.annotations,
      schemaKeys: Object.keys(config.schema),
    });
  }
  return tools;
}

describe("safety compliance", () => {
  let allTools: ToolEntry[];
  let readOnlyTools: ToolEntry[];
  let writeTools: ToolEntry[];
  let destructiveTools: ToolEntry[];

  beforeAll(() => {
    allTools = collectTools(false);
    readOnlyTools = allTools.filter((t) => t.annotations.readOnlyHint === true);
    writeTools = allTools.filter((t) => t.annotations.readOnlyHint === false);
    destructiveTools = allTools.filter(
      (t) => t.annotations.destructiveHint === true
    );
  });

  it("should register at least one tool in each category", () => {
    expect(readOnlyTools.length).toBeGreaterThan(0);
    expect(writeTools.length).toBeGreaterThan(0);
    expect(destructiveTools.length).toBeGreaterThan(0);
  });

  // ── Read-only tools: no safety guards ──────────────────────────────

  describe("read-only tools", () => {
    it("should NOT have a dryRun parameter", () => {
      const violations = readOnlyTools.filter((t) =>
        t.schemaKeys.includes("dryRun")
      );
      expect(violations.map((t) => t.name)).toEqual([]);
    });

    it("should NOT have a confirm parameter", () => {
      const violations = readOnlyTools.filter((t) =>
        t.schemaKeys.includes("confirm")
      );
      expect(violations.map((t) => t.name)).toEqual([]);
    });

    it("should have destructiveHint = false", () => {
      const violations = readOnlyTools.filter(
        (t) => t.annotations.destructiveHint !== false
      );
      expect(violations.map((t) => t.name)).toEqual([]);
    });
  });

  // ── Write tools: must have dryRun ──────────────────────────────────

  describe("write tools", () => {
    it("should have a dryRun parameter", () => {
      const violations = writeTools.filter(
        (t) => !t.schemaKeys.includes("dryRun")
      );
      expect(violations.map((t) => t.name)).toEqual([]);
    });
  });

  // ── Destructive tools: must have confirm + DESTRUCTIVE: prefix ─────

  describe("destructive tools", () => {
    it("should have a confirm parameter", () => {
      const violations = destructiveTools.filter(
        (t) => !t.schemaKeys.includes("confirm")
      );
      expect(violations.map((t) => t.name)).toEqual([]);
    });

    it("should have a dryRun parameter", () => {
      const violations = destructiveTools.filter(
        (t) => !t.schemaKeys.includes("dryRun")
      );
      expect(violations.map((t) => t.name)).toEqual([]);
    });

    it("should have description starting with DESTRUCTIVE:", () => {
      const violations = destructiveTools.filter(
        (t) => !t.description.startsWith("DESTRUCTIVE:")
      );
      expect(violations.map((t) => t.name)).toEqual([]);
    });

    it("should have idempotentHint = false", () => {
      const violations = destructiveTools.filter(
        (t) => t.annotations.idempotentHint !== false
      );
      expect(violations.map((t) => t.name)).toEqual([]);
    });
  });

  // ── readOnly mode: write tools must not be registered ──────────────

  describe("readOnly mode", () => {
    it("should not register any write tools", () => {
      const readOnlyModeTools = collectTools(true);
      const leakedWriteTools = readOnlyModeTools.filter(
        (t) => t.annotations.readOnlyHint === false
      );
      expect(leakedWriteTools.map((t) => t.name)).toEqual([]);
    });

    it("should still register all read-only tools", () => {
      const readOnlyModeTools = collectTools(true);
      const readOnlyNames = readOnlyModeTools
        .filter((t) => t.annotations.readOnlyHint === true)
        .map((t) => t.name)
        .sort();
      const expectedNames = readOnlyTools.map((t) => t.name).sort();
      expect(readOnlyNames).toEqual(expectedNames);
    });
  });
});
