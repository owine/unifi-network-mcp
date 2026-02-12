import { describe, it, expect } from "vitest";
import { formatSuccess, formatError } from "../../src/utils/responses.js";

describe("formatSuccess", () => {
  it("wraps data as JSON text content", () => {
    const result = formatSuccess({ id: "abc", name: "test" });
    expect(result).toEqual({
      content: [
        { type: "text", text: JSON.stringify({ id: "abc", name: "test" }, null, 2) },
      ],
    });
  });

  it("handles arrays", () => {
    const result = formatSuccess([1, 2, 3]);
    expect(result.content[0].text).toBe(JSON.stringify([1, 2, 3], null, 2));
  });

  it("handles null", () => {
    const result = formatSuccess(null);
    expect(result.content[0].text).toBe("null");
  });
});

describe("formatError", () => {
  it("formats Error instances", () => {
    const result = formatError(new Error("something broke"));
    expect(result.isError).toBe(true);
    expect(result.content[0].type).toBe("text");
    expect(result.content[0].text).toContain("something broke");
  });

  it("formats string errors", () => {
    const result = formatError("bad request");
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("bad request");
  });

  it("formats unknown errors", () => {
    const result = formatError(42);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBeDefined();
  });
});
