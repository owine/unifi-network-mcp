import { describe, expect, it } from "vitest";
import { pick } from "../../src/utils/pick.js";

describe("pick", () => {
  it("copies only the listed fields", () => {
    expect(pick({ _id: "a", name: "b", x_secret: "c" }, ["_id", "name"])).toEqual({ _id: "a", name: "b" });
  });

  it("leaves out a listed field the record does not have, and keeps a null one", () => {
    expect(pick({ _id: "a", name: null }, ["_id", "name", "vlan"])).toEqual({ _id: "a", name: null });
  });

  it("does not read a listed field from the prototype", () => {
    expect(pick(Object.create({ inherited: true }) as Record<string, unknown>, ["inherited"])).toEqual({});
  });
});
