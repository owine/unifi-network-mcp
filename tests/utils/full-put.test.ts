import { describe, it, expect } from "vitest";
import { withResourceLock } from "../../src/utils/full-put.js";

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
