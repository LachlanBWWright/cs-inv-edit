import type { LocalAgentClient } from "@cs-inv-edit/app";
import type { DesktopApi } from "../preload/index.js";
import { describe, expect, it } from "vitest";

type MissingMethods = Exclude<keyof LocalAgentClient, keyof DesktopApi>;

describe("desktop preload contract", () => {
  it("implements every LocalAgentClient method", () => {
    const noMissingMethods: MissingMethods extends never ? true : false = true;
    expect(noMissingMethods).toBe(true);
  });
});
