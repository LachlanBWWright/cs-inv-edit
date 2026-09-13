import { describe, expect, it } from "vitest";
import { documentTitleForScreen } from "./app-document-title.js";

describe("documentTitleForScreen", () => {
  it("names the active CS2 screen", () => {
    expect(documentTitleForScreen("inventory")).toBe(
      "Inventory",
    );
  });

  it("keeps similarly named screens distinct", () => {
    expect(documentTitleForScreen("tf2-store")).toBe(
      "TF2 Store",
    );
    expect(documentTitleForScreen("store")).toBe(
      "CS2 Store",
    );
  });

  it("names the account screen", () => {
    expect(documentTitleForScreen("account")).toBe(
      "Account",
    );
  });
});
