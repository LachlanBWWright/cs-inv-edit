import { describe, expect, it } from "vitest";
import { shouldShowAccountScreen } from "./account-route.js";

describe("shouldShowAccountScreen", () => {
  it("opens sign-in immediately when no account is signed in", () => {
    expect(
      shouldShowAccountScreen({
        currentView: "inventory",
        connection: undefined,
        connectionLoading: true,
        hasSignedInAccount: false,
      }),
    ).toBe(true);
  });

  it("allows a persisted account time to restore its session", () => {
    expect(
      shouldShowAccountScreen({
        currentView: "inventory",
        connection: undefined,
        connectionLoading: true,
        hasSignedInAccount: true,
      }),
    ).toBe(false);
  });

  it("opens sign-in when session restoration finishes disconnected", () => {
    expect(
      shouldShowAccountScreen({
        currentView: "inventory",
        connection: undefined,
        connectionLoading: false,
        hasSignedInAccount: true,
      }),
    ).toBe(true);
  });

  it("keeps application screens available while connected", () => {
    expect(
      shouldShowAccountScreen({
        currentView: "inventory",
        connection: { state: "connected" },
        connectionLoading: false,
        hasSignedInAccount: true,
      }),
    ).toBe(false);
  });
});
