import { describe, expect, it } from "vitest";
import type { SteamAccountProfile } from "@cs-inv-edit/contracts";
import { createShellController } from "../shell/controller.js";
import { selectAccountForSignIn } from "./account-controller.js";

const account: SteamAccountProfile = {
  accountName: "second-user",
  avatarUrl: undefined,
  lastSignedInAt: "2026-09-11T00:00:00.000Z",
  signedIn: false,
  steamId: "76561198000000000",
};

describe("selectAccountForSignIn", () => {
  it("opens the login-only screen even when another account is connected", () => {
    const shell = createShellController("inventory");
    shell.setSelectedItemId("item-1");

    selectAccountForSignIn(shell, account);

    expect(shell.accountUsername()).toBe("second-user");
    expect(shell.accountLoginOnly()).toBe(true);
    expect(shell.selectedItemId()).toBeUndefined();
    expect(shell.view()).toBe("account");
  });
});
