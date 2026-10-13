import { describe, it, expect, beforeAll } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { createMockServer, createMockClient } from "./tools/_helpers.js";
import { registerAllTools } from "../src/tools/index.js";

/**
 * Documentation drift meta-test.
 *
 * README.md lists every tool and makes count-free claims about them; CLAUDE.md
 * maps the source tree. Prose drifts from code unless something checks it, so
 * these checks derive everything from the registered tools and the files on
 * disk. The docs state no counts or versions to keep in sync: a number in prose
 * goes stale the day a tool is added, so the last block here fails if one
 * creeps back in.
 *
 * If a rewrite makes a pattern below stop matching, the test fails loudly rather
 * than silently passing — update the pattern, don't delete the check.
 */

const README = readFileSync(join(process.cwd(), "README.md"), "utf8");
const CLAUDE = readFileSync(join(process.cwd(), "CLAUDE.md"), "utf8");

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

/** The "## Tools" section, up to the next h2. */
function toolsSection(): string {
  const match = /^## Tools$([\s\S]*?)^## /m.exec(README);
  if (!match) throw new Error("README.md has no '## Tools' section");
  return match[1];
}

function documentedTools(): string[] {
  return [...toolsSection().matchAll(/^\| `(unifi_[a-z_]+)` \|/gm)].map((m) => m[1]);
}

describe("documentation drift", () => {
  let allTools: ToolEntry[];
  let readTools: ToolEntry[];
  let destructiveTools: ToolEntry[];

  beforeAll(() => {
    allTools = collectTools();
    readTools = allTools.filter((t) => t.annotations.readOnlyHint === true);
    destructiveTools = allTools.filter((t) => t.annotations.destructiveHint === true);
  });

  // ── Tool inventory ─────────────────────────────────────────────────

  describe("tool inventory", () => {
    it("should document every registered tool, and no others", () => {
      expect(documentedTools().sort()).toEqual(allTools.map((t) => t.name).sort());
    });

    it("should not document the same tool twice", () => {
      const documented = documentedTools();
      expect(documented).toEqual([...new Set(documented)]);
    });

    it("should mark exactly the destructive tools DESTRUCTIVE in the tool tables", () => {
      const marked = [...toolsSection().matchAll(/^\| `(unifi_[a-z_]+)` \| \*\*DESTRUCTIVE:\*\*/gm)]
        .map((m) => m[1])
        .sort();
      expect(marked).toEqual(destructiveTools.map((t) => t.name).sort());
    });
  });

  // ── Claims ─────────────────────────────────────────────────────────

  describe("count-free claims", () => {
    it("should back 'every read tool declares an outputSchema'", () => {
      expect(readTools.filter((t) => !t.hasOutputSchema).map((t) => t.name)).toEqual([]);
    });
  });

  // ── No numbers that go stale ───────────────────────────────────────

  describe("no stale-prone numbers", () => {
    it("should keep tool counts out of the README", () => {
      expect(README).not.toMatch(/\b\d+ (?:of the \d+ )?(?:read |write )?tools\b|\(all \d+ of them|^#{2,3} .+\(\d+(?: total)?\)$/m);
    });

    it("should name every source file in CLAUDE.md's architecture map", () => {
      const sources = (readdirSync(join(process.cwd(), "src"), { recursive: true }) as string[])
        .filter((file) => file.endsWith(".ts"))
        .map((file) => basename(file));
      expect(sources.filter((file) => !CLAUDE.includes(file))).toEqual([]);
    });

    it("should keep tool counts and the pinned Node version out of CLAUDE.md", () => {
      expect(CLAUDE).not.toMatch(/\(\d+ tools?\)|\b\d+ tools\b|`\.nvmrc` \(\d/);
    });
  });
});
