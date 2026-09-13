import { describe, expect, it } from "vitest";
import { shouldStartSteamQR, steamQrLoadingText } from "./AccountView.js";

describe("shouldStartSteamQR", () => {
  it("waits for the initial connection status", () => {
    expect(shouldStartSteamQR(undefined, true)).toBe(false);
  });

  it("does not start a second QR session for the connected account", () => {
    expect(shouldStartSteamQR({ state: "connected" }, false, false)).toBe(
      false,
    );
  });

  it("allows the initial QR session when switching accounts from a connected session", () => {
    expect(shouldStartSteamQR({ state: "connected" }, false, true)).toBe(true);
  });

  it.each([
    "connecting",
    "awaiting_qr",
    "needs_steam_guard",
    "session_conflict",
  ] as const)("does not start while the %s state is active", (state) => {
    expect(shouldStartSteamQR({ state }, false)).toBe(false);
  });

  it("starts QR after status loading finishes without an active session", () => {
    expect(shouldStartSteamQR(undefined, false)).toBe(true);
  });

  it("restarts QR after an error state", () => {
    expect(shouldStartSteamQR({ state: "error" }, false)).toBe(true);
  });
});

describe("steamQrLoadingText", () => {
  it("prioritizes rendering a challenge over request status", () => {
    expect(
      steamQrLoadingText(
        { state: "awaiting_qr", qrChallengeUrl: "steam://challenge" },
        true,
        true,
      ),
    ).toBe("Rendering secure QR code…");
  });

  it("shows the backend detail while connection setup is active", () => {
    expect(
      steamQrLoadingText(
        { state: "connecting", detail: "Connecting to a Steam CM…" },
        true,
        false,
      ),
    ).toBe("Connecting to a Steam CM…");
  });

  it("shows the backend detail while waiting for a QR challenge", () => {
    expect(
      steamQrLoadingText(
        { state: "awaiting_qr", detail: "Creating the current QR code…" },
        false,
        false,
      ),
    ).toBe("Creating the current QR code…");
  });

  it("uses the default connecting message when no detail is supplied", () => {
    expect(steamQrLoadingText({ state: "connecting" }, false, false)).toBe(
      "Finishing Steam sign-in…",
    );
  });

  it("explains a slow request and preserves backend errors", () => {
    expect(steamQrLoadingText(undefined, true, true)).toBe(
      "Still waiting for Steam to create a sign-in session…",
    );
    expect(
      steamQrLoadingText(
        { state: "error", detail: "Steam QR login: context deadline exceeded" },
        false,
        false,
      ),
    ).toBe("Steam QR login: context deadline exceeded");
  });

  it("has clear defaults when no request has started", () => {
    expect(steamQrLoadingText(undefined, false, false)).toBe(
      "Preparing QR sign-in…",
    );
    expect(steamQrLoadingText({ state: "error" }, false, false)).toBe(
      "Steam could not create a QR sign-in session.",
    );
  });
});
