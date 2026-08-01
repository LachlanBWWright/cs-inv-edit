import { describe, expect, it } from "vitest";
import { modeDetails, modeGroups } from "./sidebar-mode-data.js";

describe("sidebar mode data", () => {
  it("keeps each game's primary modes in their intended order", () => {
    const cs2 = modeGroups.find((group) => group.label === "Counter-Strike 2");
    const tf2 = modeGroups.find((group) => group.label === "Team Fortress 2");

    expect(
      cs2?.modes.slice(0, 3).map((mode) => modeDetails[mode].label),
    ).toEqual(["Inventory", "Activity & progression", "Loadouts"]);
    expect(
      tf2?.modes.slice(0, 3).map((mode) => modeDetails[mode].label),
    ).toEqual(["Inventory", "Match history", "Campaigns"]);
  });
});
