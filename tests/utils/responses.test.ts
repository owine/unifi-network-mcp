import { describe, it, expect } from "vitest";
import { formatSuccess, formatError, errorMessage } from "../../src/utils/responses.js";

describe("formatSuccess", () => {
  it("wraps data as compact JSON text content", () => {
    // Indentation adds ~20% tokens to every result and tells the model nothing.
    const result = formatSuccess({ id: "abc", name: "test" });
    expect(result).toEqual({
      content: [{ type: "text", text: '{"id":"abc","name":"test"}' }],
    });
  });

  it("handles arrays", () => {
    const result = formatSuccess([1, 2, 3]);
    expect(result.content[0].text).toBe(JSON.stringify([1, 2, 3]));
  });

  it("handles null", () => {
    const result = formatSuccess(null);
    expect(result.content[0].text).toBe("null");
  });

  it("emits structuredContent when opts.structured=true and data is a plain object", () => {
    const payload = { id: "abc", name: "test" };
    const result = formatSuccess(payload, { structured: true });
    expect(result.structuredContent).toEqual(payload);
  });

  it("does NOT emit structuredContent for arrays or null even when structured=true", () => {
    expect(formatSuccess([1, 2, 3], { structured: true }).structuredContent).toBeUndefined();
    expect(formatSuccess(null, { structured: true }).structuredContent).toBeUndefined();
  });
});

describe("errorMessage", () => {
  it("returns an Error's message", () => {
    expect(errorMessage(new Error("something broke"))).toBe("something broke");
  });

  it("stringifies anything else", () => {
    expect(errorMessage("bad request")).toBe("bad request");
    expect(errorMessage(42)).toBe("42");
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

  it("names the network cause behind a bare fetch failure", () => {
    const err = new TypeError("fetch failed", { cause: Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" }) });
    expect(formatError(err).content[0].text).toBe("Error: fetch failed (ECONNREFUSED)");
  });

  // The codes Node raises against a console's self-signed certificate,
  // depending on how the certificate and chain look and whether the host is an IP.
  it.each([
    "SELF_SIGNED_CERT_IN_CHAIN",
    "DEPTH_ZERO_SELF_SIGNED_CERT",
    "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
    "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
    "ERR_TLS_CERT_ALTNAME_INVALID",
  ])("points a %s failure at the TLS setting", (code) => {
    const err = new TypeError("fetch failed", { cause: Object.assign(new Error("certificate"), { code }) });
    const text = formatError(err).content[0].text;
    expect(text).toContain("UNIFI_NETWORK_CA_CERT");
    // VERIFY_SSL=false is refused for api.ui.com, so it is never the advice.
    expect(text).not.toContain("UNIFI_NETWORK_VERIFY_SSL");
  });

  it.each(["CERT_HAS_EXPIRED", "CERT_NOT_YET_VALID"])("tells a %s failure that pinning does not lift the dates", (code) => {
    const err = new TypeError("fetch failed", { cause: Object.assign(new Error("certificate"), { code }) });
    const text = formatError(err).content[0].text;
    expect(text).toContain("validity dates");
    expect(text).toContain("does not override");
  });
});
