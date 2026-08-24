import path from "node:path";

type BackendPlatform =
  | "aix"
  | "android"
  | "darwin"
  | "freebsd"
  | "haiku"
  | "linux"
  | "openbsd"
  | "sunos"
  | "win32"
  | "cygwin"
  | "netbsd";

export type BackendPathOptions = {
  platform: BackendPlatform;
  isPackaged: boolean;
  resourcesPath: string;
  developmentDirectory: string;
  override?: string;
};

export function resolveBackendPath({
  platform,
  isPackaged,
  resourcesPath,
  developmentDirectory,
  override,
}: BackendPathOptions): string {
  if (override) return override;

  const binaryName = platform === "win32" ? "cs2-backend.exe" : "cs2-backend";
  return isPackaged
    ? path.join(resourcesPath, "bin", binaryName)
    : path.resolve(developmentDirectory, "../../../../bin", binaryName);
}
