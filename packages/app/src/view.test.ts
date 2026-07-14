import { describe, expect, it } from "vitest";
import { modeForScreen, type AppMode } from "./view.js";

describe("application mode", () => {
  it("has exactly the Inventory and Armory modes", () => {
    const modes = ["inventory", "armory"] satisfies AppMode[];
    expect(modes).toEqual(["inventory", "armory"]);
  });

  it("keeps Armory selected instead of falling back to Inventory", () => {
    expect(modeForScreen("armory")).toBe("armory");
  });
});
