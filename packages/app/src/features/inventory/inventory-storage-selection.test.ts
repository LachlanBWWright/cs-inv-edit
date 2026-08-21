import { describe, expect, it } from "vitest";
import type { InventoryItemDto } from "@cs-inv-edit/contracts";
import {
  storageMoveCandidates,
  storageSelectionLimit,
} from "./inventory-storage-selection.js";

const item = (
  id: string,
  storageEligible?: boolean,
): InventoryItemDto => ({
  id,
  name: id,
  kind: "weapon_skin",
  storageEligible,
});

describe("storage move selection", () => {
  it("only exposes explicitly eligible items and never the target unit", () => {
    const unit: InventoryItemDto = {
      id: "unit",
      name: "Storage Unit",
      kind: "storage_unit",
      storageEligible: true,
    };

    expect(
      storageMoveCandidates(
        [unit, item("eligible", true), item("unknown"), item("blocked", false)],
        unit,
      ).map((candidate) => candidate.id),
    ).toEqual(["eligible"]);
  });

  it("limits selection to the unit's remaining capacity", () => {
    expect(
      storageSelectionLimit({
        id: "unit",
        name: "Storage Unit",
        kind: "storage_unit",
        storageCount: 998,
      }),
    ).toBe(2);
    expect(
      storageSelectionLimit({
        id: "unit",
        name: "Storage Unit",
        kind: "storage_unit",
        storageCount: 1_000,
      }),
    ).toBe(0);
  });
});
