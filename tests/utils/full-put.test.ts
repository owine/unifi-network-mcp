import { describe, it, expect } from "vitest";
import { asObject, mergeForPut, missingFields, withResourceLock } from "../../src/utils/full-put.js";

describe("withResourceLock", () => {
  it("does not let a failed cycle block one queued behind it", async () => {
    const failing = withResourceLock("/r/1", () => Promise.reject(new Error("PUT failed")));
    const queued = withResourceLock("/r/1", () => Promise.resolve("next"));
    await expect(failing).rejects.toThrow("PUT failed");
    await expect(queued).resolves.toBe("next");
  });

  it("runs cycles on one resource in order", async () => {
    const events: string[] = [];
    const cycle = (name: string, ms: number) => withResourceLock("/r/2", async () => {
      events.push(`${name} start`);
      await new Promise((resolve) => setTimeout(resolve, ms));
      events.push(`${name} end`);
    });
    await Promise.all([cycle("a", 10), cycle("b", 0)]);
    expect(events).toEqual(["a start", "a end", "b start", "b end"]);
  });

  it("does not make different resources wait on each other", async () => {
    let releaseSlow!: () => void;
    const slow = withResourceLock("/r/3", () => new Promise<void>((resolve) => (releaseSlow = resolve)));
    await expect(withResourceLock("/r/4", () => Promise.resolve("done"))).resolves.toBe("done");
    releaseSlow();
    await slow;
  });
});

describe("mergeForPut", () => {
  it("keeps current fields, overlays updates, sends null and drops the rest", () => {
    expect(mergeForPut(
      { id: "r1", name: "a", enabled: true, note: "x", metadata: { origin: "USER" } },
      { name: undefined, enabled: false, note: null, metadata: {} },
      ["name", "enabled", "note"]
    )).toEqual({ name: "a", enabled: false, note: null });
  });
});

describe("missingFields", () => {
  it("treats null as missing, since a required field cannot be cleared", () => {
    expect(missingFields({ a: null, b: 1 }, ["a", "b", "c"])).toEqual(["a", "c"]);
  });
});

describe("asObject", () => {
  it.each([["an array", []], ["null", null], ["a string", "x"]])("rejects %s", (_label, value) => {
    expect(() => asObject(value, "the current rule")).toThrow(/the current rule/);
  });
});
