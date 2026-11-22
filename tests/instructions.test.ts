import { describe, it, expect } from "vitest";
import { serverInstructions } from "../src/instructions.js";

describe("serverInstructions", () => {
  it("tells the model where site IDs come from", () => {
    expect(serverInstructions(true)).toContain("unifi_list_sites");
  });

  it("gives the MAC address form and quote escaping filters need", () => {
    // A filter on an upper-case MAC matches nothing, which reads as absence.
    for (const text of [serverInstructions(true), serverInstructions(false)]) {
      expect(text).toContain("aa:bb:cc:dd:ee:ff");
      expect(text).toContain("name.eq('Bob''s iPhone')");
    }
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

describe("serverInstructions with UNIFI_NETWORK_WRITE_TOOLS", () => {
  it("names the enabled write tools", () => {
    const text = serverInstructions(false, { writeTools: ["unifi_update_wifi", "unifi_create_voucher"] });
    expect(text).toContain("only these write tools: unifi_update_wifi, unifi_create_voucher");
    expect(text).toContain("dryRun");
  });

  it("says nothing can change when no write tools are enabled", () => {
    const text = serverInstructions(false, { writeTools: [] });
    expect(text).toContain("No write tools are enabled");
    expect(text).not.toContain("dryRun");
  });

  it("is unchanged when the variable is unset", () => {
    expect(serverInstructions(false, {})).toBe(serverInstructions(false));
    expect(serverInstructions(false)).not.toContain("only these write tools");
  });
});

describe("serverInstructions and WAN exposure", () => {
  it("says WAN-exposing writes are refused, by default", () => {
    expect(serverInstructions(false)).toMatch(/refused outright, and confirm does not override that/);
  });

  it("drops that line when the operator allows WAN exposure", () => {
    expect(serverInstructions(false, { allowWanExposure: true })).not.toContain("refused outright");
  });

  it("does not mention it when no write tool can run", () => {
    expect(serverInstructions(true)).not.toContain("refused outright");
    expect(serverInstructions(false, { writeTools: [] })).not.toContain("refused outright");
  });
});
