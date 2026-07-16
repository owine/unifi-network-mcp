import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createMockServer, createMockClient } from "./tools/_helpers.js";
import { registerAllTools } from "../src/tools/index.js";

/**
 * Documentation drift meta-test.
 *
 * README.md states an inventory of tools and several exact counts. Those are
 * prose, so nothing but this test stops them drifting from the code — which is
 * precisely what happened before (a tool description documented a field the
 * API never returned, and the Node version contradicted package.json).
 *
 * Every number asserted here is derived from the registered tools, never
 * hardcoded twice. Add a tool and forget the README, and this fails.
 *
 * If a rewrite makes a regex below stop matching, the test fails loudly rather
 * than silently passing — update the pattern, don't delete the check.
 */

const README = readFileSync(join(process.cwd(), "README.md"), "utf8");

interface ToolEntry {
  name: string;
  annotations: Record<string, unknown>;
  hasOutputSchema: boolean;
}

function collectTools(): ToolEntry[] {
  const { server, configs } = createMockServer();
  registerAllTools(server, createMockClient(), false);

  return [...configs].map(([name, config]) => ({
    name,
    annotations: config.annotations,
    hasOutputSchema: config.outputSchema !== undefined,
  }));
}

/** Pull a single number out of the README, failing clearly if absent. */
function readmeNumber(pattern: RegExp): number {
  const match = pattern.exec(README);
  if (!match) {
    throw new Error(
      `README.md has no text matching ${String(pattern)} — the wording changed. ` +
        `Update this pattern so the count stays covered.`
    );
  }
  return Number(match[1]);
}

/** The "## Tools (N total)" section, up to the next h2. */
function toolsSection(): string {
  const match = /^## Tools \(\d+ total\)$([\s\S]*?)^## /m.exec(README);
  if (!match) throw new Error("README.md has no '## Tools (N total)' section");
  return match[1];
}

describe("documentation drift", () => {
  let allTools: ToolEntry[];
  let readTools: ToolEntry[];
  let writeTools: ToolEntry[];
  let destructiveTools: ToolEntry[];

  beforeAll(() => {
    allTools = collectTools();
    readTools = allTools.filter((t) => t.annotations.readOnlyHint === true);
    writeTools = allTools.filter((t) => t.annotations.readOnlyHint === false);
    destructiveTools = allTools.filter(
      (t) => t.annotations.destructiveHint === true
    );
  });

  // ── Tool inventory ─────────────────────────────────────────────────

  describe("tool inventory", () => {
    it("should document every registered tool, and no others", () => {
      const documented = [
        ...toolsSection().matchAll(/^\| `(unifi_[a-z_]+)` \|/gm),
      ]
        .map((m) => m[1])
        .sort();
      const registered = allTools.map((t) => t.name).sort();

      expect(documented).toEqual(registered);
    });

    it("should not document the same tool twice", () => {
      const documented = [
        ...toolsSection().matchAll(/^\| `(unifi_[a-z_]+)` \|/gm),
      ].map((m) => m[1]);

      expect(documented).toEqual([...new Set(documented)]);
    });

    it("should give each domain heading a count matching its table rows", () => {
      // "### Devices (8)" must be followed by exactly 8 tool rows.
      const chunks = toolsSection().split(/^### /m).slice(1);
      expect(chunks.length).toBeGreaterThan(0);

      const mismatches = chunks
        .map((chunk) => {
          const heading = /^(.+?) \((\d+)\)$/m.exec(chunk);
          if (!heading) {
            throw new Error(
              `Tools section has a '### ' heading without a '(count)': ${chunk.split("\n")[0]}`
            );
          }
          return {
            heading: heading[1],
            claimed: Number(heading[2]),
            actual: [...chunk.matchAll(/^\| `unifi_[a-z_]+` \|/gm)].length,
          };
        })
        .filter((s) => s.claimed !== s.actual);

      expect(mismatches).toEqual([]);
    });
  });

  // ── Headline counts ────────────────────────────────────────────────

  describe("headline counts", () => {
    it("should state the real tool total in the intro", () => {
      expect(readmeNumber(/Provides (\d+) tools/)).toBe(allTools.length);
    });

    it("should state the real tool total in the Tools heading", () => {
      expect(readmeNumber(/## Tools \((\d+) total\)/)).toBe(allTools.length);
    });
  });

  // ── Safety claims ──────────────────────────────────────────────────

  describe("safety claims", () => {
    it("should state the real number of write tools accepting dryRun", () => {
      expect(readmeNumber(/All (\d+) write tools accept/)).toBe(
        writeTools.length
      );
    });

    it("should state the real number of destructive tools requiring confirm", () => {
      expect(readmeNumber(/\(all (\d+) of them/)).toBe(destructiveTools.length);
    });
  });

  // ── Structured output claims ───────────────────────────────────────

  describe("structured output claims", () => {
    it("should state the real number of tools declaring an outputSchema", () => {
      const withSchema = allTools.filter((t) => t.hasOutputSchema);
      expect(readmeNumber(/^(\d+) of the \d+ tools/m)).toBe(withSchema.length);
    });

    it("should state the real tool total alongside the outputSchema count", () => {
      expect(readmeNumber(/^\d+ of the (\d+) tools/m)).toBe(allTools.length);
    });

    it("should state the real number of read tools declaring an outputSchema", () => {
      const readWithSchema = readTools.filter((t) => t.hasOutputSchema);
      expect(readmeNumber(/all (\d+) read tools/)).toBe(readWithSchema.length);
    });

    it("should state the real number of write tools declaring an outputSchema", () => {
      const writeWithSchema = writeTools.filter((t) => t.hasOutputSchema);
      expect(readmeNumber(/plus the (\d+) write tools/)).toBe(
        writeWithSchema.length
      );
    });
  });
});
