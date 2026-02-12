import { describe, it, expect } from "vitest";
import {
  READ_ONLY,
  WRITE,
  WRITE_NOT_IDEMPOTENT,
  DESTRUCTIVE,
  formatDryRun,
  requireConfirmation,
} from "../../src/utils/safety.js";

describe("annotation constants", () => {
  it("READ_ONLY is read-only, not destructive", () => {
    expect(READ_ONLY.readOnlyHint).toBe(true);
    expect(READ_ONLY.destructiveHint).toBe(false);
  });

  it("WRITE is not read-only, not destructive, idempotent", () => {
    expect(WRITE.readOnlyHint).toBe(false);
    expect(WRITE.destructiveHint).toBe(false);
    expect(WRITE.idempotentHint).toBe(true);
  });

  it("WRITE_NOT_IDEMPOTENT is not read-only, not destructive, not idempotent", () => {
    expect(WRITE_NOT_IDEMPOTENT.readOnlyHint).toBe(false);
    expect(WRITE_NOT_IDEMPOTENT.destructiveHint).toBe(false);
    expect(WRITE_NOT_IDEMPOTENT.idempotentHint).toBe(false);
  });

  it("DESTRUCTIVE is not read-only, destructive, not idempotent", () => {
    expect(DESTRUCTIVE.readOnlyHint).toBe(false);
    expect(DESTRUCTIVE.destructiveHint).toBe(true);
    expect(DESTRUCTIVE.idempotentHint).toBe(false);
  });
});

describe("formatDryRun", () => {
  it("returns dry-run preview without body", () => {
    const result = formatDryRun("GET", "/sites/abc/devices");
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.dryRun).toBe(true);
    expect(parsed.wouldExecute.method).toBe("GET");
    expect(parsed.wouldExecute.path).toBe("/sites/abc/devices");
    expect(parsed.wouldExecute.body).toBeUndefined();
  });

  it("includes body when provided", () => {
    const body = { name: "test", enabled: true };
    const result = formatDryRun("POST", "/sites/abc/networks", body);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.dryRun).toBe(true);
    expect(parsed.wouldExecute.method).toBe("POST");
    expect(parsed.wouldExecute.body).toEqual(body);
  });
});

describe("requireConfirmation", () => {
  it("returns null when confirm is true", () => {
    expect(requireConfirmation(true, "delete all")).toBeNull();
  });

  it("returns error when confirm is false", () => {
    const result = requireConfirmation(false, "delete all");
    expect(result).not.toBeNull();
    expect(result!.isError).toBe(true);
    expect(result!.content[0].text).toContain("delete all");
    expect(result!.content[0].text).toContain("confirm");
  });

  it("returns error when confirm is undefined", () => {
    const result = requireConfirmation(undefined, "remove device");
    expect(result).not.toBeNull();
    expect(result!.isError).toBe(true);
  });
});
