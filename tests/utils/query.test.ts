import { describe, it, expect } from "vitest";
import { buildQuery } from "../../src/utils/query.js";

describe("buildQuery", () => {
  it("returns empty string when no params", () => {
    expect(buildQuery({})).toBe("");
  });

  it("builds offset param", () => {
    expect(buildQuery({ offset: 10 })).toBe("?offset=10");
  });

  it("builds limit param", () => {
    expect(buildQuery({ limit: 50 })).toBe("?limit=50");
  });

  it("builds filter param", () => {
    const result = buildQuery({ filter: "name.like(test*)" });
    expect(result).toContain("filter=");
    expect(result.startsWith("?")).toBe(true);
  });

  it("combines multiple params", () => {
    const result = buildQuery({ offset: 0, limit: 25, filter: "active" });
    expect(result).toContain("offset=0");
    expect(result).toContain("limit=25");
    expect(result).toContain("filter=active");
    expect(result.startsWith("?")).toBe(true);
  });

  it("skips undefined values", () => {
    expect(buildQuery({ offset: undefined, limit: 10 })).toBe("?limit=10");
  });
});
