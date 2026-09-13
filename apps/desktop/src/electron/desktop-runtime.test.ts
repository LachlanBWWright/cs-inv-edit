import { describe, expect, it } from "vitest";
import { isAllowedExternalUrl } from "./external-url.js";

describe("isAllowedExternalUrl", () => {
  it.each([
    "https://steamcommunity.com/id/example",
    "https://store.steampowered.com/buyitem/730/1",
    "https://swap.gg/item/123",
    "steam://run/730//+csgo_econ_action_preview%20ABC123",
    "steam://rungame/440/0/+tf_econ_item_preview%20ABC123",
  ])("allows approved URL %s", (url) => {
    expect(isAllowedExternalUrl(url)).toBe(true);
  });

  it.each([
    "javascript:alert(1)",
    "http://steamcommunity.com/id/example",
    "https://steamcommunity.com.evil.example/id/example",
    "https://user:password@steamcommunity.com/id/example",
    "https://127.0.0.1:7331/health",
    "steam://run/730//+csgo_econ_action_preview%20javascript:alert(1)",
    "steam://run/570//+csgo_econ_action_preview%20ABC123",
  ])("rejects unapproved URL %s", (url) => {
    expect(isAllowedExternalUrl(url)).toBe(false);
  });
});
