import { describe, it, expect } from "vitest";
import { REDACTED, redactSecrets, restoreRedacted } from "../../src/utils/secrets.js";

describe("redactSecrets", () => {
  it.each(["passphrase", "password", "secret", "sharedSecret"])("redacts %s at any depth", (key) => {
    const redacted = redactSecrets({ a: [{ b: { [key]: "hunter2" } }] });
    expect(JSON.stringify(redacted)).not.toContain("hunter2");
    expect(redacted).toEqual({ a: [{ b: { [key]: REDACTED } }] });
  });
});

describe("restoreRedacted", () => {
  it("refuses to write the placeholder as a real passphrase", () => {
    // Switching an OPEN SSID to WPA2 while echoing the placeholder would
    // otherwise set the publicly known string "[REDACTED]" as the key.
    expect(() => restoreRedacted(
      { securityConfiguration: { type: "WPA2_PERSONAL", passphrase: REDACTED } },
      { securityConfiguration: { type: "OPEN" } }
    )).toThrow(/no existing value to keep/);
  });

  it("keeps the stored passphrase for an echoed placeholder", () => {
    expect(restoreRedacted(
      { securityConfiguration: { type: "WPA2_PERSONAL", passphrase: REDACTED } },
      { securityConfiguration: { type: "WPA2_PERSONAL", passphrase: "correct-horse" } }
    )).toEqual({ securityConfiguration: { type: "WPA2_PERSONAL", passphrase: "correct-horse" } });
  });
});
