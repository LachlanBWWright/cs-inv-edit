import { describe, expect, it } from "vitest";
import { shouldStartSteamQR } from "./AccountView.js";

describe("shouldStartSteamQR", () => {
  it("waits for the initial connection status", () => {
    expect(shouldStartSteamQR(undefined, true)).toBe(false);
  });

  it("does not start a second QR session for a connected login-only view", () => {
    expect(shouldStartSteamQR({ state: "connected" }, false)).toBe(false);
  });

  it("starts QR after status loading finishes without an active session", () => {
    expect(shouldStartSteamQR(undefined, false)).toBe(true);
  });
});
