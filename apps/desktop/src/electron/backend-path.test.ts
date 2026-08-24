import { describe, expect, it } from "vitest";
import { resolveBackendPath } from "./backend-path.js";

const commonOptions = {
  resourcesPath: "/app/resources",
  developmentDirectory: "/repo/apps/desktop/dist/electron",
};

describe("resolveBackendPath", () => {
  it.each([
    ["linux", "linux", "cs2-backend"],
    ["macOS", "darwin", "cs2-backend"],
    ["Windows", "win32", "cs2-backend.exe"],
  ] as const)("uses the %s backend filename", (_label, platform, filename) => {
    expect(
      resolveBackendPath({
        ...commonOptions,
        platform,
        isPackaged: true,
      }),
    ).toBe(`/app/resources/bin/${filename}`);
  });

  it("resolves the packaged backend from Electron resources", () => {
    expect(
      resolveBackendPath({
        ...commonOptions,
        platform: "linux",
        isPackaged: true,
      }),
    ).toBe("/app/resources/bin/cs2-backend");
  });

  it("resolves the development backend from the repository bin directory", () => {
    expect(
      resolveBackendPath({
        ...commonOptions,
        platform: "darwin",
        isPackaged: false,
      }),
    ).toBe("/repo/bin/cs2-backend");
  });

  it("honors an explicit backend override on every platform", () => {
    expect(
      resolveBackendPath({
        ...commonOptions,
        platform: "win32",
        isPackaged: true,
        override: "C:\\custom\\cs2-backend.exe",
      }),
    ).toBe("C:\\custom\\cs2-backend.exe");
  });
});
