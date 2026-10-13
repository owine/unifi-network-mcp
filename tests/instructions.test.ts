import { describe, it, expect } from "vitest";
import { serverInstructions } from "../src/instructions.js";

describe("serverInstructions", () => {
  it("tells the model where site IDs come from", () => {
    expect(serverInstructions(true)).toContain("unifi_list_sites");
  });

  it("says write tools are absent in read-only mode", () => {
    const text = serverInstructions(true);
    expect(text).toMatch(/read-only/i);
    expect(text).not.toContain("dryRun");
  });

  it("explains the dryRun and confirm workflow when writes are enabled", () => {
    const text = serverInstructions(false);
    expect(text).toContain("dryRun");
    expect(text).toContain("confirm");
    expect(text).not.toMatch(/read-only/i);
  });
});
